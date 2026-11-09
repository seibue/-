// Aegis(디지몬 TCG 시뮬) → 전적몬 자동 전적 인제스트 (1단계 MVP)
//
// Aegis 유저스크립트가 본인 매치를 모아 POST 하면, 개인 연동 토큰으로 사용자를 찾아
// Supabase(jeonjeokmon_user_data)의 본인 data.matches 에 추가한다. 중복은 externalId 로 제거.
//
// 보안:
// - SUPABASE_SERVICE_ROLE_KEY 는 서버 전용 env (절대 커밋/클라이언트 노출 금지).
// - 토큰은 사용자의 data.settings.aegisToken (본인만 아는 비밀). 토큰이 가리키는 그 사용자
//   한 명의 데이터에만 append 한다.
// - 레이트리밋 + 낙관적 잠금(updated_at)으로 사용자 본인 편집 덮어쓰기 방지.
const { rateLimit, clientKey, tooMany, reportError } = require("./_ops.js");
// card-catalog.js 는 `window.DIGIMON_CARD_CATALOG = [...]` 전역 파일이다.
// Node/Vercel 번들에서 실행되도록 global.window 를 먼저 심은 뒤 정적 require 로 로드(=번들에도 포함).
global.window = global.window || {};
require("../card-catalog.js");

const API_VERSION = "aegis-ingest-2";
const RATE_LIMIT_PER_MIN = 120; // 토큰/IP 조합당
const ALLOWED_ORIGIN = "https://aegis-digi.online";
const TABLE = "jeonjeokmon_user_data";
const MAX_MATCHES = 200;

function cors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// 카드번호 → {lv, name} 맵 (콜드스타트 1회 로드). 상대 덱 대표카드(아키타입) 해석용.
let _catalog = null;
function loadCatalog() {
  if (_catalog) return _catalog;
  _catalog = new Map();
  try {
    for (const c of (global.window && global.window.DIGIMON_CARD_CATALOG) || []) {
      _catalog.set(c.no, { lv: Number(c.lv) || 0, name: c.name || "", type: c.type || "" });
    }
  } catch (error) {
    reportError("aegis-ingest:catalog", error);
  }
  return _catalog;
}

// 상대 mainDeck(카드번호 배열) → 대표 카드 한글명. Aegis getDeckFeaturedCardId 근사
// (최고 레벨 디지몬, 동률이면 카드번호). DP는 우리 카탈로그에 없어 레벨까지만 사용.
function opponentArchetypeName(mainDeck) {
  if (!Array.isArray(mainDeck) || !mainDeck.length) return "";
  const cat = loadCatalog();
  const uniq = [...new Set(mainDeck.map(String))];
  const digimon = uniq
    .map((no) => ({ no, ...(cat.get(no) || { lv: 0, name: "", type: "" }) }))
    .filter((c) => c.type === "digimon" || (!c.type && c.lv >= 3));
  const pool = digimon.length ? digimon : uniq.map((no) => ({ no, ...(cat.get(no) || { lv: 0, name: "" }) }));
  pool.sort((a, b) => b.lv - a.lv || a.no.localeCompare(b.no));
  const top = pool[0];
  return top && top.name ? top.name : "";
}

