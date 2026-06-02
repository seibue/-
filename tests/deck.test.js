/**
 * js/deck.js 단위 테스트 (트랙 B 안전망)
 * 덱 편집(draft) 로직 — 매수 제한, 추가/증감, 구축 준비도, 복제 — 을 목 의존성으로 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const deckModule = require("../js/deck.js");

// addDraftCard 는 한도 안내에 브라우저 alert 를 사용 → node 테스트용 스텁
if (typeof globalThis.alert !== "function") globalThis.alert = () => {};

const DECK_LIMITS = { total: 55, main: 50, digiEgg: 5, digiEggReadyMin: 4 };
const cardTypeLabels = { digimon: "디지몬", option: "옵션", tamer: "테이머", digiEgg: "디지타마", other: "기타" };

function makeApi(stateOverride = {}, data = { decks: [] }) {
  let counter = 0;
  const state = { deckDraftCards: [], ...stateOverride };
  // 실제 app.js 의 공용 유틸과 동일하게 동작하는 간단 구현
  const normalizeCards = (cards) => (Array.isArray(cards) ? cards : []);
  const deckCountSummary = (cards, excludeId = "") =>
    normalizeCards(cards).reduce(
      (s, c) => {
        if (c.id === excludeId) return s;
        const n = Number(c.count) || 0;
        s.total += n;
        if (c.type === "digiEgg") s.digiEgg += n;
        else s.main += n;
        return s;
      },
      { total: 0, main: 0, digiEgg: 0 }
    );
  const deckLimitViolation = (cards) => {
    const s = deckCountSummary(cards);
    if (s.total > DECK_LIMITS.total) return "초과";
    if (s.main > DECK_LIMITS.main) return "메인 초과";
    if (s.digiEgg > DECK_LIMITS.digiEgg) return "디지타마 초과";
    return "";
  };
  const api = deckModule.createDeck({
    normalizeCards,
    normalizeCardNumber: (v) => String(v || "").trim().toUpperCase(),
    normalizeLevel: (v) => String(v || ""),
    uid: (prefix) => `${prefix}-${(counter += 1)}`,
    cardTypeLabels,
    DECK_LIMITS,
    state,
    getData: () => data,
    deckCards: (deck) => normalizeCards(deck?.cards || []),
    deckCountSummary,
    deckLimitViolation,
  });
  return { api, state };
}

test("catalogCardToDraft: 카탈로그 카드를 draft 카드로 변환", () => {
  const { api } = makeApi();
  const draft = api.catalogCardToDraft({ no: "EX5-001", level: "4", name: "그레이몬", type: "digimon" }, 3);
  assert.equal(draft.cardNumber, "EX5-001");
  assert.equal(draft.count, 3);
  assert.match(draft.id, /^card-/);
});

test("availableCopiesForCard: 같은 카드번호 4장 제한", () => {
  const { api } = makeApi();
  const cards = [{ id: "c1", cardNumber: "EX5-001", type: "digimon", count: 3 }];
  const avail = api.availableCopiesForCard(cards, { cardNumber: "EX5-001", type: "digimon" });
  assert.equal(avail, 1); // 4 - 3
});

test("addDraftCard: 신규 카드 추가 성공 + state 반영", () => {
  const { api, state } = makeApi();
  const ok = api.addDraftCard({ cardNumber: "EX5-001", level: "4", name: "그레이몬", type: "digimon" }, 2);
  assert.equal(ok, true);
  assert.equal(state.deckDraftCards.length, 1);
  assert.equal(state.deckDraftCards[0].count, 2);
});

test("addDraftCard: 필수값 누락 시 실패", () => {
  const { api, state } = makeApi();
  const ok = api.addDraftCard({ cardNumber: "", level: "", name: "", type: "digimon" });
  assert.equal(ok, false);
  assert.equal(state.deckDraftCards.length, 0);
});

test("addDraftCard: 기존 카드면 수량 합산(4장 상한)", () => {
  const { api, state } = makeApi({ deckDraftCards: [{ id: "c1", cardNumber: "EX5-001", level: "4", name: "그레이몬", type: "digimon", count: 3 }] });
  api.addDraftCard({ cardNumber: "EX5-001", level: "4", name: "그레이몬", type: "digimon" }, 2);
  assert.equal(state.deckDraftCards.length, 1);
  assert.equal(state.deckDraftCards[0].count, 4); // 3 + 1(상한)
});

test("changeDraftCardCount: 1장에서 감소하면 제거", () => {
  const { api, state } = makeApi({ deckDraftCards: [{ id: "c1", cardNumber: "EX5-001", type: "digimon", count: 1 }] });
  api.changeDraftCardCount("c1", -1);
  assert.equal(state.deckDraftCards.length, 0);
});

test("cardNumberOverLimit: 같은 번호 4장 초과 감지", () => {
  const { api } = makeApi();
  assert.equal(api.cardNumberOverLimit([{ cardNumber: "EX5-001", count: 5 }]), "EX5-001");
  assert.equal(api.cardNumberOverLimit([{ cardNumber: "EX5-001", count: 4 }]), "");
});

test("deckReadiness: 메인50+디지타마4~5면 제출 준비 완료", () => {
  const { api } = makeApi();
  // 서로 다른 번호로 메인 50장 구성 (각 번호 4장 이하: 12×4 + 1×2 = 50)
  const cards = [];
  for (let i = 0; i < 12; i += 1) cards.push({ cardNumber: `MAIN-${i}`, type: "digimon", count: 4 });
  cards.push({ cardNumber: "MAIN-12", type: "digimon", count: 2 });
  cards.push({ cardNumber: "EGG-1", type: "digiEgg", count: 4 });
  assert.equal(api.deckReadiness(cards).level, "ready");
  assert.equal(api.deckReadiness([]).level, "empty");
});

test("deckReadiness: 같은 번호 5장이면 제한 초과(danger)", () => {
  const { api } = makeApi();
  assert.equal(api.deckReadiness([{ cardNumber: "X", type: "digimon", count: 5 }]).level, "danger");
});

test("deckLevelCounts: 레벨/테이머/옵션 집계", () => {
  const { api } = makeApi();
  const counts = api.deckLevelCounts([
    { type: "digimon", level: "3", count: 4 },
    { type: "tamer", count: 2 },
    { type: "option", count: 3 },
  ]);
  assert.equal(counts["3"], 4);
  assert.equal(counts.T, 2);
  assert.equal(counts.O, 3);
});

test("cloneDeck: 새 id + '복사본' 이름 + 카드 id 재발급", () => {
  const { api } = makeApi({}, { decks: [{ name: "내 덱" }] });
  const clone = api.cloneDeck({ name: "내 덱", colors: ["red"], cards: [{ cardNumber: "EX5-001", count: 4 }] });
  assert.equal(clone.name, "내 덱 복사본");
  assert.match(clone.id, /^deck-/);
  assert.match(clone.cards[0].id, /^card-/);
});
