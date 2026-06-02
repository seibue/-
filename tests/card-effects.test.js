/**
 * js/card-effects.js 단위 테스트 (모듈 분리 안전망)
 * 순수 함수(normalizeEffectText, autoTranslateEffectText)와
 * 팩토리가 주입 의존성으로 동작하는지 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const cardEffects = require("../js/card-effects.js");

const { normalizeEffectText, autoTranslateEffectText, createCardEffects } = cardEffects;

test("normalizeEffectText: CRLF 정규화 + 과도한 빈 줄 축소 + trim", () => {
  assert.equal(normalizeEffectText("  a\r\nb\n\n\n\nc  "), "a\nb\n\nc");
  assert.equal(normalizeEffectText(null), "");
});

test("autoTranslateEffectText: 주요 키워드/태그를 한글로 변환", () => {
  assert.match(autoTranslateEffectText("[On Play]"), /\[등장 시\]/);
  assert.match(autoTranslateEffectText("[When Digivolving]"), /\[진화 시\]/);
  assert.match(autoTranslateEffectText("Draw 1 card from your deck."), /덱에서 1장 드로우한다\./);
});

test("createCardEffects: 공개 API를 반환한다", () => {
  const api = createCardEffects({
    normalizeCardNumber: (v) => String(v || "").toUpperCase(),
    render: () => {},
    renderKeepingDeckScroll: () => {},
    state: { cardEffectCache: {}, previewCardNo: "", modal: null },
    effectLoadingCards: new Set(),
    CARD_EFFECT_CACHE_KEY: "test-key",
    REMOTE_CARD_API_URL: "https://example.com",
    KOREAN_CARD_EFFECTS: {},
  });
  assert.equal(typeof api.fetchAndCacheCardEffect, "function");
  assert.equal(typeof api.staticKoreanOfficialEffect, "function");
  assert.equal(typeof api.normalizeRemoteEffect, "function");
});

test("staticKoreanOfficialEffect: 정발 효과 데이터를 표준 형태로 변환", () => {
  const api = createCardEffects({
    normalizeCardNumber: (v) => String(v || "").toUpperCase(),
    render: () => {},
    renderKeepingDeckScroll: () => {},
    state: { cardEffectCache: {}, previewCardNo: "", modal: null },
    effectLoadingCards: new Set(),
    CARD_EFFECT_CACHE_KEY: "test-key",
    REMOTE_CARD_API_URL: "https://example.com",
    KOREAN_CARD_EFFECTS: {
      "BT1-001": { name: "아구몬", mainEffect: "메인 효과 텍스트", sourceEffect: "" },
    },
  });
  const effect = api.staticKoreanOfficialEffect("bt1-001");
  assert.equal(effect.cardNumber, "BT1-001");
  assert.equal(effect.name, "아구몬");
  assert.equal(effect.source, "kr");
  assert.equal(effect.hasEffect, true);
  assert.equal(effect.staticCache, true);
  assert.equal(api.staticKoreanOfficialEffect("ZZ9-999"), null);
});

test("normalizeRemoteEffect: 영문 키 변형을 흡수하고 hasEffect 판정", () => {
  const api = createCardEffects({
    normalizeCardNumber: (v) => String(v || "").toUpperCase(),
    render: () => {},
    renderKeepingDeckScroll: () => {},
    state: { cardEffectCache: {}, previewCardNo: "", modal: null },
    effectLoadingCards: new Set(),
    CARD_EFFECT_CACHE_KEY: "test-key",
    REMOTE_CARD_API_URL: "https://example.com",
    KOREAN_CARD_EFFECTS: {},
  });
  const result = api.normalizeRemoteEffect({ id: "bt1-010", main_effect: "Main Effect Do something." });
  assert.equal(result.cardNumber, "BT1-010");
  assert.equal(result.mainEffect, "Do something.");
  assert.equal(result.hasEffect, true);
  assert.equal(api.normalizeRemoteEffect(null), null);
});
