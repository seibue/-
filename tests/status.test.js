/**
 * js/status.js — 데이터/동기화 상태 요약 헬퍼 단위 테스트 (트랙 B 안전망)
 * 읽기 전용 로직의 동작 보존 + getData/getCloudClient 게터의 최신값 반영을 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const statusModule = require("../js/status.js");

function makeStatus(overrides = {}) {
  const base = {
    data: {
      settings: {},
      decks: [{ id: "sample-1" }],
      tournaments: [],
      matches: [{ id: "sample-2", deckId: "sample-1", date: "2026-07-01" }],
    },
    state: {},
    cloudClient: null,
  };
  const env = { ...base, ...overrides };
  const status = statusModule.createStatus({
    getData: () => env.data,
    state: env.state,
    getCloudClient: () => env.cloudClient,
    mergeData: (d) => d, // 정규화 자체는 store 테스트에서 검증 → 통과시킴
    createDefaultData: () => ({ decks: [], tournaments: [], matches: [] }),
    CARD_CATALOG: env.CARD_CATALOG || [{ no: "BT1-001" }, { no: "" }],
    KOREAN_CARD_EFFECTS: env.KOREAN_CARD_EFFECTS || {
      "BT1-001": { fetchedAt: "2026-07-01T00:00:00.000Z" },
      "BT1-002": { fetchedAt: "2026-07-10T00:00:00.000Z" },
    },
    normalizeCardNumber: (v) => String(v || "").toUpperCase(),
    ADMIN_EMAILS: ["seibue63@gmail.com"],
    matchDateTime: (m) => new Date(`${m?.date || ""}T00:00:00`).getTime() || 0,
    formatDate: (d) => `날짜(${d})`,
  });
  return { status, env };
}

test("dataSummary: 덱/대회/전 수 요약 + 인자 없으면 최신 data", () => {
  const { status } = makeStatus();
  assert.equal(status.dataSummary(), "1덱 · 0대회 · 1전");
  assert.equal(status.dataSummary({ decks: [], tournaments: [{}], matches: [{}, {}] }), "0덱 · 1대회 · 2전");
});

test("cardDataSummary: 카탈로그 수·이미지 누락·최신 효과 시각", () => {
  const { status } = makeStatus();
  const summary = status.cardDataSummary();
  assert.equal(summary.catalogCount, 2);
  assert.equal(summary.missingImageCount, 1); // no가 빈 카드 1장
  assert.equal(summary.effectCount, 2);
  assert.equal(summary.latestEffectFetch, "2026-07-10T00:00:00.000Z");
});

test("userEmail/isAdminUser: user_metadata 폴백 + 대소문자 무시", () => {
  const { status, env } = makeStatus();
  assert.equal(status.userEmail(), "");
  env.state.authUser = { user_metadata: { email: "SEIBUE63@GMAIL.COM" } };
  assert.equal(status.userEmail(), "SEIBUE63@GMAIL.COM");
  assert.equal(status.isAdminUser(), true);
  env.state.authUser = { email: "other@x.com" };
  assert.equal(status.isAdminUser(), false);
});

test("syncTone: 상태 우선순위 (danger > warn > busy > ok > offline)", () => {
  const { status, env } = makeStatus();
  assert.equal(status.syncTone(), "offline");
  env.state.cloudSaving = true;
  assert.equal(status.syncTone(), "busy");
  env.state.cloudConflict = true;
  assert.equal(status.syncTone(), "warn");
  env.state.cloudError = "err";
  assert.equal(status.syncTone(), "danger");
  Object.assign(env.state, { cloudError: "", cloudConflict: false, cloudSaving: false, authUser: {}, cloudReady: true });
  assert.equal(status.syncTone(), "ok");
});

test("cloudStatusText: cloudClient 게터로 최신값 반영", () => {
  const { status, env } = makeStatus();
  assert.equal(status.cloudStatusText(), "Supabase 설정을 확인해 주세요"); // client 없음
  env.cloudClient = {}; // 재할당 시뮬레이션
  env.state.authUser = null;
  assert.equal(status.cloudStatusText(), "로그인하면 클라우드 데이터 불러오기");
  env.state.authUser = {};
  env.state.cloudSaving = true;
  assert.equal(status.cloudStatusText(), "클라우드 저장 중");
});

test("formatSyncTime: 유효/무효 입력", () => {
  const { status } = makeStatus();
  assert.equal(status.formatSyncTime(""), "");
  assert.equal(status.formatSyncTime("garbage"), "");
  assert.match(status.formatSyncTime("2026-07-14T10:30:00+09:00"), /07.*14.*10.*30/);
});

test("backupStatusInfo: 없음→warn, 7일↑→warn, 30일↑→danger, 최근→ok", () => {
  const { status, env } = makeStatus();
  assert.equal(status.backupStatusInfo().tone, "warn"); // 기록 없음
  env.data.settings.lastBackupAt = new Date(Date.now() - 40 * 86400000).toISOString();
  assert.equal(status.backupStatusInfo().tone, "danger");
  env.data.settings.lastBackupAt = new Date(Date.now() - 10 * 86400000).toISOString();
  assert.equal(status.backupStatusInfo().tone, "warn");
  env.data.settings.lastBackupAt = new Date().toISOString();
  assert.equal(status.backupStatusInfo().tone, "ok");
});

test("isSampleId/hasRealDecks/hasRealMatches/shouldShowStarterGuide", () => {
  const { status, env } = makeStatus();
  assert.equal(status.isSampleId("sample-1"), true);
  assert.equal(status.isSampleId("deck-1"), false);
  assert.equal(status.hasRealDecks(), false); // sample만 있음
  assert.equal(status.shouldShowStarterGuide(), true);
  env.data.decks.push({ id: "deck-1" });
  env.data.matches.push({ id: "match-1" });
  assert.equal(status.hasRealDecks(), true);
  assert.equal(status.shouldShowStarterGuide(), false);
  env.data.settings.dismissedStarterGuide = true;
  env.data.decks.length = 0;
  assert.equal(status.shouldShowStarterGuide(), false); // 닫았으면 항상 숨김
});

test("deckColorText: 라벨 매핑 + 빈 배열은 블루", () => {
  const { status } = makeStatus();
  assert.equal(status.deckColorText(["red", "black"]), "레드 / 블랙");
  assert.equal(status.deckColorText([]), "블루");
  assert.equal(status.deckColorText(["pink"]), "pink"); // 미지 색은 그대로
});

test("deckLastUsedLabel: 최근 사용 매치 날짜, 없으면 안내문", () => {
  const { status, env } = makeStatus();
  env.data.matches.push({ id: "m2", deckId: "sample-1", date: "2026-07-10" });
  assert.equal(status.deckLastUsedLabel("sample-1"), "날짜(2026-07-10)");
  assert.equal(status.deckLastUsedLabel("none"), "사용 기록 없음");
});
