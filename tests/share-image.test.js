/**
 * js/share-image.js 스모크 테스트 (모듈 분리 안전망)
 * 캔버스/DOM/네트워크 의존이라 실제 렌더링은 검증 불가.
 * 팩토리가 공개 API를 올바르게 반환하는지만 확인한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const shareImage = require("../js/share-image.js");

function makeDeps() {
  const noop = () => {};
  return {
    todayISO: () => "2026-06-02",
    shareDateValue: () => "2026-06-02",
    shareDateTitle: (d) => d,
    shareRecordText: () => "",
    shareRateText: () => "",
    shareScoreText: () => "",
    shareGameScoreText: () => "",
    hasMatchGameBreakdown: () => false,
    dailyShareSummary: () => ({ stats: { total: 0 }, decks: [], matchups: [] }),
    dailyShareUsedDecks: () => [],
    dailyShareText: () => "",
    copyDailyShareText: noop,
    sortDeckCards: (c) => c,
    deckCards: () => [],
    deckCountSummary: () => ({ main: 0, digiEgg: 0, total: 0 }),
    normalizeDeck: (d) => d,
    normalizeCardNumber: (v) => v,
    shareCardImageSources: () => [],
    cardDisplayName: (c) => c,
    safeFileName: (n) => n,
    recordDiagnostic: noop,
    notifyToast: noop,
    state: { deckImageLayout: "x" },
    colorMap: {},
    DECK_LIMITS: { total: 55, main: 50, digiEgg: 5 },
    CARD_IMAGE_LOAD_TIMEOUT_MS: 7000,
  };
}

test("createShareImage: 공개 API 진입점을 반환한다", () => {
  const api = shareImage.createShareImage(makeDeps());
  assert.equal(typeof api.downloadDeckImage, "function");
  assert.equal(typeof api.downloadDailyShareImage, "function");
  assert.equal(typeof api.openDailyShareX, "function");
  assert.equal(typeof api.drawDailyShareImage, "function");
});

test("downloadDailyShareImage: 전적 없는 날짜는 안내 토스트 후 종료", async () => {
  const calls = [];
  const deps = makeDeps();
  deps.notifyToast = (title) => calls.push(title);
  const api = shareImage.createShareImage(deps);
  await api.downloadDailyShareImage("2026-06-02");
  assert.deepEqual(calls, ["공유할 전적 없음"]);
});
