/**
 * 전적몬 — 진단(diagnostics) 모듈 (모듈 분리 A5)
 *
 * 런타임 오류·동기화 실패 등을 localStorage에 기록하고, 설정 화면에서 상태 표시/파일 저장/비우기를 제공한다.
 * recordDiagnostic 은 앱 전역과 다른 모듈(share-image)에서도 쓰이므로, app.js에서 가장 먼저 생성해
 * 다른 팩토리에 주입한다.
 *
 * 노출:
 *  - 브라우저: window.JJM.diagnostics = { createDiagnostics, safeDiagnosticDetail }
 *  - Node(테스트): module.exports 동일
 *
 * data 는 재할당되는 값이라 getData() 게터로 주입받는다 (state 는 참조 주입).
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function safeDiagnosticDetail(detail) {
    if (!detail || typeof detail !== "object") return {};
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (error) {
      return { note: "detail serialization failed" };
    }
  }

  function createDiagnostics(deps) {
    const {
      DIAGNOSTIC_KEY,
      APP_VERSION,
      getData,
      state,
      formatSyncTime,
      userEmail,
      cloudStatusText,
      dataSummary,
      safeJsonSize,
      cardDataSummary,
      todayISO,
      notifyToast,
      render,
    } = deps;

    function diagnosticEntries() {
      try {
        const entries = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) || "[]");
        return Array.isArray(entries) ? entries.slice(0, 40) : [];
      } catch (error) {
        return [];
      }
    }

    function recordDiagnostic(type, message = "", detail = {}) {
      try {
        const entry = {
          at: new Date().toISOString(),
          type: String(type || "event").slice(0, 80),
          message: String(message || "").slice(0, 500),
          detail: safeDiagnosticDetail(detail),
          appVersion: APP_VERSION,
          url: window.location.href,
          userAgent: navigator.userAgent,
        };
        const entries = [entry, ...diagnosticEntries()].slice(0, 40);
        localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(entries));
      } catch (error) {
        console.warn("Diagnostic record failed", error);
      }
    }

    function diagnosticStatusInfo() {
      const entries = diagnosticEntries();
      if (!entries.length) return { tone: "ok", label: "정상", detail: "기록 없음", count: 0 };
      const latest = entries[0];
      const hasCritical = entries.some((entry) => /error|failed|rejection/i.test(entry.type));
      return {
        tone: hasCritical ? "warn" : "busy",
        label: `${entries.length}건`,
        detail: `${latest.type} · ${formatSyncTime(latest.at) || "방금"}`,
        count: entries.length,
      };
    }

    function diagnosticPayload() {
      const data = getData();
      return {
        generatedAt: new Date().toISOString(),
        site: "전적몬",
        appVersion: APP_VERSION,
        url: window.location.href,
        userAgent: navigator.userAgent,
        userEmail: userEmail(),
        online: navigator.onLine,
        sync: {
          cloudStatus: cloudStatusText(),
          cloudUpdatedAt: state.cloudUpdatedAt,
          cloudError: state.cloudError,
          localSavedAt: state.localSavedAt,
          localSaveError: state.localSaveError,
        },
        data: {
          summary: dataSummary(),
          decks: data.decks.length,
          tournaments: data.tournaments.length,
          matches: data.matches.length,
          bytes: safeJsonSize(data),
        },
        cardData: cardDataSummary(),
        diagnostics: diagnosticEntries(),
      };
    }

    function downloadDiagnostics() {
      const payload = diagnosticPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jeonjeokmon-diagnostics-${todayISO()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifyToast("진단 파일 저장", `${payload.diagnostics.length}건 기록 포함`, "success");
    }

    function clearDiagnostics() {
      localStorage.removeItem(DIAGNOSTIC_KEY);
      notifyToast("진단 기록 비움", "새로 생기는 문제만 다시 기록합니다.", "success");
      if (state.tab === "settings") render();
    }

    return {
      diagnosticEntries,
      recordDiagnostic,
      diagnosticStatusInfo,
      diagnosticPayload,
      downloadDiagnostics,
      clearDiagnostics,
    };
  }

  const api = { createDiagnostics, safeDiagnosticDetail };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.diagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
