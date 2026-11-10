// 개인화된 Aegis 유저스크립트 서빙: ?token=... 을 받아 토큰이 박힌 .user.js 를 돌려준다.
// Tampermonkey가 설치/자동업데이트(@updateURL/@downloadURL)로 재요청하면 항상 최신 버전+토큰 유지.
// 설치 URL은 vercel.json 리라이트로 /aegis-connect.user.js?token=... (Tampermonkey는 .user.js 로 인식).
const { VERSION, aegisUserscriptBody } = require("./_aegis-userscript-template.js");

const SELF = "https://jeonjeokmon.vercel.app/aegis-connect.user.js";
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

function buildScript(token) {
  const installUrl = token ? `${SELF}?token=${encodeURIComponent(token)}` : SELF;
  const header = [
    "// ==UserScript==",
    "// @name         Aegis → 전적몬 자동 전적 기록",
    "// @namespace    https://jeonjeokmon.vercel.app/",
    `// @version      ${VERSION}`,
    "// @description  Aegis(aegis-digi.online) 매치 결과를 전적몬에 자동 기록합니다. (승/패 + 상대 덱 + 내 덱 자동 등록)",
    "// @match        https://aegis-digi.online/*",
    "// @run-at       document-idle",
    "// @grant        GM_xmlhttpRequest",
    "// @connect      jeonjeokmon.vercel.app",
    `// @updateURL    ${installUrl}`,
    `// @downloadURL  ${installUrl}`,
    "// ==/UserScript==",
  ].join("\n");
  let body = `(${aegisUserscriptBody.toString()})();`;
  if (token) body = body.replace('"__TOKEN__"', JSON.stringify(token));
  return `${header}\n${body}\n`;
}

module.exports = function handler(request, response) {
  // 토큰은 쿼리에서. 형식 안 맞으면 토큰 없는(수동) 버전으로 서빙.
  let token = "";
  try {
    const u = new URL(request.url, "https://jeonjeokmon.vercel.app");
    const t = u.searchParams.get("token") || "";
    if (TOKEN_RE.test(t)) token = t;
  } catch (_) {}
  response.setHeader("Content-Type", "text/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(200).send(buildScript(token));
};

module.exports.buildScript = buildScript;
