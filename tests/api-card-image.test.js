/**
 * api/card-image.js SSRF 가드 단위 테스트
 * 이미지 프록시가 허용 호스트(digimoncard.com) + https 만 통과시키는지 검증.
 * 허용 케이스는 실제 네트워크를 타므로 검증하지 않고, 거부 로직만 확인한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/card-image.js");
const { isAllowedImageUrl, imageUrlFromRequest } = handler;

test("isAllowedImageUrl: https + 허용 호스트만 통과", () => {
  assert.equal(isAllowedImageUrl(new URL("https://digimoncard.com/images/cardlist/card/BT1-001.png")), true);
  assert.equal(isAllowedImageUrl(new URL("http://digimoncard.com/x.png")), false); // http 거부
  assert.equal(isAllowedImageUrl(new URL("https://evil.example.com/x.png")), false); // 다른 호스트 거부
  assert.equal(isAllowedImageUrl(new URL("https://digimoncard.com.evil.com/x.png")), false); // 서브도메인 위장 거부
});

test("imageUrlFromRequest: 유효 src만 URL 반환, 그 외 null", () => {
  const ok = imageUrlFromRequest({ url: "/api/card-image?src=" + encodeURIComponent("https://digimoncard.com/a.png") });
  assert.ok(ok instanceof URL);
  assert.equal(ok.hostname, "digimoncard.com");
  assert.equal(imageUrlFromRequest({ url: "/api/card-image" }), null); // src 없음
  assert.equal(
    imageUrlFromRequest({ url: "/api/card-image?src=" + encodeURIComponent("https://evil.com/a.png") }),
    null
  ); // 허용되지 않은 호스트
});

// req.query(Vercel 스타일)도 지원하는지
test("imageUrlFromRequest: request.query.src 경로도 지원", () => {
  const url = imageUrlFromRequest({ url: "/api/card-image", query: { src: "https://digimoncard.com/b.png" } });
  assert.ok(url instanceof URL);
  assert.equal(url.pathname, "/b.png");
});

// 거부 경로는 네트워크 없이 400을 동기 응답하는지 (mock res)
function mockRes() {
  return {
    statusCode: null,
    body: null,
    writeHead(code) {
      this.statusCode = code;
    },
    end(text) {
      this.body = text;
    },
  };
}

test("handler: 허용되지 않은 src는 네트워크 없이 400", () => {
  const res = mockRes();
  handler({ url: "/api/card-image?src=" + encodeURIComponent("http://evil.com/x.png") }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /invalid image source/);
});

test("handler: src 누락도 400", () => {
  const res = mockRes();
  handler({ url: "/api/card-image" }, res);
  assert.equal(res.statusCode, 400);
});
