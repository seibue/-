/**
 * js/persistence.js — 저장/복구/undo 데이터 레이어 단위 테스트 (트랙 B 안전망)
 * localStorage/confirm 은 전역 목으로 대체(diagnostics.test.js 패턴).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const persistenceModule = require("../js/persistence.js");

function makeMockStorage(failSet = false) {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failSet) throw new Error("QuotaExceededError");
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
    _store: store,
  };
}

function makeEnv({ failSet = false, confirmAnswer = true } = {}) {
  const g = globalThis;
  const saved = { localStorage: g.localStorage, confirm: g.confirm };
  g.localStorage = makeMockStorage(failSet);
  g.confirm = () => confirmAnswer;

  let data = { settings: {}, decks: [{ id: "d1" }], tournaments: [], matches: [] };
  const state = { selected: new Set(), undoSnapshots: {}, toasts: [], cloudConflict: null, localSaveError: "" };
  const calls = { toasts: [], diagnostics: [], renders: 0, authUpdates: 0, cloudSaves: 0 };
  let uidCounter = 0;

  const P = persistenceModule.createPersistence({
    STORAGE_KEY: "test-storage",
    RECOVERY_KEY: "test-recovery",
    getData: () => data,
    setData: (next) => {
      data = next;
    },
    state,
    mergeData: (d) => d, // 정규화는 store 테스트에서 검증
    createDefaultData: () => ({ settings: {}, decks: [], tournaments: [], matches: [] }),
    uid: (p) => `${p}-${(uidCounter += 1)}`,
    formatSyncTime: (v) => (v ? "시각" : ""),
    dataSummary: () => "요약",
    safeJsonSize: () => 42,
    recordDiagnostic: (...a) => calls.diagnostics.push(a),
    notifyToast: (title, message, tone, duration, action) => calls.toasts.push({ title, tone, action }),
    updateAuthControls: () => (calls.authUpdates += 1),
    scheduleCloudSave: () => (calls.cloudSaves += 1),
    render: () => (calls.renders += 1),
  });

  const restoreGlobals = () => {
    g.localStorage = saved.localStorage;
    g.confirm = saved.confirm;
  };
  return { P, state, calls, getData: () => data, storage: g.localStorage, restoreGlobals };
}

test("saveData: localStorage 기록 + lastLocalSavedAt 갱신 + 클라우드 예약", () => {
  const env = makeEnv();
  try {
    const ok = env.P.saveData();
    assert.equal(ok, true);
    assert.ok(env.storage.getItem("test-storage").includes('"d1"'));
    assert.ok(env.getData().settings.lastLocalSavedAt);
    assert.equal(env.state.localSaveError, "");
    assert.equal(env.calls.authUpdates, 1);
    assert.equal(env.calls.cloudSaves, 1);
  } finally {
    env.restoreGlobals();
  }
});

test("saveData: cloud:false 면 클라우드 예약 생략", () => {
  const env = makeEnv();
  try {
    env.P.saveData({ cloud: false });
    assert.equal(env.calls.cloudSaves, 0);
  } finally {
    env.restoreGlobals();
  }
});

test("saveData: 저장 실패 시 진단 기록 + 토스트 + 에러 상태, false 반환", () => {
  const env = makeEnv({ failSet: true });
  try {
    const ok = env.P.saveData();
    assert.equal(ok, false);
    assert.equal(env.state.localSaveError, "이 기기 저장 실패");
    assert.equal(env.calls.diagnostics.length, 1);
    assert.equal(env.calls.diagnostics[0][0], "local-save-failed");
    assert.equal(env.calls.toasts.length, 1);
    assert.equal(env.calls.cloudSaves, 1); // 실패해도 클라우드는 계속 시도
  } finally {
    env.restoreGlobals();
  }
});

test("cloneDataSnapshot: 깊은 복사(원본 참조와 분리)", () => {
  const env = makeEnv();
  try {
    const snap = env.P.cloneDataSnapshot();
    assert.notEqual(snap, env.getData());
    assert.notEqual(snap.decks, env.getData().decks);
    assert.deepEqual(snap.decks, env.getData().decks);
  } finally {
    env.restoreGlobals();
  }
});

test("saveRecoveryPoint/loadRecoveryPoint/recoveryStatusInfo 왕복", () => {
  const env = makeEnv();
  try {
    assert.equal(env.P.loadRecoveryPoint(), null);
    assert.equal(env.P.recoveryStatusInfo().available, false);
    assert.equal(env.P.saveRecoveryPoint(undefined, "삭제 전"), true);
    const point = env.P.loadRecoveryPoint();
    assert.equal(point.reason, "삭제 전");
    assert.deepEqual(point.data.decks, [{ id: "d1" }]);
    const info = env.P.recoveryStatusInfo();
    assert.equal(info.available, true);
    assert.equal(info.label, "삭제 전");
  } finally {
    env.restoreGlobals();
  }
});

test("restoreRecoveryPoint: confirm 수락 시 데이터 교체 + 현재본을 새 복구 지점으로 보관", () => {
  const env = makeEnv();
  try {
    env.P.saveRecoveryPoint({ settings: {}, decks: [{ id: "old" }], tournaments: [], matches: [] }, "이전 상태");
    env.state.cloudConflict = { any: true };
    env.P.restoreRecoveryPoint();
    assert.deepEqual(env.getData().decks, [{ id: "old" }]); // 복구됨
    assert.equal(env.state.cloudConflict, null);
    assert.equal(env.calls.renders, 1);
    const rePoint = env.P.loadRecoveryPoint();
    assert.equal(rePoint.reason, "복구 적용 전 데이터"); // 직전 데이터 보관
    assert.deepEqual(rePoint.data.decks, [{ id: "d1" }]);
  } finally {
    env.restoreGlobals();
  }
});

test("restoreRecoveryPoint: confirm 거절 시 아무것도 안 함", () => {
  const env = makeEnv({ confirmAnswer: false });
  try {
    env.P.saveRecoveryPoint({ settings: {}, decks: [{ id: "old" }], tournaments: [], matches: [] });
    env.P.restoreRecoveryPoint();
    assert.deepEqual(env.getData().decks, [{ id: "d1" }]); // 그대로
    assert.equal(env.calls.renders, 0);
  } finally {
    env.restoreGlobals();
  }
});

test("notifyUndo → restoreUndo: 스냅샷 저장·복원·토스트 정리", () => {
  const env = makeEnv();
  try {
    env.P.notifyUndo("삭제됨", undefined);
    const undoId = Object.keys(env.state.undoSnapshots)[0];
    assert.ok(undoId.startsWith("undo-"));
    assert.equal(env.calls.toasts[0].action.action, "restore-undo");
    // 데이터 변경 후 되돌리기
    env.getData().decks.length = 0;
    env.state.toasts = [{ action: { undoId } }, { action: {} }];
    env.P.restoreUndo(undoId);
    assert.deepEqual(env.getData().decks, [{ id: "d1" }]);
    assert.equal(env.state.undoSnapshots[undoId], undefined);
    assert.equal(env.state.toasts.length, 1); // 해당 undo 토스트만 제거
    assert.equal(env.calls.renders, 1);
  } finally {
    env.restoreGlobals();
  }
});

test("restoreUndo: 만료된 undoId 는 경고만", () => {
  const env = makeEnv();
  try {
    env.P.restoreUndo("undo-none");
    assert.equal(env.calls.toasts[0].title, "되돌릴 수 없음");
    assert.equal(env.calls.renders, 0);
  } finally {
    env.restoreGlobals();
  }
});
