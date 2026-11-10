// ==UserScript==
// @name         Aegis → 전적몬 자동 전적 기록
// @namespace    https://jeonjeokmon.vercel.app/
// @version      1.0.2
// @description  Aegis(aegis-digi.online) 매치 결과를 전적몬에 자동 기록합니다. (승/패 + 상대 덱 + 내 덱 자동 등록)
// @match        https://aegis-digi.online/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      jeonjeokmon.vercel.app
// ==/UserScript==
(function () {
  "use strict";

  // ───────────────────────────────────────────────────────────────────
  // 설정: 전적몬 설정 > "Aegis 연동"에서 발급한 토큰을 아래에 붙여넣으세요.
  const TOKEN = "여기에_전적몬_연동_토큰_붙여넣기";
  const INGEST_URL = "https://jeonjeokmon.vercel.app/api/aegis-ingest";
  const POLL_SECONDS = 60; // export는 분당 3회 제한이라 60초 권장
  // ───────────────────────────────────────────────────────────────────

  const API = "/api/green";
  const SEEN_KEY = "jjm_aegis_seen_ids_v2"; // v2: 내 덱 자동등록 반영 위해 과거 전적 1회 재동기화
  const log = (...a) => console.log("[전적몬]", ...a);

  function loadSeen() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
    } catch (_) {
      return new Set();
    }
  }
  function saveSeen(set) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-2000)));
    } catch (_) {}
  }

  function setStatus(text, color) {
    try {
      let el = document.getElementById("jjm-aegis-status");
      if (!el) {
        el = document.createElement("div");
        el.id = "jjm-aegis-status";
        el.style.cssText =
          "position:fixed;right:10px;bottom:10px;z-index:2147483647;font:12px/1.4 sans-serif;" +
          "padding:6px 10px;border-radius:8px;background:rgba(10,15,25,.9);color:#cfe;" +
          "border:1px solid rgba(120,200,255,.5);pointer-events:none;max-width:260px";
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = "전적몬: " + text;
      el.style.color = color || "#cfe";
    } catch (_) {}
  }

  // 스크립트가 실행되는 즉시 배지를 띄운다(주입 여부를 바로 확인할 수 있게).
  setStatus("시작 중…");

  async function getJson(path) {
    const r = await fetch(API + path, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  }

  async function fetchOpponentDeck(matchId) {
    const res = await getJson(`/account/matches/${encodeURIComponent(matchId)}/opponent-deck`);
    if (!res.ok) return {};
    const d = res.data || {};
    return { opponentMainDeck: Array.isArray(d.mainDeck) ? d.mainDeck : [], opponentDeckName: d.deckName || "" };
  }

  // 내 덱(ownDeck): Aegis 덱ID + 이름 + 카드리스트 → 전적몬 덱 자동 등록용
  async function fetchOwnDeck(matchId) {
    const res = await getJson(`/account/matches/${encodeURIComponent(matchId)}/own-deck`);
    if (!res.ok) return null;
    const d = res.data || {};
    return {
      deckId: d.deckId || "",
      deckName: d.deckName || "",
      mainDeck: Array.isArray(d.mainDeck) ? d.mainDeck : [],
      eggDeck: Array.isArray(d.eggDeck) ? d.eggDeck : [],
    };
  }

  // 크로스오리진 POST는 GM_xmlhttpRequest로(페이지 CSP/CORS 우회).
  function postMatches(matches) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: INGEST_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ token: TOKEN, matches }),
        onload: (resp) => {
          let body = {};
          try {
            body = JSON.parse(resp.responseText || "{}");
          } catch (_) {}
          if (resp.status >= 200 && resp.status < 300) resolve(body);
          else reject(new Error((body && body.error) || `HTTP ${resp.status}`));
        },
        onerror: () => reject(new Error("network")),
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const exp = await getJson("/account/matches/export");
      if (!exp.ok) {
        setStatus(exp.status === 401 || exp.status === 403 ? "Aegis 로그인 필요" : `조회 실패(${exp.status})`, "#fda");
        return;
      }
      const all = (exp.data && exp.data.matches) || [];
      const seen = loadSeen();
      const fresh = all.filter((m) => m && m.id != null && !seen.has(String(m.id)));
      if (!fresh.length) {
        setStatus(`최신 (총 ${all.length}전)`, "#bfe");
        return;
      }
      setStatus(`새 전적 ${fresh.length}건 처리 중…`);
      const BATCH = fresh.slice(0, 25);
      const payload = [];
      for (const m of BATCH) {
        const opp = await fetchOpponentDeck(m.id);
        const ownDeck = await fetchOwnDeck(m.id);
        payload.push({
          id: m.id,
          result: m.result,
          deckName: m.deckName || "",
          opponentName: m.opponentName || "",
          finishedAt: m.finishedAt,
          mode: m.mode || "",
          ...opp,
          ...(ownDeck ? { ownDeck } : {}),
        });
      }
      const res = await postMatches(payload);
      BATCH.forEach((m) => seen.add(String(m.id)));
      saveSeen(seen);
      log("전송 완료", res);
      const parts = [`추가 ${res.added || 0}`];
      if (res.updated) parts.push(`보강 ${res.updated}`);
      if (res.decksCreated) parts.push(`덱 ${res.decksCreated}`);
      setStatus(`${parts.join(" · ")} 완료 ✓`, "#9f9");
    } catch (e) {
      log("오류", e);
      setStatus("전송 오류: " + (e.message || e), "#f99");
    } finally {
      running = false;
    }
  }

  if (!TOKEN || TOKEN.startsWith("여기에")) {
    setStatus("토큰 미설정 — 스크립트 상단 TOKEN 입력", "#fda");
    return;
  }
  log("Aegis 연동 시작");
  tick();
  setInterval(tick, POLL_SECONDS * 1000);
})();
