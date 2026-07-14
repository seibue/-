/**
 * js/persistence.js — 저장/복구/undo 데이터 레이어 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리. localStorage 저장(saveData),
 * 복구 지점(recovery point), 되돌리기(undo) 스냅샷을 담당한다.
 *
 * DI 주의:
 * - data 는 재할당 → getData()/setData() 쌍으로 주입 (restore 계열이 data 를 통째로 교체)
 * - scheduleCloudSave 는 cloud 팩토리(나중에 생성)의 const → app.js에서 지연 화살표로 감싸 주입
 * - recordDiagnostic/notifyToast/updateAuthControls/render 는 호출 시점 실행이라 직접 주입
 * - loadData/loadCardEffectCache 는 init 순서(데이터·state 초기화) 제약으로 app.js 잔류
 *
 * - 브라우저: window.JJM.persistence.createPersistence(deps)
 * - Node(테스트): module.exports 동일 (localStorage 는 전역 목으로 주입)
 */
(function () {
  function createPersistence(deps) {
    const {
      STORAGE_KEY,
      RECOVERY_KEY,
      getData,
      setData,
      state,
      mergeData,
      createDefaultData,
      uid,
      formatSyncTime,
      dataSummary,
      safeJsonSize,
      recordDiagnostic,
      notifyToast,
      updateAuthControls,
      scheduleCloudSave,
      render,
    } = deps;

    function saveData(options = {}) {
      const data = getData();
      const savedAt = new Date().toISOString();
      data.settings = { ...(data.settings || {}), lastLocalSavedAt: savedAt };
      state.localSavedAt = savedAt;
      let savedLocally = false;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        state.localSaveError = "";
        savedLocally = true;
      } catch (error) {
        console.error(error);
        recordDiagnostic("local-save-failed", error?.message || "localStorage setItem failed", {
          key: STORAGE_KEY,
          dataBytes: safeJsonSize(data),
        });
        if (!state.localSaveError) {
          notifyToast("이 기기 저장 실패", "브라우저 저장 공간을 확인해 주세요. 클라우드 저장은 계속 시도합니다.", "danger", 0);
        }
        state.localSaveError = "이 기기 저장 실패";
      }
      updateAuthControls();
      if (options.cloud !== false) scheduleCloudSave();
      return savedLocally;
    }

    function cloneDataSnapshot(source = getData()) {
      return mergeData(JSON.parse(JSON.stringify(source || createDefaultData())));
    }

    function loadRecoveryPoint() {
      try {
        const point = JSON.parse(localStorage.getItem(RECOVERY_KEY) || "null");
        if (!point?.data) return null;
        return { ...point, data: mergeData(point.data) };
      } catch (error) {
        return null;
      }
    }

    function recoveryStatusInfo() {
      const point = loadRecoveryPoint();
      if (!point) return { available: false, label: "복구 지점 없음", detail: "중요한 삭제 작업 전에 자동으로 생성됩니다." };
      return {
        available: true,
        label: point.reason || "최근 복구 지점",
        detail: formatSyncTime(point.savedAt) || "저장 시간 없음",
      };
    }

    function saveRecoveryPoint(snapshot = getData(), reason = "변경 전 복구 지점") {
      try {
        const payload = {
          reason,
          savedAt: new Date().toISOString(),
          data: cloneDataSnapshot(snapshot),
        };
        localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
        return true;
      } catch (error) {
        notifyToast("복구 지점 저장 실패", "브라우저 저장 공간을 확인해 주세요.", "warning", 7000);
        return false;
      }
    }

    function restoreRecoveryPoint() {
      const point = loadRecoveryPoint();
      if (!point) {
        notifyToast("복구 지점 없음", "아직 저장된 복구 지점이 없습니다.", "info");
        return;
      }
      if (!confirm(`${point.reason || "최근 복구 지점"}으로 데이터를 되돌릴까요?\n\n현재 데이터는 새 복구 지점으로 보관됩니다.`)) return;
      const current = cloneDataSnapshot();
      saveRecoveryPoint(current, "복구 적용 전 데이터");
      setData(cloneDataSnapshot(point.data));
      state.selected.clear();
      state.cloudConflict = null;
      saveData();
      notifyToast("복구 완료", `${dataSummary()} · ${formatSyncTime(point.savedAt) || "저장 시간 없음"}`, "success");
      render();
    }

    function notifyUndo(title, snapshot, message = "방금 변경을 되돌릴 수 있습니다.") {
      const undoId = uid("undo");
      state.undoSnapshots[undoId] = cloneDataSnapshot(snapshot);
      notifyToast(title, message, "warning", 10000, { label: "되돌리기", action: "restore-undo", undoId });
    }

    function restoreUndo(undoId) {
      const snapshot = state.undoSnapshots[undoId];
      if (!snapshot) {
        notifyToast("되돌릴 수 없음", "되돌리기 시간이 지났거나 이미 적용됐습니다.", "warning");
        return;
      }
      setData(cloneDataSnapshot(snapshot));
      delete state.undoSnapshots[undoId];
      state.toasts = state.toasts.filter((toast) => toast.action?.undoId !== undoId);
      state.selected.clear();
      state.cloudConflict = null;
      saveData();
      notifyToast("되돌리기 완료", dataSummary(), "success");
      render();
    }

    return {
      saveData,
      cloneDataSnapshot,
      loadRecoveryPoint,
      recoveryStatusInfo,
      saveRecoveryPoint,
      restoreRecoveryPoint,
      notifyUndo,
      restoreUndo,
    };
  }

  const api = { createPersistence };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.persistence = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
