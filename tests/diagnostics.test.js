/**
 * js/diagnostics.js 단위 테스트 (모듈 분리 안전망)
 * 순수 함수(safeDiagnosticDetail)와 팩토리 동작을 localStorage 목으로 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const diagnostics = require("../js/diagnostics.js");

const { createDiagnostics, safeDiagnosticDetail } = diagnostics;

test("safeDiagnosticDetail: 객체는 깊은 복사, 그 외는 빈 객체", () => {
  const input = { a: 1, b: { c: 2 } };
  const copy = safeDiagnosticDetail(input);
  assert.deepEqual(copy, input);
  assert.notEqual(copy, input);
  assert.deepEqual(safeDiagnosticDetail(null), {});
  assert.deepEqual(safeDiagnosticDetail("text"), {});
});

test("safeDiagnosticDetail: 순환 참조는 안전 메시지로 대체", () => {
  const circular = {};
  circular.self = circular;
  assert.deepEqual(safeDiagnosticDetail(circular), { note: "detail serialization failed" });
});

// localStorage / window / navigator 최소 목
function withBrowserMocks(run) {
  const store = new Map();
  const g = globalThis;
  const saved = {
    localStorage: g.localStorage,
    window: g.window,
    navigator: g.navigator,
  };
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  g.window = { location: { href: "https://test/" } };
  g.navigator = { userAgent: "test-agent", onLine: true };
  try {
    return run(store);
  } finally {
    g.localStorage = saved.localStorage;
    g.window = saved.window;
    g.navigator = saved.navigator;
  }
}

function makeDeps() {
  return {
    DIAGNOSTIC_KEY: "diag-key",
    APP_VERSION: "test-version",
    getData: () => ({ decks: [], tournaments: [], matches: [] }),
    state: { cloudUpdatedAt: "", cloudError: "", localSavedAt: "", localSaveError: "", tab: "home" },
    formatSyncTime: () => "방금",
    userEmail: () => "",
    cloudStatusText: () => "",
    dataSummary: () => ({}),
    safeJsonSize: () => 0,
    cardDataSummary: () => ({}),
    todayISO: () => "2026-06-02",
    notifyToast: () => {},
    render: () => {},
  };
}

test("createDiagnostics: 공개 API를 반환한다", () => {
  const api = createDiagnostics(makeDeps());
  ["diagnosticEntries", "recordDiagnostic", "diagnosticStatusInfo", "diagnosticPayload", "downloadDiagnostics", "clearDiagnostics"].forEach((name) => {
    assert.equal(typeof api[name], "function", `${name} 누락`);
  });
});

test("recordDiagnostic → diagnosticEntries: 기록을 저장하고 최신순으로 읽는다", () => {
  withBrowserMocks(() => {
    const api = createDiagnostics(makeDeps());
    assert.deepEqual(api.diagnosticEntries(), []);
    api.recordDiagnostic("test-event", "첫 기록", { foo: 1 });
    api.recordDiagnostic("error-event", "두번째");
    const entries = api.diagnosticEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].type, "error-event"); // 최신이 앞
    assert.equal(entries[1].type, "test-event");
    assert.equal(entries[1].appVersion, "test-version");
  });
});

test("diagnosticStatusInfo: error 타입 포함 시 warn 톤", () => {
  withBrowserMocks(() => {
    const api = createDiagnostics(makeDeps());
    assert.equal(api.diagnosticStatusInfo().tone, "ok");
    api.recordDiagnostic("cloud-save-failed", "x");
    assert.equal(api.diagnosticStatusInfo().tone, "warn");
  });
});
