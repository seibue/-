/**
 * api/_ops.js — 서버리스 운영 하드닝 공유 헬퍼 (레이트리밋 + 에러 리포팅)
 *
 * Vercel은 `_` 접두 파일을 라우트로 만들지 않으므로 안전한 공용 모듈이다.
 * 외부 의존성 0 — Vercel/Node 기본 모듈(https)만 사용.
 *
 * 레이트리밋은 인스턴스 메모리 기반의 "베스트에포트"다. 서버리스라 워밍된
 * 인스턴스 사이에서 카운터가 공유되진 않지만, 단일 클라이언트의 폭주/무한루프
 * 같은 명백한 남용은 막는다(니치 트래픽엔 충분, 새 인프라 불필요).
 */
const https = require("https");

const DEFAULT_WINDOW_MS = 60_000;
const buckets = new Map(); // key -> { count, resetAt }

/**
 * 슬라이딩 아님 — 고정 윈도우 카운터. now 주입 가능(테스트).
 * @returns {{ ok:boolean, remaining:number, limit:number, retryAfterSec:number, resetAt:number }}
 */
function rateLimit(key, limit, options = {}) {
  const windowMs = Number(options.windowMs) || DEFAULT_WINDOW_MS;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  // 메모리 누수 방지: 가끔 만료 버킷 청소
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }
  const remaining = Math.max(0, limit - bucket.count);
  return {
    ok: bucket.count <= limit,
    remaining,
    limit,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    resetAt: bucket.resetAt,
  };
}

/** x-forwarded-for(프록시 앞단) → 클라이언트 IP. 실패 시 소켓 주소/unknown. */
function clientKey(request) {
  const header = request && request.headers && request.headers["x-forwarded-for"];
  const raw = Array.isArray(header) ? header[0] : String(header || "");
  const ip = raw.split(",")[0].trim();
  if (ip) return ip;
  return (request && request.socket && request.socket.remoteAddress) || "unknown";
}

/** 429 응답 + 표준 헤더. Express/Node 응답 양쪽 지원. */
function tooMany(response, rl, apiVersion) {
  const headers = {
    "Retry-After": String(rl.retryAfterSec),
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  };
  if (typeof response.status === "function") {
    response.status(429);
    Object.entries(headers).forEach(([k, v]) => response.setHeader(k, v));
    response.send(`요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도하세요. ${apiVersion || ""}`.trim());
    return;
  }
  response.writeHead(429, headers);
  response.end(`요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도하세요. ${apiVersion || ""}`.trim());
}

const ALERT_THROTTLE_MS = 5 * 60_000;
const lastAlertAt = new Map(); // context -> ts

/**
 * 에러 리포팅: 항상 구조화 로그(Vercel 로그 대시보드에 잡힘) +
 * ALERT_WEBHOOK_URL(Discord/Slack 호환) 설정 시 스로틀링된 웹훅 전송.
 * 절대 throw 하지 않는다.
 */
function reportError(context, error, extra = {}) {
  const message = error && error.message ? error.message : String(error);
  try {
    console.error(
      JSON.stringify({ level: "error", context, message, ...extra, at: new Date().toISOString() })
    );
  } catch (_) {
    console.error(`[${context}]`, message);
  }
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;
  const now = Date.now();
  const last = lastAlertAt.get(context) || 0;
  if (now - last < ALERT_THROTTLE_MS) return; // 같은 지점 5분 내 반복 알림 억제
  lastAlertAt.set(context, now);
  postWebhook(webhook, `🚨 전적몬 API 오류 [${context}] ${message}`);
}

function postWebhook(webhookUrl, text) {
  try {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:") return;
    const payload = JSON.stringify({ content: text.slice(0, 1800) });
    const req = https.request(
      url,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => res.resume() // 응답 소비만
    );
    req.on("error", () => {}); // 알림 실패는 무시
    req.write(payload);
    req.end();
  } catch (_) {
    // 웹훅 URL 파싱 실패 등은 무시
  }
}

module.exports = { rateLimit, clientKey, tooMany, reportError };
// 테스트에서 상태 초기화용
module.exports._reset = () => {
  buckets.clear();
  lastAlertAt.clear();
};