// Aegis 매치 1건 → 전적몬 match 객체. 상대는 1단계에선 닉네임(opponentName)으로 저장.
function toJjmMatch(m, deckByName) {
  const result = ["win", "loss", "draw"].includes(m.result) ? m.result : "win";
  const finishedAt = Number(m.finishedAt) || Date.now();
  const date = new Date(finishedAt).toISOString().slice(0, 10);
  const deckName = typeof m.deckName === "string" ? m.deckName.trim() : "";
  const deckId = deckName && deckByName.get(deckName) ? deckByName.get(deckName) : "";
  // 상대: 2단계 — 상대 덱 대표카드(아키타입) > 상대 덱이름 > 닉네임
  const archetype = opponentArchetypeName(m.opponentMainDeck);
  const oppDeckName = typeof m.opponentDeckName === "string" ? m.opponentDeckName.trim() : "";
  const nick = typeof m.opponentName === "string" ? m.opponentName.trim() : "";
  const opponent = archetype || oppDeckName || nick || "상대 미기록";
  const nowIso = new Date().toISOString();
  return {
    id: `aegis_${String(m.id)}`,
    source: "aegis",
    externalId: String(m.id),
    deckId,
    date,
    matchType: "Aegis",
    opponent,
    result,
    playOrder: "unknown",
    tournamentId: "",
    roundStage: "none",
    roundLabel: "",
    matchFormat: "single",
    memo: [
      deckName && !deckId ? `덱: ${deckName}` : "",
      m.mode ? `모드: ${m.mode}` : "",
      nick ? `상대: ${nick}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    cardIds: [],
    cardNames: [],
    cardNumbers: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

async function findUserByToken(url, key, token) {
  const q = `${url}/rest/v1/${TABLE}?select=user_id,data,updated_at&data->settings->>aegisToken=eq.${encodeURIComponent(token)}&limit=1`;
  const r = await fetch(q, { headers: sbHeaders(key) });
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// 낙관적 잠금: updated_at 이 그대로일 때만 PATCH. 바뀌었으면 0행 → 재시도.
async function patchIfUnchanged(url, key, userId, prevUpdatedAt, nextData, nextUpdatedAt) {
  const q =
    `${url}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}` +
    `&updated_at=eq.${encodeURIComponent(prevUpdatedAt)}`;
  const r = await fetch(q, {
    method: "PATCH",
    headers: { ...sbHeaders(key), Prefer: "return=representation" },
    body: JSON.stringify({ data: nextData, updated_at: nextUpdatedAt }),
  });
  if (!r.ok) throw new Error(`patch ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0; // 1행이면 성공
}

module.exports = async function handler(request, response) {
  const origin = (request.headers && request.headers.origin) || "";
  cors(response, origin);
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    send(response, 405, { error: "method_not_allowed" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    reportError("aegis-ingest:config", new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"));
    send(response, 500, { error: "server_not_configured" });
    return;
  }

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = null;
    }
  }
  const token = body && typeof body.token === "string" ? body.token.trim() : "";
  const matches = body && Array.isArray(body.matches) ? body.matches.slice(0, MAX_MATCHES) : null;
  if (!token || token.length < 16 || !matches) {
    send(response, 400, { error: "invalid_request" });
    return;
  }

  const rl = rateLimit(`aegis-ingest:${token.slice(0, 8)}:${clientKey(request)}`, RATE_LIMIT_PER_MIN);
  if (!rl.ok) {
    tooMany(response, rl, API_VERSION);
    return;
  }

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await findUserByToken(url, key, token);
      if (!row) {
        send(response, 403, { error: "unknown_token" });
        return;
      }
      const data = row.data && typeof row.data === "object" ? row.data : {};
      const existing = Array.isArray(data.matches) ? data.matches : [];
      const seen = new Set(existing.filter((x) => x && x.source === "aegis" && x.externalId).map((x) => String(x.externalId)));
      const deckByName = new Map((Array.isArray(data.decks) ? data.decks : []).map((d) => [String(d.name || "").trim(), d.id]));

      const toAdd = [];
      for (const m of matches) {
        if (!m || m.id == null) continue;
        const ext = String(m.id);
        if (seen.has(ext)) continue;
        seen.add(ext);
        toAdd.push(toJjmMatch(m, deckByName));
      }
      if (toAdd.length === 0) {
        send(response, 200, { added: 0, skipped: matches.length });
        return;
      }
      const nextData = { ...data, matches: [...toAdd, ...existing] };
      const nextUpdatedAt = new Date().toISOString();
      const ok = await patchIfUnchanged(url, key, row.user_id, row.updated_at, nextData, nextUpdatedAt);
      if (ok) {
        send(response, 200, { added: toAdd.length, skipped: matches.length - toAdd.length });
        return;
      }
      // updated_at 바뀜(사용자가 그 사이 저장) → 재조회 후 재시도
    }
    send(response, 409, { error: "conflict_retry_later" });
  } catch (error) {
    reportError("aegis-ingest", error, { v: API_VERSION });
    send(response, 502, { error: "ingest_failed" });
  }
};

module.exports.toJjmMatch = toJjmMatch;
