/**
 * js/store.js 데이터 정규화 레이어 단위 테스트 (트랙 B 안전망)
 * 로드/저장/클라우드 병합의 정합성을 좌우하는 핵심 로직.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const storeModule = require("../js/store.js");
const format = require("../js/format.js");

function makeStore() {
  let counter = 0;
  return storeModule.createStore({
    uid: (prefix) => `${prefix}-${(counter += 1)}`,
    todayISO: () => "2026-06-03",
    normalizeCardNumber: (v) => String(v || "").replace(/[^a-z0-9-]/gi, "").toUpperCase(),
    normalizeLevel: (v) => String(v || "").replace(/\D/g, "").slice(0, 1),
    cardTypeLabels: { digimon: "디지몬", option: "옵션", tamer: "테이머", digiEgg: "디지타마", other: "기타" },
    TOURNAMENT_FORMAT_OPTIONS: [["mixed", "x"], ["swiss", "x"], ["top", "x"]],
    ROUND_STAGE_OPTIONS: [["none", "x"], ["swiss", "x"], ["top", "x"]],
    normalizeGameStats: format.normalizeGameStats,
    singleGameStats: format.singleGameStats,
    resultFromGameStats: format.resultFromGameStats,
    createDefaultData: () => ({ settings: {}, matchTypes: ["테이머 배틀", "친선전"], decks: [], tournaments: [], matches: [] }),
  });
}

test("normalizeCards: 같은 번호 합산(상한 4) + 필수값 누락 제외", () => {
  const store = makeStore();
  const cards = store.normalizeCards([
    { cardNumber: "bt1-001", name: "아구몬", level: "3", count: 3, type: "digimon" },
    { cardNumber: "BT1-001", name: "아구몬", count: 3, type: "digimon" }, // 합산 → 4 상한
    { cardNumber: "", name: "없음", count: 1 }, // 번호 없음 → 제외
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardNumber, "BT1-001");
  assert.equal(cards[0].count, 4);
});

test("normalizeCards: 매수 1~4 클램프, 알 수 없는 type은 digimon", () => {
  const store = makeStore();
  const cards = store.normalizeCards([{ cardNumber: "BT1-002", name: "x", count: 99, type: "weird" }]);
  assert.equal(cards[0].count, 4);
  assert.equal(cards[0].type, "digimon");
});

test("normalizeDeck: 기본값 + versions/cards 정규화", () => {
  const store = makeStore();
  const deck = store.normalizeDeck({ name: "", cards: [{ cardNumber: "BT1-001", name: "아구몬", count: 4 }] });
  assert.equal(deck.name, "이름 없는 덱");
  assert.deepEqual(deck.colors, ["blue"]);
  assert.equal(deck.cards.length, 1);
  assert.ok(Array.isArray(deck.versions));
});

test("normalizeMatch: 단판은 result 유지, 매치전은 게임스탯으로 결과 도출", () => {
  const store = makeStore();
  const single = store.normalizeMatch({ result: "loss", matchType: "친선전" });
  assert.equal(single.matchFormat, "single");
  assert.equal(single.result, "loss");
  const match = store.normalizeMatch({ matchFormat: "match", gameWins: 2, gameLosses: 1 });
  assert.equal(match.matchFormat, "match");
  assert.equal(match.result, "win"); // 2>1
});

test("normalizeMatch: '스토어 대회' matchType은 '매장 대표전'으로 치환", () => {
  const store = makeStore();
  assert.equal(store.normalizeMatch({ matchType: "스토어 대회" }).matchType, "매장 대표전");
  assert.equal(store.normalizeMatchTypeName("스토어 대회"), "매장 대표전");
});

test("normalizeMatch: 잘못된 roundStage는 none으로", () => {
  const store = makeStore();
  assert.equal(store.normalizeMatch({ roundStage: "garbage" }).roundStage, "none");
  assert.equal(store.normalizeMatch({ roundStage: "swiss" }).roundStage, "swiss");
});

test("normalizeMatchTypes: 중복 제거 + 빈 배열이면 기본값", () => {
  const store = makeStore();
  assert.deepEqual(store.normalizeMatchTypes(["친선전", "친선전", "테이머 배틀"]), ["친선전", "테이머 배틀"]);
  assert.deepEqual(store.normalizeMatchTypes([]), ["테이머 배틀", "친선전"]);
});

test("mergeData: 배열 아닌 필드는 빈 배열/기본 + 각 항목 정규화", () => {
  const store = makeStore();
  const merged = store.mergeData({
    settings: { theme: "dark" },
    decks: [{ name: "내 덱", cards: [{ cardNumber: "bt1-001", name: "아구몬", count: 4 }] }],
    matches: "not-array",
  });
  assert.equal(merged.settings.theme, "dark");
  assert.equal(merged.decks.length, 1);
  assert.equal(merged.decks[0].cards[0].cardNumber, "BT1-001");
  assert.deepEqual(merged.matches, []);
  assert.ok(merged.matchTypes.length > 0);
});

test("normalizeTournament: 잘못된 format은 mixed, 이름 없으면 기본", () => {
  const store = makeStore();
  const t = store.normalizeTournament({ format: "garbage" });
  assert.equal(t.format, "mixed");
  assert.equal(t.name, "이름 없는 대회");
});

test("normalizeDeckVersions: createdAt 오름차순 정렬", () => {
  const store = makeStore();
  const versions = store.normalizeDeckVersions([
    { label: "v2", cards: [], createdAt: "2026-06-10T00:00:00.000Z" },
    { label: "v1", cards: [], createdAt: "2026-06-01T00:00:00.000Z" },
  ]);
  assert.equal(versions[0].label, "v1");
  assert.equal(versions[1].label, "v2");
});
