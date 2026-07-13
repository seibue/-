/**
 * api/_ops.js — 레이트리밋/클라이언트키 단위 테스트
 * reportError의 웹훅 전송은 env(ALERT_WEBHOOK_URL) 없으면 no-op이라 네트워크를 타지 않는다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const ops = require("../api/_ops.js");

test("rateLimit: 한도 이내는 통과, 초과부터 차단", () => {
  ops._reset();
  const now = 1_000_000;
  let last;
  for (let i = 1; i <= 3; i += 1) last = ops.rateLimit("k", 3, { now });
  assert.equal(last.ok, true); // 3번째까지 OK
  assert.equal(last.remaining, 0);
  const over = ops.rateLimit("k", 3, { now });
  assert.equal(over.ok, false); // 4번째 차단
  assert.ok(over.retryAfterSec >= 1);
});

test("rateLimit: 윈도우 지나면 리셋", () => {
  ops._reset();
  ops.rateLimit("k", 1, { now: 0 });
  assert.equal(ops.rateLimit("k", 1, { now: 100 }).ok, false); // 같은 윈도우 → 차단
  assert.equal(ops.rateLimit("k", 1, { now: 60_001 }).ok, true); // 윈도우 경과 → 리셋
});

test("rateLimit: 키별로 독립 카운트", () => {
  ops._reset();
  ops.rateLimit("a", 1, { now: 0 });
  assert.equal(ops.rateLimit("a", 1, { now: 0 }).ok, false); // a 초과
  assert.equal(ops.rateLimit("b", 1, { now: 0 }).ok, true); // b는 별개
});

test("clientKey: x-forwarded-for 첫 IP 사용, 없으면 소켓/unknown", () => {
  assert.equal(ops.clientKey({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), "1.2.3.4");
  assert.equal(ops.clientKey({ headers: {}, socket: { remoteAddress: "9.9.9.9" } }), "9.9.9.9");
  assert.equal(ops.clientKey({ headers: {} }), "unknown");
});

test("tooMany: 429 + Retry-After 헤더 응답(Node 스타일)", () => {
  const res = {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(text) {
      this.body = text;
    },
  };
  ops.tooMany(res, { retryAfterSec: 30, limit: 60, remaining: 0 }, "v1");
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "30");
  assert.equal(res.headers["X-RateLimit-Limit"], "60");
  assert.match(res.body, /30초/);
});

test("reportError: 웹훅 env 없으면 throw 없이 로그만(no-op 전송)", () => {
  ops._reset();
  const prev = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  const origError = console.error;
  let logged = "";
  console.error = (line) => {
    logged = String(line);
  };
  try {
    assert.doesNotThrow(() => ops.reportError("test.ctx", new Error("boom"), { a: 1 }));
  } finally {
    console.error = origError;
    if (prev !== undefined) process.env.ALERT_WEBHOOK_URL = prev;
  }
  assert.match(logged, /test\.ctx/);
  assert.match(logged, /boom/);
});
