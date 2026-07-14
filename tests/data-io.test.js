/**
 * js/data-io.js — 브라우저 IO 액션 단위 테스트 (트랙 B 안전망)
 * Node에서 검증 가능한 로직(내보내기 텍스트/코드/페이로드, 전체 삭제 흐름)만 다룬다.
 * FileReader/Blob/클립보드 경로는 브라우저 E2E로 확인.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const dataIOModule = require("../js/data-io.js");

function makeEnv({ confirmAnswers = [true, true] } = {}) {
  const g = globalThis;
  const saved = { confirm: g.confirm };
  let confirmCall = 0;
  g.confirm = () => confirmAnswers[Math.min(confirmCall++, confirmAnswers.length - 1)];

  let data = {
    settings: {},
    decks: [{ id: "d1", name: "블루 덱", colors: ["blue"], note: "", cards: [] }],
    tournaments: [],
    matches: [{ id: "m1" }],
  };
  const state = { selected: new Set(), filters: {}, memoOnly: true, cloudConflict: { x: 1 }, authUser: null, undoSnapshots: {}, toasts: [] };
  const calls = { toasts: [], undos: [], recoveryPoints: [], saves: 0, renders: 0 };

  const IO = dataIOModule.createDataIO({
    APP_VERSION: "test-ver",
    getData: () => data,
    setData: (next) => {
      data = next;
    },
    state,
    saveData: () => (calls.saves += 1),
    cloneDataSnapshot: (src = data) => JSON.parse(JSON.stringify(src)),
    saveRecoveryPoint: (snap, reason) => calls.recoveryPoints.push(reason),
    notifyUndo: (title) => calls.undos.push(title),
    mergeData: (d) => d,
    createDefaultData: () => ({ settings: {}, decks: [], tournaments: [], matches: [] }),
    normalizeDeck: (d) => ({ name: "이름 없는 덱", colors: ["blue"], note: "", cards: [], ...d }),
    deckCards: (deck) => deck.cards || [],
    sortDeckCards: (cards) => [...cards],
    deckLimitViolation: () => "",
    safeFileName: (n) => n,
    todayISO: () => "2026-07-15",
    dataSummary: () => "요약",
    formatSyncTime: () => "시각",
    cardDataSummary: () => ({ catalogCount: 2 }),
    cardDataCommandsText: () => "cmd",
    dailyShareText: () => "",
    parseDeckImportSource: () => [],
    enrichImportedDecks: async (d) => d,
    normalizeImportedDeck: (d) => d,
    notifyToast: (title, message, tone) => calls.toasts.push({ title, tone }),
    closeModal: () => {},
    render: () => (calls.renders += 1),
  });

  return { IO, state, calls, getData: () => data, restoreGlobals: () => (g.confirm = saved.confirm) };
}

const sampleDeck = {
  name: "테스트 덱",
  cards: [
    { cardNumber: "BT1-010", name: "아구몬", type: "digimon", level: "3", count: 4 },
    { cardNumber: "BT1-001", name: "코로몬", type: "digiEgg", level: "2", count: 4 },
    { cardNumber: "BT1-084", name: "오메가몬", type: "digimon", level: "7", count: 2 },
  ],
};

test("deckExportText: 메인/디지타마 분리 + '매수 번호 이름' 형식", () => {
  const { IO, restoreGlobals } = makeEnv();
  try {
    const text = IO.deckExportText(sampleDeck);
    assert.ok(text.startsWith("덱 이름: 테스트 덱"));
    const mainIdx = text.indexOf("메인 덱");
    const eggIdx = text.indexOf("디지타마");
    assert.ok(mainIdx >= 0 && eggIdx > mainIdx);
    assert.ok(text.includes("4 BT1-010 아구몬"));
    assert.ok(text.indexOf("4 BT1-001 코로몬") > eggIdx); // 디지타마는 뒤 섹션
  } finally {
    restoreGlobals();
  }
});

test("deckExportCodeText: digimonmeta 배열 — 매수만큼 반복", () => {
  const { IO, restoreGlobals } = makeEnv();
  try {
    const entries = JSON.parse(IO.deckExportCodeText(sampleDeck));
    assert.equal(entries[0], "Exported from digimonmeta.com");
    assert.equal(entries.filter((e) => e === "BT1-010").length, 4);
    assert.equal(entries.filter((e) => e === "BT1-084").length, 2);
    assert.equal(entries.length, 1 + 4 + 2 + 4);
  } finally {
    restoreGlobals();
  }
});

test("createDeckExportPayload: 형식/필드 보존 + text 포함", () => {
  const { IO, restoreGlobals } = makeEnv();
  try {
    const payload = IO.createDeckExportPayload(sampleDeck);
    assert.equal(payload.format, "jeonjeokmon-deck-v1");
    assert.equal(payload.deck.name, "테스트 덱");
    assert.equal(payload.deck.cards.length, 3);
    assert.deepEqual(Object.keys(payload.deck.cards[0]).sort(), ["cardNumber", "count", "level", "name", "type"]);
    assert.ok(payload.text.includes("메인 덱"));
  } finally {
    restoreGlobals();
  }
});

test("clearAllData: confirm 수락 시 초기화 + 복구지점 + undo + 상태 리셋", () => {
  const env = makeEnv();
  try {
    env.IO.clearAllData();
    assert.deepEqual(env.getData().decks, []);
    assert.deepEqual(env.calls.recoveryPoints, ["전체 삭제 전"]);
    assert.deepEqual(env.calls.undos, ["전체 삭제됨"]);
    assert.equal(env.calls.saves, 1);
    assert.equal(env.calls.renders, 1);
    assert.equal(env.state.memoOnly, false);
    assert.equal(env.state.cloudConflict, null);
  } finally {
    env.restoreGlobals();
  }
});

test("clearAllData: confirm 거절 시 아무것도 안 함", () => {
  const env = makeEnv({ confirmAnswers: [false] });
  try {
    env.IO.clearAllData();
    assert.equal(env.getData().decks.length, 1);
    assert.equal(env.calls.saves, 0);
    assert.equal(env.calls.renders, 0);
  } finally {
    env.restoreGlobals();
  }
});

test("clearAllData: 로그인 중엔 2차 confirm까지 통과해야 실행", () => {
  const env = makeEnv({ confirmAnswers: [true, false] });
  try {
    env.state.authUser = { email: "x@y.com" };
    env.IO.clearAllData();
    assert.equal(env.getData().decks.length, 1); // 2차 거절 → 취소
    assert.equal(env.calls.saves, 0);
  } finally {
    env.restoreGlobals();
  }
});
