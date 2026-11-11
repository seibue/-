// Aegis → 전적몬 자동 전적 (콘텐트 스크립트)
// 유저스크립트와 동일 로직이지만, 확장 격리환경이라 Aegis CSP/토글 문제가 없다.
// 토큰은 chrome.storage.sync 에서 읽는다(팝업에서 저장). 크로스오리진 POST는 fetch로
// (인제스트 엔드포인트가 aegis-digi.online 오리진을 CORS 허용).
(function () {
  "use strict";

  const INGEST_URL = "https://jeonjeokmon.vercel.app/api/aegis-ingest";
  const POLL_SECONDS = 60;
  const PREFIXES = ["red", "green", "blue", "yellow", "purple", "orange", "teal", "pink", "black", "white"];
  const SEEN_KEY = "jjm_aegis_seen_ids_v3";
  let API = "/api/red";
  let TOKEN = "";
  const log = (...a) => console.log("[전적몬]", ...a);

  function getToken() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(["aegisToken"], (r) => resolve((r && r.aegisToken) || ""));
      } catch (_) {
        resolve("");
      }
    });
  }

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

  async function detectApi() {
    for (const c of PREFIXES) {
      try {
        const r = await fetch(`/api/${c}/spectate/live?limit=1`, { credentials: "same-origin" });
        if (r.ok) {
          API = `/api/${c}`;
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

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
      if (!TOKEN) {
        TOKEN = await getToken();
        if (!TOKEN) {
          setStatus("토큰 미설정 — 확장 아이콘 눌러 연결", "#fda");
          return;
        }
      }
      let exp = await getJson("/account/matches/export");
      if (exp.status === 410 || exp.status === 404) {
        setStatus("API 주소 재감지 중…");
        await detectApi();
        exp = await getJson("/account/matches/export");
      }
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

  // 토큰이 팝업에서 바뀌면 즉시 반영
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.aegisToken) {
        TOKEN = changes.aegisToken.newValue || "";
        tick();
      }
    });
  } catch (_) {}

  setStatus("시작 중…");
  log("Aegis 연동(확장) 시작");
  (async () => {
    await detectApi();
    tick();
  })();
  setInterval(tick, POLL_SECONDS * 1000);
})();
