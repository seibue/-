/**
 * js/status.js — 데이터/동기화 상태 요약 헬퍼 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리. 전부 읽기 전용(부수효과 0) —
 * data/state/cloudClient 를 읽어 상태 문구·톤·요약을 만들 뿐 변경하지 않는다.
 *
 * DI 주의:
 * - data 는 재할당 → getData() 게터
 * - cloudClient 도 재할당(let) → getCloudClient() 게터
 * - state 는 참조 주입, CARD_CATALOG/KOREAN_CARD_EFFECTS/ADMIN_EMAILS 는 불변 참조 주입
 * - diagnostics 팩토리가 이 모듈의 함수 6종을 주입받으므로 app.js에서 diagnostics보다 먼저 생성
 *
 * - 브라우저: window.JJM.status.createStatus(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createStatus(deps) {
    const {
      getData,
      state,
      getCloudClient,
      mergeData,
      createDefaultData,
      CARD_CATALOG,
      KOREAN_CARD_EFFECTS,
      normalizeCardNumber,
      ADMIN_EMAILS,
      matchDateTime,
      formatDate,
    } = deps;

    function dataSummary(source = getData()) {
      const merged = mergeData(source || createDefaultData());
      return `${merged.decks.length}덱 · ${merged.tournaments.length}대회 · ${merged.matches.length}전`;
    }

    function cardDataSummary() {
      const effectEntries = Object.values(KOREAN_CARD_EFFECTS || {});
      const fetchedTimes = effectEntries
        .map((card) => card?.fetchedAt)
        .filter(Boolean)
        .map((value) => new Date(value).getTime())
        .filter(Number.isFinite);
      const latestEffectFetch = fetchedTimes.length ? new Date(Math.max(...fetchedTimes)).toISOString() : "";
      return {
        catalogCount: CARD_CATALOG.length,
        missingImageCount: CARD_CATALOG.filter((card) => !normalizeCardNumber(card.no)).length,
        effectCount: effectEntries.length,
        latestEffectFetch,
      };
    }

    function cardDataCommandsText() {
      return [
        "node tools/refresh-card-data.js",
        "",
        "갱신 후 GitHub에 올릴 파일:",
        "index.html",
        "app.js",
        "styles.css",
        "card-catalog.js",
        "korean-card-effects.js",
        "sw.js",
      ].join("\n");
    }

    function safeJsonSize(value) {
      try {
        return JSON.stringify(value).length;
      } catch (error) {
        return 0;
      }
    }

    function userEmail() {
      return state.authUser?.email || state.authUser?.user_metadata?.email || "";
    }

    function isAdminUser() {
      return ADMIN_EMAILS.includes(userEmail().trim().toLowerCase());
    }

    function syncTone() {
      if (state.localSaveError) return "danger";
      if (state.cloudError) return "danger";
      if (state.cloudConflict) return "warn";
      if (state.cloudSaving || state.cloudLoading || state.authLoading) return "busy";
      if (state.authUser && state.cloudReady) return "ok";
      return "offline";
    }

    function cloudStatusText() {
      if (state.localSaveError) return state.localSaveError;
      if (!getCloudClient() && state.authLoading) return "DB 연결 준비 중";
      if (!getCloudClient()) return "Supabase 설정을 확인해 주세요";
      if (state.authLoading) return "로그인 확인 중";
      if (!state.authUser) return "로그인하면 클라우드 데이터 불러오기";
      if (state.cloudLoading) return "클라우드 데이터 불러오는 중";
      if (state.cloudSaving) return "클라우드 저장 중";
      if (state.cloudConflict) return "다른 기기 변경 감지";
      if (state.cloudError) return state.cloudError;
      return state.cloudStatus || "클라우드 저장 준비됨";
    }

    function formatSyncTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    function backupStatusInfo() {
      const lastBackupAt = getData().settings?.lastBackupAt || "";
      if (!lastBackupAt) {
        return { tone: "warn", label: "백업 필요", detail: "아직 없음" };
      }
      const backupTime = new Date(lastBackupAt).getTime();
      if (!Number.isFinite(backupTime)) {
        return { tone: "warn", label: "백업 확인", detail: "기록 오류" };
      }
      const ageDays = (Date.now() - backupTime) / 86400000;
      if (ageDays > 30) return { tone: "danger", label: "오래됨", detail: formatSyncTime(lastBackupAt) };
      if (ageDays > 7) return { tone: "warn", label: "백업 권장", detail: formatSyncTime(lastBackupAt) };
      return { tone: "ok", label: "백업 양호", detail: formatSyncTime(lastBackupAt) };
    }

    function localSaveStatusText() {
      if (state.localSaveError) return state.localSaveError;
      const localSaved = formatSyncTime(state.localSavedAt || getData().settings?.lastLocalSavedAt);
      return localSaved ? `기기 저장 완료 · ${localSaved}` : "기기 저장";
    }

    function serviceStatusTone() {
      const backup = backupStatusInfo();
      if (state.localSaveError || state.cloudError || backup.tone === "danger") return "danger";
      if (state.cloudConflict || backup.tone === "warn" || !state.authUser) return "warn";
      if (state.cloudSaving || state.cloudLoading || state.authLoading) return "busy";
      return "ok";
    }

    function isSampleId(id) {
      return String(id || "").startsWith("sample-");
    }

    function hasRealDecks() {
      return getData().decks.some((deck) => !isSampleId(deck.id));
    }

    function hasRealMatches() {
      return getData().matches.some((match) => !isSampleId(match.id));
    }

    function shouldShowStarterGuide() {
      const data = getData();
      if (data.settings?.dismissedStarterGuide) return false;
      return Boolean(data.settings?.demoData) || !hasRealDecks() || !hasRealMatches();
    }

    function deckColorText(colors) {
      const labels = {
        red: "레드",
        blue: "블루",
        yellow: "옐로",
        green: "그린",
        black: "블랙",
        purple: "퍼플",
        white: "화이트",
      };
      const safeColors = Array.isArray(colors) && colors.length ? colors : ["blue"];
      return safeColors.map((color) => labels[color] || color).join(" / ");
    }

    function deckLastUsedLabel(deckId) {
      const latest = getData()
        .matches.filter((match) => match.deckId === deckId)
        .sort((a, b) => matchDateTime(b) - matchDateTime(a) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
      return latest ? formatDate(latest.date) : "사용 기록 없음";
    }

    return {
      dataSummary,
      cardDataSummary,
      cardDataCommandsText,
      safeJsonSize,
      userEmail,
      isAdminUser,
      syncTone,
      cloudStatusText,
      formatSyncTime,
      backupStatusInfo,
      localSaveStatusText,
      serviceStatusTone,
      isSampleId,
      hasRealDecks,
      hasRealMatches,
      shouldShowStarterGuide,
      deckColorText,
      deckLastUsedLabel,
    };
  }

  const api = { createStatus };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.status = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
