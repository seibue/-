// ==UserScript==
// @name         Aegis → 전적몬 자동 전적 기록
// @namespace    https://jeonjeokmon.vercel.app/
// @version      1.0.0
// @description  Aegis(aegis-digi.online) 매치 결과를 전적몬에 자동 기록합니다. (승/패 + 상대 아키타입)
// @match        https://aegis-digi.online/*
// @run-at       document-idle
// @grant        none
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
  const SEEN_KEY = "jjm_aegis_seen_ids";
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
    let el = document.getElementById("jjm-aegis-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "jjm-aegis-status";
      el.style.cssText =
        "position:fixed;right:10px;bottom:10px;z-index:99999;font:12px/1.4 sans-serif;" +
        "padding:6px 10px;border-radius:8px;background:rgba(10,15,25,.85);color:#cfe;" +
        "border:1px solid rgba(120,200,255,.4);pointer-events:none;max-width:260px";
      document.body.appendChild(el);
    }
    el.textContent = "전적몬: " + text;
    el.style.color = color || "#cfe";
  }

  async function getJson(path) {
    const r = await fetch(API + path, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  }

  // 상대 덱(공유 설정일 때만 제공) → mainDeck + 덱이름. 없으면 빈 값.
  async function fetchOpponentDeck(matchId) {
    const res = await getJson(`/account/matches/${encodeURIComponent(matchId)}/opponent-deck`);
    if (!res.ok) return {};
    const d = res.data || {};
    return { opponentMainDeck: Array.isArray(d.mainDeck) ? d.mainDeck : [], opponentDeckName: d.deckName || "" };
  }

  async function postMatches(matches) {
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, matches }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body && body.error) || `HTTP ${r.status}`);
    return body;
  }

  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const exp = await getJson("/account/matches/export");
      if (!exp.ok) {
        // 401/403 = 로그인 안 됨
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
      // 새 매치마다 상대 덱 조회(병렬, 과하지 않게 상한)
      const BATCH = fresh.slice(0, 25);
      const payload = [];
      for (const m of BATCH) {
        const opp = await fetchOpponentDeck(m.id);
        payload.push({
          id: m.id,
          result: m.result,
          deckName: m.deckName || "",
          opponentName: m.opponentName || "",
          finishedAt: m.finishedAt,
          mode: m.mode || "",
          ...opp,
        });
      }
      const res = await postMatches(payload);
      BATCH.forEach((m) => seen.add(String(m.id)));
      saveSeen(seen);
      log("전송 완료", res);
      setStatus(`추가 ${res.added || 0}건 완료 ✓`, "#9f9");
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
