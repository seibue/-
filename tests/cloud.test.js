/**
 * js/cloud.js 단위 테스트 (트랙 B 안전망)
 * 네트워크/Supabase/DOM 의존이라 동기화 흐름 전체는 검증 불가.
 * 팩토리 API + 비교 헬퍼(comparableData/sameData) + setDataFromCloud 의 data/state 반영을 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const cloud = require("../js/cloud.js");

// 간단 mergeData: settings 보존 + 기본 배열 채움
function mergeData(source) {
  const s = source || {};
  return {
    settings: { ...(s.settings || {}) },
    matchTypes: s.matchTypes || [],
    decks: s.decks || [],
    tournaments: s.tournaments || [],
    matches: s.matches || [],
  };
}

function makeDeps(overrides = {}) {
  const store = new Map();
  if (typeof globalThis.localStorage !== "object" || !globalThis.localStorage) {
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  }
  let data = mergeData({});
  let client = null;
  const state = { suppressCloudSave: false, localSaveError: "", localSavedAt: "", cloudUpdatedAt: "" };
  return {
    deps: {
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "key",
      HAS_CLOUD_CONFIG: true,
      CLOUD_TABLE: "t",
      STORAGE_KEY: "storage-key",
      getCloudClient: () => client,
      setCloudClient: (c) => {
        client = c;
      },
      getData: () => data,
      setData: (v) => {
        data = v;
      },
      state,
      mergeData,
      createDefaultData: () => mergeData({}),
      recordDiagnostic: () => {},
      safeJsonSize: () => 0,
      notifyToast: () => {},
      updateAuthControls: () => {},
      render: () => {},
      dataSummary: () => "요약",
      ...overrides,
    },
    getData: () => data,
    state,
  };
}

test("createCloud: 공개 API를 반환한다", () => {
  const { deps } = makeDeps();
  const api = cloud.createCloud(deps);
  ["initializeCloudAuth", "loginWithGoogle", "logoutGoogle", "loadCloudNow", "saveCloudData", "scheduleCloudSave", "setDataFromCloud", "applyCloudConflictVersion", "keepLocalConflictVersion", "comparableData", "sameData"].forEach((name) => {
    assert.equal(typeof api[name], "function", `${name} 누락`);
  });
});

test("comparableData: lastLocalSavedAt 를 비교에서 제외", () => {
  const { deps } = makeDeps();
  const api = cloud.createCloud(deps);
  const c = api.comparableData({ settings: { lastLocalSavedAt: "2026-06-02", theme: "dark" } });
  assert.equal(c.settings.lastLocalSavedAt, undefined);
  assert.equal(c.settings.theme, "dark");
});

test("sameData: 저장 시각만 다른 데이터는 동일로 판정", () => {
  const { deps } = makeDeps();
  const api = cloud.createCloud(deps);
  const a = { settings: { lastLocalSavedAt: "2026-06-01" }, matches: [{ id: "m1" }] };
  const b = { settings: { lastLocalSavedAt: "2026-06-02" }, matches: [{ id: "m1" }] };
  assert.equal(api.sameData(a, b), true);
  const c = { settings: {}, matches: [{ id: "m2" }] };
  assert.equal(api.sameData(a, c), false);
});

test("setDataFromCloud: data 반영 + localStorage 저장 + suppress 플래그 복구", () => {
  const ctx = makeDeps();
  const api = cloud.createCloud(ctx.deps);
  api.setDataFromCloud({ settings: { lastLocalSavedAt: "2026-06-02" }, matches: [{ id: "m1" }] });
  assert.equal(ctx.getData().matches.length, 1);
  assert.equal(ctx.state.suppressCloudSave, false); // 끝나면 false 로 복구
  assert.equal(ctx.state.localSavedAt, "2026-06-02");
  assert.equal(globalThis.localStorage.getItem("storage-key") !== null, true);
});
