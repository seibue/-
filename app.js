(function () {
  const STORAGE_KEY = "digilog-ko-clone-v1";
  const RECOVERY_KEY = "jeonjeokmon-recovery-point-v1";
  const DIAGNOSTIC_KEY = "jeonjeokmon-diagnostics-v1";
  const CARD_EFFECT_CACHE_KEY = "digimon-card-effect-cache-v5";
  const APP_VERSION = "20260718-effect-blocks";
  const root = document.getElementById("app");

  // 모듈 분리 A1: 순수 포매팅/결과 헬퍼는 js/format.js 로 이동했습니다.
  // (app.js 보다 먼저 로드되어 window.JJM.format 으로 제공됨)
  const {
    uid,
    escapeHTML,
    todayISO,
    formatDate,
    resultLabel,
    resultShortLabel,
    playOrderLabel,
    resultFromGameStats,
    singleGameStats,
    normalizeGameStats,
    emptyRecordStats,
    finalizeRecordStats,
    topCutLabels,
  } = window.JJM.format;

  // 캘린더 엔진(순수): 구글 캘린더 링크 / .ics(알람 포함) / 월간 격자
  const { googleCalendarUrl, buildIcs, icsFileName, monthMatrix, groupEventsByLocalDate } = window.JJM.calendar;

  const colorMap = {
    red: "#ef4444",
    blue: "#3b82f6",
    yellow: "#facc15",
    green: "#22c55e",
    black: "#111827",
    purple: "#a855f7",
    white: "#f8fafc",
  };

  const colorLabels = {
    red: "레드",
    blue: "블루",
    yellow: "옐로",
    green: "그린",
    black: "블랙",
    purple: "퍼플",
    white: "화이트",
  };

  const cardTypeLabels = {
    digimon: "디지몬",
    option: "옵션",
    tamer: "테이머",
    digiEgg: "디지타마",
    other: "기타",
  };
  const DECK_LIMITS = {
    total: 55,
    main: 50,
    digiEgg: 5,
    digiEggReadyMin: 4,
  };
  const CARD_BROWSER_LIMIT = 72;
  const MATCH_SCORE_OPTIONS = [
    ["2-0", 2, 0, 0],
    ["2-1", 2, 1, 0],
    ["1-2", 1, 2, 0],
    ["0-2", 0, 2, 0],
    ["1-1", 1, 1, 0],
  ];
  const TOURNAMENT_FORMAT_OPTIONS = [
    ["mixed", "스위스+토너먼트"],
    ["swiss", "스위스"],
    ["top", "토너먼트"],
  ];
  // 스위스 후 토너먼트(컷) 시작 규모 — 대회별로 선택 (대형 대회 대비 128강까지)
  const TOURNAMENT_CUT_OPTIONS = [
    [4, "4강"],
    [8, "8강"],
    [16, "16강"],
    [32, "32강"],
    [64, "64강"],
    [128, "128강"],
    [2, "결승만"],
  ];
  const ROUND_STAGE_OPTIONS = [
    ["none", "일반"],
    ["swiss", "스위스"],
    ["top", "토너먼트"],
  ];
  // 3대3 팀전: 대전 유형으로 선택하면 폼에 '내 자리(A/B/C)'·'팀 결과'가 나타남
  const TEAM3_MATCH_TYPE = "3대3 팀전";
  // 매치 폼 드롭다운에 항상 노출되는 내장 대전 유형(사용자 목록에 없어도 합류).
  // 공식 대회 유형이라 기존 사용자 데이터에 손대지 않고도 바로 선택 가능하게 한다.
  const BUILTIN_MATCH_TYPES = ["얼티미트컵", TEAM3_MATCH_TYPE];
  const TEAM_POSITION_OPTIONS = ["A", "B", "C"];
  // 트랙 B: 카드번호/카탈로그 정규화 순수 헬퍼는 js/catalog.js 로 이동.
  // 아래 CARD_CATALOG 빌드가 normalizeCatalogCard 를 즉시 호출하므로 그 전에 생성해야 한다
  // (normalizeCardNumber/normalizeLevel 은 store 팩토리에도 주입됨).
  const {
    normalizeCardNumber,
    normalizeCatalogQuery,
    normalizeLevel,
    createDefaultDeckCardFilters,
    normalizeCatalogCard,
  } = window.JJM.catalog.createCatalog({ cardTypeLabels });

  // 같은 카드 번호의 다른 아트/레어도 중복은 덱 구성에 불필요하므로 번호 기준 1개만 유지
  // (카드 목록은 첫 등장(보통 기본 레어도)을 대표로 사용)
  const CARD_CATALOG = (() => {
    const source = Array.isArray(window.DIGIMON_CARD_CATALOG) ? window.DIGIMON_CARD_CATALOG : [];
    const seen = new Set();
    const list = [];
    source.forEach((card, index) => {
      const normalized = normalizeCatalogCard(card, index);
      if (!normalized.no || !normalized.name || seen.has(normalized.no)) return;
      seen.add(normalized.no);
      list.push(normalized);
    });
    return list;
  })();
  const REMOTE_CARD_API_URL = "https://digimoncard.io/api-public/search";
  const CARD_IMAGE_LOAD_TIMEOUT_MS = 7000;
  const KOREAN_CARD_PREVIEWS = {};
  const KOREAN_CARD_EFFECTS = window.KOREAN_CARD_EFFECTS && typeof window.KOREAN_CARD_EFFECTS === "object" ? window.KOREAN_CARD_EFFECTS : {};
  const SUPABASE_URL = "https://facrfwefgnklmsxcyagu.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GzIxydhbFEMQRbezGOjQ7A_rrsvgRsE";
  const CLOUD_TABLE = "jeonjeokmon_user_data";
  const HAS_CLOUD_CONFIG = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  const ADMIN_EMAILS = ["seibue63@gmail.com"];
  // cloudClient 는 app.js에 보관(표시 함수 cloudStatusText/syncTone 가 읽음). 클라우드 로직은 js/cloud.js.
  // 초기엔 Supabase 라이브러리가 로드되기 전이라 항상 null (기존 createCloudClient() 도 null 반환).
  let cloudClient = null;

  // 트랙 B: 데이터 정규화 레이어는 js/store.js 로 이동.
  // loadData()(아래 `let data`) 와 docx/cloud 팩토리보다 먼저 생성해야 한다(normalizeDeck/mergeData 주입).
  // createDefaultData/createDemoData/loadData(IO)는 app.js 잔류(localStorage 접근).
  // app.js가 직접 쓰는 것만 구조분해 (normalizeMatchTypes/Tournament/DeckVersions/Match 는
  // store 내부의 mergeData/normalizeDeck 가 사용하므로 여기서 꺼낼 필요 없음)
  const { mergeData, normalizeMatchTypeName, normalizeDeck, normalizeCards, normalizePersonalEvents } = window.JJM.store.createStore({
    uid,
    todayISO,
    normalizeCardNumber,
    normalizeLevel,
    cardTypeLabels,
    TOURNAMENT_FORMAT_OPTIONS,
    ROUND_STAGE_OPTIONS,
    normalizeGameStats,
    singleGameStats,
    resultFromGameStats,
    createDefaultData,
  });

  const tabs = [
    ["home", "홈"],
    ["matches", "전적 기록"],
    ["tournaments", "대회 기록"],
    ["events", "대회일정"],
    ["decks", "덱 관리"],
    ["stats", "통계"],
  ];

  // 모듈 분리 A2: 덱 레시피 인쇄/DOCX 내보내기는 js/docx-export.js 로 이동.
  // 덱 데이터에 의존하는 부분은 의존성 주입으로 연결합니다 (동작 변경 없음).
  const { printDeckRecipe, downloadDeckRecipeDocx } = window.JJM.docx.createDeckRecipeExport({
    escapeHTML,
    todayISO,
    cardTypeLabel,
    deckCards,
    sortDeckCards,
    deckCountSummary,
    normalizeDeck,
    deckLimitViolation,
    safeFileName,
    DECK_LIMITS,
  });

  let data = loadData();
  const state = {
    tab: "home",
    filtersOpen: false,
    // 전적 목록 표시 상한(더 보기로 +50). 대량 전적에서 전체 재렌더가 느려지는 것 방지.
    matchesVisible: 50,
    memoOnly: false,
    bulkMode: false,
    selected: new Set(),
    modal: null,
    editingMatchId: null,
    editingTournamentId: null,
    prefillMatchTournamentId: "",
    prefillMatchRoundStage: "",
    prefillMatchRoundLabel: "",
    editingDeckId: null,
    importingDecks: false,
    previewCardNo: "",
    previewActiveImage: 0,
    deckDraftForm: null,
    deckDraftCards: [],
    deckCardSearch: "",
    homeCardSearch: "",
    deckCardType: "all",
    deckAdvancedOpen: false,
    deckBuilderView: "catalog",
    deckTraySort: "level",
    deckCardFilters: createDefaultDeckCardFilters(),
    matchupDeckId: "",
    matchupOpponent: "",
    statsPeriod: "all",
    shareDate: "",
    tournamentEvents: [],
    eventsLoaded: false,
    eventRegionFilters: new Set(),
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    selectedCalendarDate: "",
    editingEventId: null,
    eventModalKind: "personal",
    deckImageLayout: data.settings?.deckImageLayout || "x",
    filters: {
      query: "",
      result: "all",
      deck: "all",
      type: "all",
    },
    cardEffectCache: loadCardEffectCache(),
    authUser: null,
    authLoading: HAS_CLOUD_CONFIG,
    cloudReady: false,
    cloudLoading: false,
    cloudSaving: false,
    cloudStatus: HAS_CLOUD_CONFIG ? "로그인 확인 중" : "DB 연결 설정 필요",
    cloudUpdatedAt: "",
    cloudError: "",
    cloudConflict: null,
    suppressCloudSave: false,
    localSavedAt: data.settings?.lastLocalSavedAt || "",
    localSaveError: "",
    toasts: [],
    undoSnapshots: {},
    installPrompt: null,
    pwaInstalled:
      window.matchMedia?.("(display-mode: standalone)")?.matches || Boolean(window.navigator?.standalone),
  };
  let searchTimer = null;
  let deckSearchTimer = null;
  let homeSearchTimer = null;
  const effectLoadingCards = new Set();

  // 트랙 B: 데이터/동기화 상태 요약 헬퍼는 js/status.js 로 이동(읽기 전용).
  // 아래 diagnostics 팩토리가 formatSyncTime/userEmail/cloudStatusText 등을 주입받으므로
  // diagnostics보다 먼저 생성. cloudClient 는 재할당(let) → getCloudClient 게터.
  const {
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
  } = window.JJM.status.createStatus({
    getData: () => data,
    state,
    getCloudClient: () => cloudClient,
    mergeData,
    createDefaultData,
    CARD_CATALOG,
    KOREAN_CARD_EFFECTS,
    normalizeCardNumber,
    ADMIN_EMAILS,
    matchDateTime,
    formatDate,
  });

  // 모듈 분리 A5: 진단(diagnostics)은 js/diagnostics.js 로 이동.
  // recordDiagnostic 은 다른 모듈/전역에서도 쓰여 가장 먼저 생성해 주입합니다.
  // data 는 재할당되므로 getData() 게터로 넘깁니다 (state 는 참조 주입).
  const { recordDiagnostic, diagnosticStatusInfo, downloadDiagnostics, clearDiagnostics } = window.JJM.diagnostics.createDiagnostics({
    DIAGNOSTIC_KEY,
    APP_VERSION,
    getData: () => data,
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
  });

  // 트랙 B: 저장/복구/undo 데이터 레이어는 js/persistence.js 로 이동.
  // restore 계열이 data 를 통째로 교체하므로 setData 콜백 주입.
  // scheduleCloudSave 는 아래 cloud 팩토리에서 나중에 생성되는 const → 지연 화살표로 감싼다
  // (saveData 는 런타임에만 호출되므로 호출 시점엔 이미 존재).
  const {
    saveData,
    cloneDataSnapshot,
    loadRecoveryPoint,
    recoveryStatusInfo,
    saveRecoveryPoint,
    restoreRecoveryPoint,
    notifyUndo,
    restoreUndo,
  } = window.JJM.persistence.createPersistence({
    STORAGE_KEY,
    RECOVERY_KEY,
    getData: () => data,
    setData: (next) => {
      data = next;
    },
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
    scheduleCloudSave: () => scheduleCloudSave(),
    render,
  });

  // 모듈 분리 A3: 공유 이미지(캔버스) 생성/다운로드는 js/share-image.js 로 이동.
  // 캔버스/DOM/네트워크/상태 의존이 많아 의존성 주입으로 연결합니다 (동작 변경 없음).
  const { downloadDeckImage, downloadDailyShareImage, openDailyShareX } = window.JJM.shareImage.createShareImage({
    todayISO,
    shareDateValue,
    shareDateTitle,
    shareRecordText,
    shareRateText,
    shareScoreText,
    shareGameScoreText,
    hasMatchGameBreakdown,
    dailyShareSummary,
    dailyShareUsedDecks,
    dailyShareText,
    // copyDailyShareText 는 아래 data-io 팩토리(나중 생성)의 const → 지연 화살표(런타임에만 호출됨)
    copyDailyShareText: (...args) => copyDailyShareText(...args),
    sortDeckCards,
    deckCards,
    deckCountSummary,
    normalizeDeck,
    normalizeCardNumber,
    shareCardImageSources,
    cardDisplayName,
    safeFileName,
    recordDiagnostic,
    notifyToast,
    state,
    colorMap,
    DECK_LIMITS,
    CARD_IMAGE_LOAD_TIMEOUT_MS,
  });

  // 모듈 분리 A4: 카드 효과 조회/번역/캐시는 js/card-effects.js 로 이동.
  // (loadCardEffectCache 는 state 초기화에 필요해 app.js에 잔류)
  const { staticKoreanOfficialEffect, fetchAndCacheCardEffect } = window.JJM.cardEffects.createCardEffects({
    normalizeCardNumber,
    render,
    renderKeepingDeckScroll,
    state,
    effectLoadingCards,
    CARD_EFFECT_CACHE_KEY,
    REMOTE_CARD_API_URL,
    KOREAN_CARD_EFFECTS,
  });

  // 트랙 B: 덱 가져오기 파서/정규화/원격조회는 js/deck-import.js 로 이동.
  // (catalogCardByNumber 는 여기 주입 + app.js 내부 사용으로 잔류)
  const { parseDeckImportSource, enrichImportedDecks, normalizeImportedDeck } = window.JJM.deckImport.createDeckImport({
    normalizeCardNumber,
    normalizeLevel,
    remoteCardImageUrl,
    uid,
    normalizeDeck,
    catalogCardByNumber,
    getData: () => data,
    cardTypeLabels,
    REMOTE_CARD_API_URL,
  });

  // 트랙 B: 파일/클립보드/설치 등 브라우저 IO 액션은 js/data-io.js 로 이동.
  // 전부 런타임 전용이라 생성 순서 제약은 deck-import(위) 이후면 충분.
  // copyDailyShareText 는 위 share-image 팩토리에 지연 화살표로 이미 연결됨.
  const {
    deckExportText,
    deckExportCodeText,
    copyDeckExportCode,
    createDeckExportPayload,
    downloadDeckExport,
    handleDeckImportSubmit,
    readDeckImportFile,
    downloadBackup,
    restoreBackup,
    clearAllData,
    refreshAppVersion,
    installPwa,
    copyCardUpdateCommands,
    copyDailyShareText,
    downloadCardDataStatus,
  } = window.JJM.dataIO.createDataIO({
    APP_VERSION,
    getData: () => data,
    setData: (next) => {
      data = next;
    },
    state,
    saveData,
    cloneDataSnapshot,
    saveRecoveryPoint,
    notifyUndo,
    mergeData,
    createDefaultData,
    normalizeDeck,
    deckCards,
    sortDeckCards,
    deckLimitViolation,
    safeFileName,
    todayISO,
    dataSummary,
    formatSyncTime,
    cardDataSummary,
    cardDataCommandsText,
    dailyShareText,
    parseDeckImportSource,
    enrichImportedDecks,
    normalizeImportedDeck,
    notifyToast,
    closeModal,
    render,
  });

  // 트랙 B: 덱/대회 조회·라운드 라벨 헬퍼는 js/lookups.js 로 이동(순수 조회 로직).
  // deckName 등이 아래 stats 팩토리 deps로 쓰이므로 stats보다 먼저 생성해야 한다.
  const {
    getDeck,
    deckName,
    getTournament,
    tournamentName,
    tournamentFormatLabel,
    roundStageLabel,
    roundText,
    tournamentMatchText,
    sortedTournaments,
    tournamentMatches,
    suggestedTournamentStage,
    tournamentTopCut,
    suggestedTeamPosition,
    suggestedRoundLabel,
    tournamentNextActionText,
  } = window.JJM.lookups.createLookups({
    getData: () => data,
    TOURNAMENT_FORMAT_OPTIONS,
    ROUND_STAGE_OPTIONS,
    TEAM3_MATCH_TYPE,
    topCutLabels,
  });

  // 트랙 B: 통계/매치업 계산은 js/stats.js 로 이동.
  // 렌더링/공유 텍스트/홈 빌더는 app.js에 잔류, 계산 코어만 DI로 연결.
  const {
    statsFromMatches,
    statsForDeckCard,
    statsForDeck,
    summaryStats,
    normalizeOpponentDeckName,
    matchupOpponentKey,
    deckMatchupRows,
    stageStatsFromMatches,
    tournamentStageSummary,
    validMatchupDeckId,
    validMatchupOpponent,
    matchesForMatchup,
    matchupBreakdownRows,
    opponentMetaRows,
    deckVersionRecords,
  } = window.JJM.stats.createStats({
    getData: () => data,
    state,
    deckName,
    matchDateTime,
    shareRecordText,
    emptyRecordStats,
    addMatchToStats,
    finalizeRecordStats,
  });

  // 트랙 B: 덱 편집(draft) 로직은 js/deck.js 로 이동.
  // 공용 유틸(deckCards/deckCountSummary/deckLimitViolation)은 app.js 잔류 → 주입받아 사용.
  const {
    catalogCardToDraft,
    deckLevelCounts,
    cardNumberOverLimit,
    availableCopiesForCard,
    addDraftCard,
    changeDraftCardCount,
    deckReadiness,
    uniqueDeckName,
    cloneDeck,
  } = window.JJM.deck.createDeck({
    normalizeCards,
    normalizeCardNumber,
    normalizeLevel,
    uid,
    cardTypeLabels,
    DECK_LIMITS,
    state,
    getData: () => data,
    deckCards,
    deckCountSummary,
    deckLimitViolation,
  });

  // 트랙 B: 클라우드 동기화(Supabase)는 js/cloud.js 로 이동.
  // cloudClient 는 app.js 보관 → get/set 으로 주입, data 재할당은 setData 로 처리.
  const {
    ensureCloudClient,
    setDataFromCloud,
    scheduleCloudSave,
    saveCloudData,
    initializeCloudAuth,
    loginWithGoogle,
    logoutGoogle,
    loadCloudNow,
    applyCloudConflictVersion,
    keepLocalConflictVersion,
  } = window.JJM.cloud.createCloud({
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    HAS_CLOUD_CONFIG,
    CLOUD_TABLE,
    STORAGE_KEY,
    getCloudClient: () => cloudClient,
    setCloudClient: (client) => {
      cloudClient = client;
    },
    getData: () => data,
    setData: (value) => {
      data = value;
    },
    state,
    mergeData,
    createDefaultData,
    recordDiagnostic,
    safeJsonSize,
    notifyToast,
    updateAuthControls,
    render,
    dataSummary,
  });

  function createDefaultData() {
    return {
      settings: {},
      matchTypes: ["테이머 배틀", "매장 대표전", "얼티미트컵", "친선전", "테스트 플레이"],
      decks: [],
      tournaments: [],
      matches: [],
      personalEvents: [],
    };
  }

  function createDemoData() {
    const createdAt = "2026-05-19T00:00:00.000Z";
    const redDeckId = "sample-deck-red";
    const blueDeckId = "sample-deck-blue";
    const redCards = [
      ["sample-red-st101", "ST1-01", "2", "코로몬", "digiEgg", 4],
      ["sample-red-st701", "ST7-01", "2", "기기몬", "digiEgg", 1],
      ["sample-red-st103", "ST1-03", "3", "아구몬", "digimon", 4],
      ["sample-red-st107", "ST1-07", "4", "그레이몬", "digimon", 4],
      ["sample-red-st111", "ST1-11", "6", "워그레이몬", "digimon", 3],
      ["sample-red-st112", "ST1-12", "", "신태일", "tamer", 2],
      ["sample-red-st116", "ST1-16", "", "가이아 포스", "option", 3],
      ["sample-red-st703", "ST7-03", "3", "길몬", "digimon", 4],
      ["sample-red-st705", "ST7-05", "4", "그라우몬", "digimon", 4],
      ["sample-red-st709", "ST7-09", "6", "듀크몬", "digimon", 3],
      ["sample-red-st711", "ST7-11", "", "로얄 세이버", "option", 2],
      ["sample-red-bt13008", "BT13-008", "3", "아구몬", "digimon", 4],
      ["sample-red-bt13111", "BT13-111", "6", "듀크몬", "digimon", 3],
      ["sample-red-bt13112", "BT13-112", "7", "오메가몬", "digimon", 2],
      ["sample-red-bt20017", "BT20-017", "6", "제스몬", "digimon", 4],
      ["sample-red-bt20021", "BT20-021", "7", "제스몬GX ACE", "digimon", 2],
      ["sample-red-bt20102", "BT20-102", "7", "오메가몬 X항체", "digimon", 3],
      ["sample-red-bt20100", "BT20-100", "", "최후의 수호자", "option", 3],
    ].map(([id, cardNumber, level, name, type, count]) => ({ id, cardNumber, level, name, type, count }));
    const blueCards = [
      ["sample-blue-st201", "ST2-01", "2", "뿔몬", "digiEgg", 4],
      ["sample-blue-st801", "ST8-01", "2", "꼬마몬", "digiEgg", 1],
      ["sample-blue-st203", "ST2-03", "3", "파피몬", "digimon", 4],
      ["sample-blue-st206", "ST2-06", "4", "가루몬", "digimon", 4],
      ["sample-blue-st211", "ST2-11", "6", "메탈가루몬", "digimon", 3],
      ["sample-blue-st212", "ST2-12", "", "매튜", "tamer", 2],
      ["sample-blue-st213", "ST2-13", "", "해머 스파크", "option", 4],
      ["sample-blue-st804", "ST8-04", "3", "브이몬", "digimon", 4],
      ["sample-blue-st805", "ST8-05", "4", "브이드라몬", "digimon", 4],
      ["sample-blue-st810", "ST8-10", "6", "알포스브이드라몬", "digimon", 3],
      ["sample-blue-st811", "ST8-11", "", "알포스세이버", "option", 2],
      ["sample-blue-bt12021", "BT12-021", "3", "브이몬", "digimon", 4],
      ["sample-blue-bt14009", "BT14-009", "3", "울퉁몬", "digimon", 4],
      ["sample-blue-bt20083", "BT20-083", "4", "오메카몬", "digimon", 4],
      ["sample-blue-bt20091", "BT20-091", "", "쿨 보이", "tamer", 4],
      ["sample-blue-lm034", "LM-034", "", "위스타리아·메모리 부스트!!", "option", 4],
    ].map(([id, cardNumber, level, name, type, count]) => ({ id, cardNumber, level, name, type, count }));
    return {
      settings: { demoData: true },
      matchTypes: ["테이머 배틀", "매장 대표전", "얼티미트컵", "친선전", "테스트 플레이"],
      decks: [
        {
          id: redDeckId,
          name: "샘플: 레드 오메가",
          colors: ["red", "white"],
          note: "처음 사용자를 위한 예시 덱입니다. 수정하거나 삭제해도 괜찮습니다.",
          cards: redCards,
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: blueDeckId,
          name: "샘플: 블루 메탈가루몬",
          colors: ["blue"],
          note: "덱 구축, 카드별 승률, 매치업 통계를 보여주기 위한 샘플입니다.",
          cards: blueCards,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      tournaments: [
        {
          id: "sample-tournament-store-001",
          name: "샘플: 매장 대표전",
          date: "2026-05-13",
          format: "mixed",
          location: "샘플 매장",
          memo: "스위스 라운드와 토너먼트 라운드를 함께 기록하는 예시입니다.",
          createdAt,
          updatedAt: createdAt,
        },
      ],
      matches: [
        {
          id: "sample-match-001",
          deckId: redDeckId,
          date: "2026-05-12",
          matchType: "테이머 배틀",
          opponent: "블루 플레어",
          result: "win",
          playOrder: "first",
          memo: "샘플 기록입니다. 상대 덱 이름을 적으면 매치업 승률이 계산됩니다.",
          cardIds: ["sample-red-st103", "sample-red-bt13112", "sample-red-bt20100"],
          cardNames: ["아구몬", "오메가몬", "최후의 수호자"],
          cardNumbers: ["ST1-03", "BT13-112", "BT20-100"],
          createdAt: "2026-05-12T12:00:00.000Z",
          updatedAt: "2026-05-12T12:00:00.000Z",
        },
        {
          id: "sample-match-002",
          deckId: redDeckId,
          date: "2026-05-13",
          matchType: "매장 대표전",
          opponent: "블루 플레어",
          result: "loss",
          tournamentId: "sample-tournament-store-001",
          roundStage: "swiss",
          roundLabel: "R1",
          playOrder: "second",
          memo: "초반 메모리 관리가 어려웠던 샘플 경기.",
          cardIds: ["sample-red-st107", "sample-red-st116"],
          cardNames: ["그레이몬", "가이아 포스"],
          cardNumbers: ["ST1-07", "ST1-16"],
          createdAt: "2026-05-13T12:00:00.000Z",
          updatedAt: "2026-05-13T12:00:00.000Z",
        },
        {
          id: "sample-match-003",
          deckId: redDeckId,
          date: "2026-05-14",
          matchType: "친선전",
          opponent: "로얄나이츠",
          result: "win",
          playOrder: "first",
          memo: "오메가몬 라인이 잘 이어진 샘플 경기.",
          cardIds: ["sample-red-bt13111", "sample-red-bt13112", "sample-red-bt20102"],
          cardNames: ["듀크몬", "오메가몬", "오메가몬 X항체"],
          cardNumbers: ["BT13-111", "BT13-112", "BT20-102"],
          createdAt: "2026-05-14T12:00:00.000Z",
          updatedAt: "2026-05-14T12:00:00.000Z",
        },
        {
          id: "sample-match-004",
          deckId: redDeckId,
          date: "2026-05-15",
          matchType: "테스트 플레이",
          opponent: "샤인그레이몬",
          result: "draw",
          playOrder: "unknown",
          memo: "무승부도 승률 계산에 포함되는지 보여주는 샘플.",
          cardIds: ["sample-red-bt20017", "sample-red-bt20021"],
          cardNames: ["제스몬", "제스몬GX ACE"],
          cardNumbers: ["BT20-017", "BT20-021"],
          createdAt: "2026-05-15T12:00:00.000Z",
          updatedAt: "2026-05-15T12:00:00.000Z",
        },
        {
          id: "sample-match-005",
          deckId: blueDeckId,
          date: "2026-05-12",
          matchType: "테이머 배틀",
          opponent: "워그레이몬",
          result: "loss",
          playOrder: "second",
          memo: "상대 덱별 승률 샘플입니다.",
          cardIds: ["sample-blue-st203", "sample-blue-st213"],
          cardNames: ["파피몬", "해머 스파크"],
          cardNumbers: ["ST2-03", "ST2-13"],
          createdAt: "2026-05-12T13:00:00.000Z",
          updatedAt: "2026-05-12T13:00:00.000Z",
        },
        {
          id: "sample-match-006",
          deckId: blueDeckId,
          date: "2026-05-13",
          matchType: "매장 대표전",
          opponent: "워그레이몬",
          result: "win",
          tournamentId: "sample-tournament-store-001",
          roundStage: "swiss",
          roundLabel: "R2",
          playOrder: "first",
          memo: "알포스브이드라몬으로 tempo를 잡은 샘플.",
          cardIds: ["sample-blue-st804", "sample-blue-st810", "sample-blue-st811"],
          cardNames: ["브이몬", "알포스브이드라몬", "알포스세이버"],
          cardNumbers: ["ST8-04", "ST8-10", "ST8-11"],
          createdAt: "2026-05-13T13:00:00.000Z",
          updatedAt: "2026-05-13T13:00:00.000Z",
        },
        {
          id: "sample-match-007",
          deckId: blueDeckId,
          date: "2026-05-16",
          matchType: "친선전",
          opponent: "로얄나이츠",
          result: "win",
          playOrder: "second",
          memo: "카드별 승률을 확인하기 위한 샘플 기록.",
          cardIds: ["sample-blue-bt12021", "sample-blue-bt20091", "sample-blue-lm034"],
          cardNames: ["브이몬", "쿨 보이", "위스타리아·메모리 부스트!!"],
          cardNumbers: ["BT12-021", "BT20-091", "LM-034"],
          createdAt: "2026-05-16T13:00:00.000Z",
          updatedAt: "2026-05-16T13:00:00.000Z",
        },
        {
          id: "sample-match-008",
          deckId: blueDeckId,
          date: "2026-05-17",
          matchType: "테스트 플레이",
          opponent: "블루 플레어",
          result: "win",
          playOrder: "first",
          memo: "필터와 통계 화면을 확인하기 위한 샘플.",
          cardIds: ["sample-blue-st211", "sample-blue-bt20083"],
          cardNames: ["메탈가루몬", "오메카몬"],
          cardNumbers: ["ST2-11", "BT20-083"],
          createdAt: "2026-05-17T13:00:00.000Z",
          updatedAt: "2026-05-17T13:00:00.000Z",
        },
      ],
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDemoData();
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return createDemoData();
      return mergeData(saved);
    } catch (error) {
      return createDemoData();
    }
  }

  function loadCardEffectCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CARD_EFFECT_CACHE_KEY) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (error) {
      return {};
    }
  }

  function renderSaveStatusStrip() {
    const signedIn = Boolean(state.authUser);
    const tone = syncTone();
    const cloudText = signedIn ? cloudStatusText() : "로그인 전에는 이 기기에만 저장됩니다.";
    const localText = localSaveStatusText();
    return `
      <article class="home-panel save-status-strip">
        <div>
          <strong><span class="sync-dot ${tone}"></span>저장 상태</strong>
          <span>${escapeHTML(cloudText)} · ${escapeHTML(localText)}</span>
        </div>
        <button class="control-button ${signedIn ? "" : "active"}" type="button" data-action="${signedIn ? "sync-cloud-now" : "login-google"}">
          ${signedIn ? "지금 저장" : "Google 로그인"}
        </button>
      </article>
    `;
  }

  const HOME_CARD_SEARCH_LIMIT = 300;

  // 질의에 매칭되는 모든 카드(정렬됨). 표시 개수 제한은 렌더에서 적용.
  function homeCardSearchMatches() {
    const query = state.homeCardSearch.trim().toLowerCase();
    if (!query) return [];
    const compactQuery = normalizeCatalogQuery(state.homeCardSearch);
    return CARD_CATALOG.filter((card) => {
      if (cardNumberMatchesQuery(card.no, query)) return true;
      return catalogTextMatches(card, query, compactQuery);
    }).sort(compareCatalogCards);
  }

  function renderHomeCardSearchResults() {
    if (!state.homeCardSearch.trim()) {
      return `<div class="home-card-search-hint">카드 이름이나 번호를 입력하면 카드를 찾아 효과를 볼 수 있습니다.</div>`;
    }
    const all = homeCardSearchMatches();
    if (!all.length) {
      return `<div class="home-card-search-hint">검색 결과가 없습니다. 번호는 BT1-084, bt1 084처럼 입력해도 됩니다.</div>`;
    }
    const cards = all.slice(0, HOME_CARD_SEARCH_LIMIT);
    const countLine = `<div class="home-card-search-count">${all.length}종 검색됨${
      all.length > HOME_CARD_SEARCH_LIMIT ? ` · 상위 ${HOME_CARD_SEARCH_LIMIT}종 표시 (검색어를 좁히면 더 정확해요)` : ""
    }</div>`;
    return countLine + cards
      .map((card) => {
        const imageSrc = catalogImageSource(card);
        const no = escapeHTML(card.no);
        return `
          <button class="home-card-result" type="button" data-action="preview-catalog-card" data-card-no="${no}" title="${no} ${escapeHTML(card.name)}">
            <span class="home-card-result-thumb">${
              imageSrc
                ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" loading="lazy" />`
                : `<span>${no}</span>`
            }</span>
            <span class="home-card-result-info">
              <strong>${escapeHTML(card.name)}</strong>
              <small>${no} · ${escapeHTML(catalogMetaText(card))}</small>
            </span>
          </button>
        `;
      })
      .join("");
  }

  function renderHomeCardSearch() {
    return `
      <article class="home-panel home-card-search">
        <div class="home-card-search-head">
          <strong>카드 검색</strong>
          <input class="input" type="search" value="${escapeHTML(state.homeCardSearch)}" placeholder="카드명·번호·효과 (예: 오메가몬, BT1-084)" aria-label="카드 검색" data-home-card-search autocomplete="off" />
        </div>
        <div class="home-card-search-results" data-home-card-search-results>${renderHomeCardSearchResults()}</div>
      </article>
    `;
  }

  function updateHomeCardSearchResults() {
    const container = document.querySelector("[data-home-card-search-results]");
    if (container) container.innerHTML = renderHomeCardSearchResults();
  }

  function renderAuthControlsInner() {
    if (!cloudClient && state.authLoading) {
      return `<span class="auth-status"><span class="sync-dot busy"></span>로그인 확인 중</span>`;
    }
    if (!cloudClient) {
      return `<span class="auth-status warning"><span class="sync-dot danger"></span>DB 연결 필요</span>`;
    }
    if (state.authLoading) {
      return `<span class="auth-status"><span class="sync-dot busy"></span>로그인 확인 중</span>`;
    }
    if (!state.authUser) {
      return `
        <span class="auth-status ${state.localSaveError ? "warning" : ""}"><span class="sync-dot ${state.localSaveError ? "danger" : "offline"}"></span>${escapeHTML(localSaveStatusText())}</span>
        <button class="auth-button" type="button" data-action="login-google">Google 로그인</button>
      `;
    }
    const lastSaved = formatSyncTime(state.cloudUpdatedAt);
    return `
      <div class="auth-profile">
        <strong>${escapeHTML(userEmail() || "로그인됨")}</strong>
        <span><span class="sync-dot ${syncTone()}"></span>${escapeHTML(cloudStatusText())}${lastSaved ? ` · ${escapeHTML(lastSaved)}` : ""}</span>
      </div>
      <button class="auth-button ghost" type="button" data-action="logout-google">로그아웃</button>
    `;
  }

  function renderAuthControls() {
    return `<div class="auth-controls" data-auth-controls>${renderAuthControlsInner()}</div>`;
  }

  function updateAuthControls() {
    const authControls = document.querySelector("[data-auth-controls]");
    if (authControls) authControls.innerHTML = renderAuthControlsInner();
  }

  function renderToastItems() {
    return state.toasts
      .map(
        (toast) => `
          <div class="toast ${escapeHTML(toast.tone || "info")}">
            <div>
              <strong>${escapeHTML(toast.title)}</strong>
              ${toast.message ? `<span>${escapeHTML(toast.message)}</span>` : ""}
              ${
                toast.action
                  ? `<button class="toast-action" type="button" data-action="${escapeHTML(toast.action.action)}" ${
                      toast.action.undoId ? `data-undo-id="${escapeHTML(toast.action.undoId)}"` : ""
                    }>${escapeHTML(toast.action.label)}</button>`
                  : ""
              }
            </div>
            <button class="toast-close" type="button" title="닫기" aria-label="알림 닫기" data-action="dismiss-toast" data-id="${escapeHTML(toast.id)}">×</button>
          </div>
        `
      )
      .join("");
  }

  function renderToastStack() {
    // 접근성: 라이브 리전은 콘텐츠와 동시에 삽입되면 스크린리더가 놓치기 쉬움 →
    // 빈 상태에서도 컨테이너를 상시 렌더해 두고 안에 토스트만 넣고 뺀다.
    return `
      <div class="toast-stack" data-toast-stack role="status" aria-live="polite" aria-atomic="false">
        ${renderToastItems()}
      </div>
    `;
  }

  function renderCloudConflictBanner() {
    if (!state.cloudConflict) return "";
    return `
      <section class="cloud-conflict-banner" role="status">
        <div>
          <strong>다른 기기에서 더 최신 데이터가 감지됐습니다.</strong>
          <span>클라우드 ${escapeHTML(dataSummary(state.cloudConflict.data))} · 이 기기 ${escapeHTML(dataSummary())}</span>
        </div>
        <div class="cloud-conflict-actions">
          <button class="control-button" type="button" data-action="use-cloud-version">클라우드 적용</button>
          <button class="control-button active" type="button" data-action="keep-local-version">이 기기 유지</button>
        </div>
      </section>
    `;
  }

  function updateToastStack() {
    const stack = document.querySelector("[data-toast-stack]");
    if (stack) {
      // 컨테이너는 유지하고 내용만 교체해야 라이브 리전 알림이 안정적으로 읽힌다.
      stack.innerHTML = renderToastItems();
      return;
    }
    const shell = document.querySelector(".app-shell");
    if (shell) shell.insertAdjacentHTML("beforeend", renderToastStack());
  }

  function notifyToast(title, message = "", tone = "info", duration = 3600, action = null) {
    const id = uid("toast");
    const nextToasts = [...state.toasts.slice(-3), { id, title, message, tone, action }];
    const visibleUndoIds = new Set(nextToasts.map((toast) => toast.action?.undoId).filter(Boolean));
    state.toasts.forEach((toast) => {
      const undoId = toast.action?.undoId;
      if (undoId && !visibleUndoIds.has(undoId)) delete state.undoSnapshots[undoId];
    });
    state.toasts = nextToasts;
    updateToastStack();
    if (duration > 0) {
      window.setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }

  function dismissToast(id) {
    const toast = state.toasts.find((item) => item.id === id);
    if (toast?.action?.undoId) delete state.undoSnapshots[toast.action.undoId];
    state.toasts = state.toasts.filter((toast) => toast.id !== id);
    updateToastStack();
  }

  function tournamentFinalSummaryText(tournament) {
    const matches = tournamentMatches(tournament.id);
    if (!matches.length) return "라운드 기록 전";
    const stats = statsFromMatches(matches);
    const stageSummary = tournamentStageSummary(matches, tournament.format);
    return [shareRecordText(stats), stageSummary].filter(Boolean).join(" · ");
  }

  function tournamentRoundProgress(tournament) {
    const matches = tournamentMatches(tournament.id);
    const swissCount = matches.filter((match) => match.roundStage === "swiss").length;
    const topCount = matches.filter((match) => match.roundStage === "top").length;
    return {
      swissCount,
      topCount,
      nextSwiss: suggestedRoundLabel(tournament.id, "swiss"),
      nextTop: suggestedRoundLabel(tournament.id, "top"),
    };
  }

  function tournamentStageActionButton(tournament, stage, label, tone = "") {
    const roundLabel = suggestedRoundLabel(tournament.id, stage);
    return `
      <button class="icon-button text-icon tournament-round-action ${tone}" type="button"
        data-action="open-match-for-tournament-stage"
        data-id="${escapeHTML(tournament.id)}"
        data-stage="${escapeHTML(stage)}"
        data-round-label="${escapeHTML(roundLabel)}">
        ${escapeHTML(label)} ${escapeHTML(roundLabel)}
      </button>
    `;
  }

  function ensureDeck(name) {
    const normalized = name.trim();
    const existing = data.decks.find((deck) => deck.name.toLowerCase() === normalized.toLowerCase());
    if (existing) return existing;
    const deck = {
      id: uid("deck"),
      name: normalized,
      colors: ["blue"],
      note: "",
      cards: [],
      createdAt: new Date().toISOString(),
    };
    data.decks.push(deck);
    return deck;
  }

  function cardDisplayName(card) {
    return `${card.cardNumber} ${card.name}`.trim();
  }

  function cardMetaText(card) {
    const level = card.level ? `Lv.${card.level}` : "Lv.-";
    return `${level} · ${cardTypeLabel(card.type)} · ${card.count}장`;
  }

  function colorLabel(color) {
    return colorLabels[String(color || "").toLowerCase()] || "";
  }

  function catalogMetaText(card) {
    return [
      card.level ? `Lv.${card.level}` : "",
      cardTypeLabel(card.type),
      colorLabel(card.color),
      card.rarity,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function remoteCardImageUrl(cardNumber) {
    return remoteCardImageUrls(cardNumber)[0] || "";
  }

  // 카드 이미지는 일본 공식(digimoncard.com)으로 통일.
  // 기본 일러는 {번호}.png, 패럴렐(다른 일러스트)은 {번호}_P1.png, _P2.png … 로 호스팅한다.
  const JP_OFFICIAL_CARD_IMAGE_BASE = "https://digimoncard.com/images/cardlist/card";
  function jpOfficialCardImageUrl(cardNumber, suffix = "") {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return "";
    return `${JP_OFFICIAL_CARD_IMAGE_BASE}/${normalized}${suffix}.png`;
  }

  function probeImageLoad(url, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => finish(img.naturalWidth > 1);
      img.onerror = () => finish(false);
      img.src = url;
    });
  }

  function cardImageNumberVariants(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return [];
    const variants = new Set([normalized]);
    const noHyphen = normalized.replace(/-/g, "");
    if (noHyphen !== normalized) variants.add(noHyphen);
    const unpaddedSet = normalized.replace(/^([A-Z]+)0+(\d+-)/, "$1$2");
    if (unpaddedSet !== normalized) variants.add(unpaddedSet);
    const paddedSet = normalized.replace(/^([A-Z]+)(\d)(-)/, (_match, prefix, number, dash) => `${prefix}0${number}${dash}`);
    if (paddedSet !== normalized) variants.add(paddedSet);
    Array.from(variants).forEach((value) => variants.add(value.toLowerCase()));
    return Array.from(variants).filter(Boolean);
  }

  function remoteCardImageUrls(cardNumber) {
    // 카드 이미지는 일본 공식(digimoncard.com)으로 통일. 카탈로그가 이 사이트에서 생성되므로
    // 정규화한 카드번호가 곧 파일명({번호}.png)이며 프로모(P-)·ST·EX·LM 등 전 시리즈를 커버한다.
    return cardImageNumberVariants(cardNumber)
      .map((variant) => `${JP_OFFICIAL_CARD_IMAGE_BASE}/${encodeURIComponent(variant)}.png`)
      .filter((src, index, sources) => sources.indexOf(src) === index);
  }

  function catalogImageSource(card) {
    return card.img || remoteCardImageUrl(card.no);
  }

  function deckCardImageSource(card) {
    // 덱 카드가 특정 일러(패럴렐)를 지정했으면 그 이미지를, 아니면 기본 일러를 쓴다.
    if (card.art) return jpOfficialCardImageUrl(card.cardNumber, card.art);
    const catalogCard = catalogCardByNumber(card.cardNumber);
    return catalogCard?.img || remoteCardImageUrl(card.cardNumber);
  }

  function proxiedShareImageUrl(src) {
    if (!src) return "";
    try {
      const url = new URL(src, window.location.href);
      if (url.origin === window.location.origin) return url.toString();
      if (url.hostname === "digimoncard.com") {
        return `/api/card-image?src=${encodeURIComponent(url.toString())}&v=${encodeURIComponent(APP_VERSION)}`;
      }
    } catch (error) {
      return src;
    }
    return src;
  }

  function shareCardImageSources(card) {
    const normalized = normalizeCardNumber(card.cardNumber);
    const catalogCard = catalogCardByNumber(normalized);
    // 지정 일러(있으면)를 최우선으로, 실패 시 기본 일러로 폴백
    const artUrl = card.art ? jpOfficialCardImageUrl(normalized, card.art) : "";
    return [artUrl, catalogCard?.img || "", ...remoteCardImageUrls(normalized)]
      .filter(Boolean)
      .map(proxiedShareImageUrl)
      .filter((src, index, sources) => sources.indexOf(src) === index);
  }

  function cardPreviewData(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return null;
    const catalogCard = catalogCardByNumber(normalized);
    if (catalogCard) {
      return {
        no: catalogCard.no,
        level: catalogCard.level,
        name: catalogCard.name,
        type: catalogCard.type,
        color: catalogCard.color,
        rarity: catalogCard.rarity,
        img: catalogImageSource(catalogCard),
      };
    }
    const draftCard = state.deckDraftCards.find((card) => normalizeCardNumber(card.cardNumber) === normalized);
    const savedCard = data.decks.flatMap((deck) => deckCards(deck)).find((card) => normalizeCardNumber(card.cardNumber) === normalized);
    const card = draftCard || savedCard || {};
    return {
      no: normalized,
      level: normalizeLevel(card.level || ""),
      name: String(card.name || normalized).trim(),
      type: cardTypeLabels[card.type] ? card.type : "digimon",
      color: "",
      rarity: "",
      img: remoteCardImageUrl(normalized),
    };
  }

  function showMissingCatalogImage(image) {
    const wrapper = image.closest(".catalog-image");
    if (!wrapper) return;
    const cardNumber = image.dataset.cardNo || "";
    image.remove();
    if (wrapper.querySelector(".catalog-image-empty")) return;
    const fallback = document.createElement("span");
    fallback.className = "catalog-image-empty";
    fallback.textContent = cardNumber;
    wrapper.append(fallback);
  }

  function showMissingDeckThumb(image) {
    const wrapper = image.closest(".deck-row-thumb");
    if (!wrapper) return;
    const cardNumber = image.dataset.cardNo || "";
    image.remove();
    if (wrapper.querySelector(".deck-row-thumb-empty")) return;
    const fallback = document.createElement("span");
    fallback.className = "deck-row-thumb-empty";
    fallback.textContent = cardNumber.slice(0, 2) || "?";
    wrapper.append(fallback);
  }

  // 카드 번호(이름/색/종류 제외) 텍스트
  function catalogSearchText(card) {
    const eff = KOREAN_CARD_EFFECTS[card.no] || {};
    const effectText = `${eff.mainEffect || ""} ${eff.sourceEffect || ""} ${eff.securityEffect || ""} ${eff.altEffect || ""}`;
    return `${card.name} ${cardTypeLabel(card.type)} ${colorLabel(card.color)} ${colorLabel(card.color2)} ${card.rarity} ${effectText}`.toLowerCase();
  }

  // 카드명·종류·색·레어도 + 효과 텍스트를 합친 검색 인덱스(번호→{text, compact}).
  // 정적 데이터(KOREAN_CARD_EFFECTS)라 1회만 만들어 키 입력마다 재사용한다.
  let catalogSearchIndex = null;
  function catalogSearchEntry(card) {
    if (!catalogSearchIndex) {
      catalogSearchIndex = new Map();
      CARD_CATALOG.forEach((item) => {
        const text = catalogSearchText(item);
        catalogSearchIndex.set(item.no, { text, compact: normalizeCatalogQuery(text) });
      });
    }
    const hit = catalogSearchIndex.get(card.no);
    if (hit) return hit;
    const text = catalogSearchText(card);
    return { text, compact: normalizeCatalogQuery(text) };
  }

  // 카드 어디든(이름/효과/색/종류) 질의가 포함되면 매칭. compact는 공백·기호 제거 비교.
  function catalogTextMatches(card, query, compactQuery) {
    const entry = catalogSearchEntry(card);
    if (entry.text.includes(query)) return true;
    return Boolean(compactQuery) && entry.compact.includes(compactQuery);
  }

  // 카드 번호 검색은 세트코드 경계를 인식한다.
  // "bt21" → 세트코드가 bt21로 시작하는 카드(BT21-xxx)만 매칭, BT2-1xx 는 제외.
  function cardNumberMatchesQuery(cardNo, rawQuery) {
    const q = String(rawQuery || "").toLowerCase().trim().replace(/\s+/g, "");
    if (!q) return false;
    const no = String(cardNo || "").toLowerCase();
    if (q.includes("-")) return no.includes(q); // 하이픈 포함 질의는 경계가 보존되므로 부분일치
    const [setCode, cardPart = ""] = no.split("-");
    if (/^\d+$/.test(q)) return cardPart.startsWith(q); // 숫자만 → 카드번호로 검색
    if (setCode.startsWith(q)) return true; // 세트코드 검색 (bt21 → BT21만)
    if (q === setCode + cardPart) return true; // 하이픈 없는 전체 번호 정확검색
    return false;
  }

  function deckCardFilters() {
    return state.deckCardFilters || createDefaultDeckCardFilters();
  }

  function cardSetPrefix(card) {
    const match = String(card?.no || "").match(/^[A-Z]+/);
    return match?.[0] || "기타";
  }

  function catalogSetPrefixes() {
    return [...new Set(CARD_CATALOG.map(cardSetPrefix))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  }

  function cardHasAnyColor(card, selectedColors) {
    if (!selectedColors.length) return true;
    return selectedColors.includes(card.color) || selectedColors.includes(card.color2);
  }

  function catalogSortValue(card) {
    const prefix = cardSetPrefix(card);
    const number = Number(String(card.no || "").match(/\d+/)?.[0] || 0);
    return { prefix, number };
  }

  function compareCatalogCards(a, b) {
    const filters = deckCardFilters();
    if (filters.sort === "latest") {
      const aKey = catalogSortValue(a);
      const bKey = catalogSortValue(b);
      return bKey.prefix.localeCompare(aKey.prefix, "ko", { numeric: true }) || bKey.number - aKey.number || b.index - a.index;
    }
    if (filters.sort === "number") return a.no.localeCompare(b.no, "ko", { numeric: true });
    if (filters.sort === "level") return (Number(a.level) || 99) - (Number(b.level) || 99) || a.no.localeCompare(b.no, "ko", { numeric: true });
    if (filters.sort === "name") return a.name.localeCompare(b.name, "ko") || a.no.localeCompare(b.no, "ko", { numeric: true });
    return a.index - b.index;
  }

  function activeDeckAdvancedFilterCount() {
    const filters = deckCardFilters();
    return (
      filters.colors.length +
      filters.levels.length +
      (filters.setPrefix !== "all" ? 1 : 0) +
      (filters.sort !== "catalog" ? 1 : 0)
    );
  }

  function filteredCatalogCardPool() {
    const query = state.deckCardSearch.trim().toLowerCase();
    const compactQuery = normalizeCatalogQuery(state.deckCardSearch);
    const filters = deckCardFilters();
    return CARD_CATALOG.filter((card) => {
      if (state.deckCardType !== "all" && card.type !== state.deckCardType) return false;
      if (!cardHasAnyColor(card, filters.colors)) return false;
      if (filters.levels.length && !filters.levels.includes(card.level)) return false;
      if (filters.setPrefix !== "all" && cardSetPrefix(card) !== filters.setPrefix) return false;
      if (!query) return true;
      if (cardNumberMatchesQuery(card.no, query)) return true;
      return catalogTextMatches(card, query, compactQuery);
    }).sort(compareCatalogCards);
  }

  function filteredCatalogCards() {
    return filteredCatalogCardPool().slice(0, CARD_BROWSER_LIMIT);
  }

  function recentMatchDefaults() {
    const saved = data.settings?.quickMatchDefaults || {};
    const latest = data.matches[0] || null;
    const playOrders = ["unknown", "first", "second"];
    const savedDeckId = data.decks.some((deck) => deck.id === saved.deckId) ? saved.deckId : "";
    const latestDeckId = latest && data.decks.some((deck) => deck.id === latest.deckId) ? latest.deckId : "";
    const savedTypeValue = normalizeMatchTypeName(saved.matchType);
    const latestTypeValue = normalizeMatchTypeName(latest?.matchType);
    const savedType = data.matchTypes.includes(savedTypeValue) ? savedTypeValue : "";
    const latestType = latest && data.matchTypes.includes(latestTypeValue) ? latestTypeValue : "";
    const savedPlayOrder = playOrders.includes(saved.playOrder) ? saved.playOrder : "";
    const latestPlayOrder = latest && playOrders.includes(latest.playOrder) ? latest.playOrder : "";
    return {
      deckId: savedDeckId || latestDeckId || data.decks[0]?.id || "",
      matchType: savedType || latestType || data.matchTypes[0] || "대전",
      opponent: String(saved.opponent || latest?.opponent || "").trim(),
      playOrder: savedPlayOrder || latestPlayOrder || "unknown",
    };
  }

  function rememberMatchDefaults(match) {
    data.settings = {
      ...(data.settings || {}),
      quickMatchDefaults: {
        deckId: match.deckId,
        matchType: normalizeMatchTypeName(match.matchType) || "대전",
        opponent: match.opponent,
        playOrder: match.playOrder,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  function recentDeckOptions(limit = 5) {
    const seen = new Set();
    const deckIds = [];
    [...data.matches]
      .sort((a, b) => `${b.date || ""}${b.createdAt || ""}`.localeCompare(`${a.date || ""}${a.createdAt || ""}`))
      .forEach((match) => {
        if (!match.deckId || seen.has(match.deckId) || !getDeck(match.deckId)) return;
        seen.add(match.deckId);
        deckIds.push(match.deckId);
      });
    data.decks.forEach((deck) => {
      if (seen.has(deck.id)) return;
      seen.add(deck.id);
      deckIds.push(deck.id);
    });
    return deckIds.slice(0, limit).map(getDeck).filter(Boolean);
  }

  function recentOpponentOptions(limit = 6) {
    const seen = new Set();
    const opponents = [];
    [...data.matches]
      .sort((a, b) => `${b.date || ""}${b.createdAt || ""}`.localeCompare(`${a.date || ""}${a.createdAt || ""}`))
      .forEach((match) => {
        const opponent = normalizeOpponentDeckName(match.opponent);
        const key = matchupOpponentKey(opponent);
        if (!opponent || seen.has(key)) return;
        seen.add(key);
        opponents.push(opponent);
      });
    return opponents.slice(0, limit);
  }

  function selectedAttr(value, expected) {
    return value === expected ? " selected" : "";
  }

  function checkedAttr(value, expected) {
    return value === expected ? " checked" : "";
  }

  function gameStatsFromScore(score) {
    const option = MATCH_SCORE_OPTIONS.find(([value]) => value === score) || MATCH_SCORE_OPTIONS[0];
    return { gameWins: option[1], gameLosses: option[2], gameDraws: option[3] };
  }

  function gameStatsForMatch(match) {
    if (match?.matchFormat === "match") {
      return normalizeGameStats(match.gameWins, match.gameLosses, match.gameDraws, match.result);
    }
    return singleGameStats(match?.result);
  }

  function matchScoreValue(match) {
    const stats = gameStatsForMatch(match);
    const value = `${stats.gameWins}-${stats.gameLosses}${stats.gameDraws ? `-${stats.gameDraws}` : ""}`;
    return MATCH_SCORE_OPTIONS.some(([score]) => score === value) ? value : "2-0";
  }

  function matchFormatLabel(match) {
    if (match?.matchFormat === "match") return `매치전 ${matchScoreValue(match)}`;
    return "단판";
  }

  function addMatchToStats(stats, match) {
    stats.total += 1;
    if (match.result === "win") stats.wins += 1;
    if (match.result === "loss") stats.losses += 1;
    if (match.result === "draw") stats.draws += 1;
    const gameStats = gameStatsForMatch(match);
    stats.gameWins += gameStats.gameWins;
    stats.gameLosses += gameStats.gameLosses;
    stats.gameDraws += gameStats.gameDraws;
    stats.gameTotal += gameStats.gameWins + gameStats.gameLosses + gameStats.gameDraws;
    return stats;
  }

  function colorDots(colors) {
    const safeColors = Array.isArray(colors) && colors.length ? colors : ["blue"];
    return `<span class="color-dots">${safeColors
      .map((color) => {
        const hex = colorMap[color] || colorMap.blue;
        return `<span class="color-dot" style="--dot-color: ${hex}" aria-hidden="true"></span>`;
      })
      .join("")}</span>`;
  }

  function deckCards(deck) {
    return normalizeCards(deck?.cards || []);
  }

  function deckCountSummary(cards, excludeId = "") {
    return normalizeCards(cards).reduce(
      (summary, card) => {
        if (card.id === excludeId) return summary;
        const count = Number(card.count) || 0;
        summary.total += count;
        if (card.type === "digiEgg") summary.digiEgg += count;
        else summary.main += count;
        return summary;
      },
      { total: 0, main: 0, digiEgg: 0 }
    );
  }

  function deckLimitViolation(cards) {
    const summary = deckCountSummary(cards);
    if (summary.total > DECK_LIMITS.total) return `덱은 최대 ${DECK_LIMITS.total}장까지 구성할 수 있습니다.`;
    if (summary.main > DECK_LIMITS.main) return `일반 덱은 최대 ${DECK_LIMITS.main}장까지 구성할 수 있습니다.`;
    if (summary.digiEgg > DECK_LIMITS.digiEgg) return `디지타마는 최대 ${DECK_LIMITS.digiEgg}장까지 구성할 수 있습니다.`;
    return "";
  }

  function deckSortValue(card) {
    const typeOrder = { digiEgg: 0, digimon: 1, tamer: 2, option: 3, other: 4 };
    return [
      typeOrder[card.type] ?? 9,
      Number(card.level || 99),
      normalizeCardNumber(card.cardNumber),
      String(card.name || ""),
    ];
  }

  function compareDeckCards(a, b) {
    const left = deckSortValue(a);
    const right = deckSortValue(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function sortDeckCards(cards) {
    return normalizeCards(cards).sort(compareDeckCards);
  }

  // 덱 목록 표시용 정렬 (레벨순 / 번호순 / 종류순)
  function sortDeckCardsBy(cards, mode) {
    const list = normalizeCards(cards);
    if (mode === "number") {
      return list.sort((a, b) => normalizeCardNumber(a.cardNumber).localeCompare(normalizeCardNumber(b.cardNumber), "ko", { numeric: true }));
    }
    if (mode === "level") {
      return list.sort((a, b) => (Number(a.level) || 99) - (Number(b.level) || 99) || compareDeckCards(a, b));
    }
    return list.sort(compareDeckCards); // "type" 기본
  }

  function printDraftDeckRecipe() {
    const form = document.getElementById("deck-form");
    cacheDeckDraftForm(form);
    const draft = state.deckDraftForm || {};
    printDeckRecipe({
      id: state.editingDeckId || "draft-deck",
      name: String(draft.name || "").trim() || "이름 없는 덱",
      note: String(draft.note || ""),
      colors: Array.isArray(draft.colors) && draft.colors.length ? draft.colors : ["blue"],
      cards: normalizeCards(state.deckDraftCards),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function safeFileName(name) {
    return String(name || "deck-recipe")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function downloadDraftDeckRecipeDocx() {
    const form = document.getElementById("deck-form");
    cacheDeckDraftForm(form);
    const draft = state.deckDraftForm || {};
    downloadDeckRecipeDocx({
      id: state.editingDeckId || "draft-deck",
      name: String(draft.name || "").trim() || "이름 없는 덱",
      note: String(draft.note || ""),
      colors: Array.isArray(draft.colors) && draft.colors.length ? draft.colors : ["blue"],
      cards: normalizeCards(state.deckDraftCards),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function cardTypeLabel(type) {
    return cardTypeLabels[type] || cardTypeLabels.other;
  }

  function getFilteredMatches() {
    const query = state.filters.query.trim().toLowerCase();
    return [...data.matches]
      .filter((match) => {
        if (state.filters.result !== "all" && match.result !== state.filters.result) return false;
        if (state.filters.deck !== "all" && match.deckId !== state.filters.deck) return false;
        if (state.filters.type !== "all" && match.matchType !== state.filters.type) return false;
        if (state.memoOnly && !match.memo?.trim()) return false;
        if (!query) return true;
        const haystack = [
          deckName(match.deckId),
          match.opponent,
          match.matchType,
          match.memo,
          resultLabel(match.result),
          matchFormatLabel(match),
          tournamentMatchText(match),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => `${b.date || ""}${b.createdAt || ""}`.localeCompare(`${a.date || ""}${a.createdAt || ""}`));
  }

  function shareDateValue() {
    return state.shareDate || todayISO();
  }

  function shareRateText(wins, total) {
    if (!total) return "0%";
    const value = (wins / total) * 100;
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }

  function shareRecordText(stats) {
    return `${stats.total}전 ${stats.wins}승 ${stats.losses}패${stats.draws ? ` ${stats.draws}무` : ""}`;
  }

  function shareScoreText(stats) {
    return stats.draws ? `${stats.wins}-${stats.losses}-${stats.draws}` : `${stats.wins}-${stats.losses}`;
  }

  function shareGameRecordText(stats) {
    return `${stats.gameTotal || 0}게임 ${stats.gameWins || 0}승 ${stats.gameLosses || 0}패${stats.gameDraws ? ` ${stats.gameDraws}무` : ""}`;
  }

  function shareGameScoreText(stats) {
    return stats.gameDraws ? `${stats.gameWins || 0}-${stats.gameLosses || 0}-${stats.gameDraws}` : `${stats.gameWins || 0}-${stats.gameLosses || 0}`;
  }

  function hasMatchGameBreakdown(stats) {
    return Boolean(stats?.gameTotal && stats.gameTotal !== stats.total);
  }

  function matchesForShareDate(date) {
    const seen = new Set();
    return data.matches.filter((match) => {
      const tournament = getTournament(match.tournamentId);
      const matchesDate = match.date === date || tournament?.date === date;
      if (!matchesDate || seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    });
  }

  function tournamentSummaryRows(date, matches) {
    const rows = new Map();
    const tournamentIdsForDate = new Set(data.tournaments.filter((tournament) => tournament.date === date).map((tournament) => tournament.id));
    matches.forEach((match) => {
      if (match.tournamentId) tournamentIdsForDate.add(match.tournamentId);
    });
    data.matches
      .filter((match) => match.tournamentId && tournamentIdsForDate.has(match.tournamentId))
      .forEach((match) => {
        const tournament = getTournament(match.tournamentId);
        const key = match.tournamentId;
        if (!rows.has(key)) {
          rows.set(key, {
            tournamentId: key,
            name: tournament?.name || "대회 미지정",
            date: tournament?.date || date,
            format: tournament?.format || "mixed",
            location: tournament?.location || "",
            matches: [],
            ...emptyRecordStats(),
          });
        }
        const row = rows.get(key);
        row.matches.push(match);
        addMatchToStats(row, match);
      });
    return [...rows.values()]
      .map((row) => ({
        ...finalizeRecordStats(row),
        tournamentId: row.tournamentId,
        name: row.name,
        date: row.date,
        format: row.format,
        location: row.location,
        matches: row.matches,
        stageSummary: tournamentStageSummary(row.matches, row.format),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  function shareDateTitle(date) {
    if (date === todayISO()) return "오늘 전적";
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "하루 전적";
    return `${parsed.getMonth() + 1}/${parsed.getDate()} 전적`;
  }

  function dailyShareSummary(date = shareDateValue()) {
    const matches = matchesForShareDate(date);
    const stats = emptyRecordStats();
    const deckRows = new Map();
    const matchupRows = new Map();

    matches.forEach((match) => {
      addMatchToStats(stats, match);

      const deckId = match.deckId || "missing";
      const deckLabel = deckId === "missing" ? "덱 미기록" : deckName(deckId);
      if (!deckRows.has(deckId)) deckRows.set(deckId, { deckId, label: deckLabel, ...emptyRecordStats() });
      const deckRow = deckRows.get(deckId);
      addMatchToStats(deckRow, match);

      const opponent = normalizeOpponentDeckName(match.opponent) || "상대 미기록";
      const matchupKey = opponent.toLowerCase();
      if (!matchupRows.has(matchupKey)) matchupRows.set(matchupKey, { opponent, ...emptyRecordStats() });
      const matchupRow = matchupRows.get(matchupKey);
      addMatchToStats(matchupRow, match);
    });

    return {
      date,
      matches,
      stats: finalizeRecordStats(stats),
      decks: [...deckRows.values()].map(finalizeRecordStats).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "ko")),
      matchups: [...matchupRows.values()].map(finalizeRecordStats).sort((a, b) => b.total - a.total || a.opponent.localeCompare(b.opponent, "ko")),
      tournaments: tournamentSummaryRows(date, matches),
    };
  }

  function dailyShareDeckLine(decks) {
    if (!decks.length) return "덱: 미기록";
    if (decks.length === 1) return `덱: ${decks[0].label}`;
    return `덱: ${decks
      .map((deck) => `${deck.label} ${shareRecordText(deck)}${hasMatchGameBreakdown(deck) ? ` (게임 ${shareGameScoreText(deck)})` : ""}`)
      .join(" / ")}`;
  }

  function dailyShareUsedDecks(summary) {
    const seen = new Set();
    return summary.decks
      .map((row) => getDeck(row.deckId))
      .filter((deck) => {
        if (!deck || seen.has(deck.id) || !deckCards(deck).length) return false;
        seen.add(deck.id);
        return true;
      });
  }

  function compactRecordText(stats) {
    return `${stats.wins || 0}승 ${stats.losses || 0}패${stats.draws ? ` ${stats.draws}무` : ""}`;
  }

  function compactGameRecordText(stats) {
    return `${stats.gameWins || 0}승 ${stats.gameLosses || 0}패${stats.gameDraws ? ` ${stats.gameDraws}무` : ""}`;
  }

  function tournamentDeckText(matches) {
    const deckNames = [];
    const seen = new Set();
    matches.forEach((match) => {
      if (!match.deckId || seen.has(match.deckId)) return;
      seen.add(match.deckId);
      deckNames.push(deckName(match.deckId));
    });
    return deckNames.length ? deckNames.join(" / ") : "미기록";
  }

  function topCutLabel(total) {
    if (total >= 3) return `Top${2 ** total}`;
    if (total === 2) return "Top4";
    if (total === 1) return "결승";
    return "토너먼트";
  }

  function stageSummaryLine(stage, matches) {
    const stats = stageStatsFromMatches(matches, stage);
    if (!stats.total) return "";
    if (stage === "swiss") return `스위스 ${stats.total}R ${compactRecordText(stats)}`;
    if (stage === "top") return `토너먼트 ${topCutLabel(stats.total)} ${compactRecordText(stats)}`;
    return `라운드 미구분 ${shareRecordText(stats)}`;
  }

  function roundLabelForShare(match, indexByStage) {
    const saved = String(match.roundLabel || "").trim();
    if (saved) return saved;
    if (match.roundStage === "swiss") return `R${indexByStage + 1}`;
    if (match.roundStage === "top") return `토너먼트 ${indexByStage + 1}`;
    return `R${indexByStage + 1}`;
  }

  function roundResultForShare(match) {
    if (match.roundStage === "swiss") return resultShortLabel(match.result);
    return match.matchFormat === "match" ? matchScoreValue(match) : resultShortLabel(match.result);
  }

  function tournamentShareRoundLines(matches) {
    const counters = { swiss: 0, top: 0, none: 0 };
    return [...matches]
      .sort((a, b) => {
        const order = { swiss: 0, top: 1, none: 2 };
        const stageA = a.roundStage || "none";
        const stageB = b.roundStage || "none";
        return (order[stageA] ?? 9) - (order[stageB] ?? 9) || `${a.date || ""}${a.createdAt || ""}`.localeCompare(`${b.date || ""}${b.createdAt || ""}`);
      })
      .map((match) => {
        const stage = match.roundStage || "none";
        const index = counters[stage] || 0;
        counters[stage] = index + 1;
        const team3 = match.teamResult ? ` · 팀 ${resultShortLabel(match.teamResult)}` : "";
        return `${roundLabelForShare(match, index)} vs ${match.opponent || "상대 미기록"} ${roundResultForShare(match)}${team3}`;
      });
  }

  function tournamentShareTitle(row) {
    const location = String(row.location || "").trim();
    const name = String(row.name || "대회").trim();
    return `${location ? `${location} ` : ""}${name} 전적`;
  }

  // 3대3 팀전 공유 요약: 내 자리 + 팀 승패(내 결과와 별개)
  function team3ShareSummary(matches) {
    const team3 = matches.filter((match) => match.teamResult);
    if (!team3.length) return null;
    const seats = [...new Set(team3.map((match) => match.teamPosition).filter(Boolean))];
    const rec = { win: 0, loss: 0, draw: 0 };
    team3.forEach((match) => { rec[match.teamResult] = (rec[match.teamResult] || 0) + 1; });
    const seatText = seats.length ? `내 자리 ${seats.join("/")}` : "";
    const recordText = `팀 ${rec.win}승 ${rec.loss}패${rec.draw ? ` ${rec.draw}무` : ""}`;
    return { line: `🤝 3대3 팀전${seatText ? ` · ${seatText}` : ""} · ${recordText}` };
  }

  function tournamentDailyShareBlock(row) {
    const lines = [
      tournamentShareTitle(row),
      "",
      `사용 덱: ${tournamentDeckText(row.matches)}`,
    ];
    const team3 = team3ShareSummary(row.matches);
    if (team3) lines.push(team3.line);
    const roundLines = tournamentShareRoundLines(row.matches);
    if (roundLines.length) lines.push("", ...roundLines);
    return lines.join("\n");
  }

  function dailyShareText(date = shareDateValue()) {
    const summary = dailyShareSummary(date);
    if (!summary.stats.total) return "";
    if (summary.tournaments.length) {
      return [...summary.tournaments.map(tournamentDailyShareBlock), "#디지몬카드게임 #전적몬"].join("\n\n");
    }
    const lines = [];
    const team3 = team3ShareSummary(summary.matches);
    lines.push(dailyShareDeckLine(summary.decks));
    if (team3) lines.push(team3.line);
    lines.push(
      ...summary.matchups.map((row) => `vs ${row.opponent} ${shareScoreText(row)}${hasMatchGameBreakdown(row) ? ` (게임 ${shareGameScoreText(row)})` : ""}`),
      "",
      "#디지몬카드게임 #전적몬"
    );
    return lines.join("\n");
  }

  function renderDailyShareCard() {
    const date = shareDateValue();
    const summary = dailyShareSummary(date);
    const shareText = dailyShareText(date);
    const canSaveDeckImage = dailyShareUsedDecks(summary).length > 0;
    return `
      <div class="settings-card daily-share-card" data-daily-share-card>
        <div class="daily-share-head">
          <div>
            <h2 class="settings-title">오늘 전적 공유</h2>
            <div class="mini-text">선택한 날짜의 전적을 X에 올리기 좋은 형식으로 정리합니다.</div>
          </div>
          <label class="share-date-field">
            <span>공유 날짜</span>
            <input class="input" type="date" value="${escapeHTML(date)}" data-daily-share-date />
          </label>
        </div>
        ${
          summary.stats.total
            ? `<pre class="daily-share-preview">${escapeHTML(shareText)}</pre>`
            : `<div class="daily-share-empty">선택한 날짜에 기록된 전적이 없습니다.</div>`
        }
        <div class="daily-share-actions">
          <button class="control-button" type="button" data-action="copy-daily-share" ${summary.stats.total ? "" : "disabled"}>복사</button>
          <button class="control-button" type="button" data-action="save-daily-share-image" ${canSaveDeckImage ? "" : "disabled"}>사용 덱 이미지 저장</button>
          <button class="primary-action compact" type="button" data-action="open-daily-share-x" ${summary.stats.total ? "" : "disabled"}>X 작성창 열기</button>
        </div>
      </div>
    `;
  }

  function matchupCardRows(deckId, matches) {
    const deck = getDeck(deckId);
    const stats = statsFromMatches(matches);
    return normalizeCards(deck?.cards || [])
      .filter((card) => card.type !== "digiEgg")
      .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0) || compareDeckCards(a, b))
      .slice(0, 6)
      .map((card) => ({ card, stats }));
  }

  function matchupNoteRows(row, playRows) {
    if (!row) return [];
    const notes = [];
    const first = playRows.find((item) => item.label === "선공")?.stats;
    const second = playRows.find((item) => item.label === "후공")?.stats;
    if (row.total < 3) {
      notes.push(["기록 더 필요", "아직 표본이 적어서 승률보다 최근 경기 메모를 같이 보는 편이 좋습니다."]);
    } else if (row.rate >= 65) {
      notes.push(["좋은 흐름", "상성이 괜찮게 나오고 있습니다. 덱을 수정하기 전 현재 리스트를 저장해두면 비교하기 좋습니다."]);
    } else if (row.rate <= 45) {
      notes.push(["조정 후보", "패배가 더 많은 매치업입니다. 최근 대전 메모와 선후공 차이를 먼저 확인해보세요."]);
    }
    if (first?.total && second?.total && Math.abs(first.rate - second.rate) >= 20) {
      const weak = first.rate < second.rate ? "선공" : "후공";
      notes.push([`${weak} 경기 확인`, `${weak} 승률이 상대적으로 낮습니다. 해당 경기만 따로 메모를 남기면 조정 포인트가 더 잘 보입니다.`]);
    }
    return notes.slice(0, 2);
  }

  function matchDateTime(match) {
    const fromDate = new Date(`${match?.date || ""}T00:00:00`).getTime();
    if (Number.isFinite(fromDate)) return fromDate;
    const fromCreatedAt = new Date(match?.createdAt || "").getTime();
    return Number.isFinite(fromCreatedAt) ? fromCreatedAt : 0;
  }

  const { homeRecentDeckRows, homeTrendRows, renderHomeView, renderHomeStarterCard } =
    window.JJM.viewsHome.createHomeViews({
      escapeHTML,
      formatDate,
      todayISO,
      playOrderLabel,
      deckName,
      matchDateTime,
      shareRecordText,
      shareScoreText,
      summaryStats,
      dailyShareSummary,
      deckMatchupRows,
      recentMatchDefaults,
      shouldShowStarterGuide,
      renderHomeCardSearch,
      getData: () => data,
    });
  let lastRenderedDialog = "";
  function render() {
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-icon" aria-hidden="true">
              <span class="pixel-core"></span>
            </span>
            <div class="brand-copy">
              <h1 class="brand-title">전적몬</h1>
              <span class="brand-subtitle">CARD BATTLE LOG</span>
            </div>
          </div>
          ${renderAuthControls()}
          <button class="icon-button topbar-settings${state.tab === "settings" ? " active" : ""}" type="button" data-tab="settings" aria-label="설정" title="설정"${state.tab === "settings" ? ' aria-current="page"' : ""}>⚙</button>
        </header>
        <nav class="tabs" aria-label="주요 화면">
          ${tabs
            .map(
              ([id, label]) => `
                <button class="tab-button ${state.tab === id ? "active" : ""}" type="button" data-tab="${id}"${state.tab === id ? ' aria-current="page"' : ""}>
                  ${label}
                </button>
              `
            )
            .join("")}
        </nav>
        <main class="content ${state.tab === "home" ? "home-content" : ""} ${["tournaments", "matches", "stats", "events", "decks"].includes(state.tab) ? "wide-content" : ""}${state.tab === "events" ? " calendar-content" : ""}">${renderCurrentTab()}</main>
        ${renderCloudConflictBanner()}
        ${renderModal()}
        ${renderCardPreview()}
        ${renderToastStack()}
      </div>
    `;
    // 모달이 열려 있을 때 배경 페이지 스크롤 차단
    document.body.classList.toggle("modal-open", !!(state.modal || state.previewCardNo));
    document.body.classList.toggle("deck-modal-open", state.modal === "deck");
    // 접근성: 다이얼로그가 열리면 포커스를 그 안으로 옮긴다(WCAG 2.4.3).
    // - 처음 열리는 렌더, 또는
    // - 다이얼로그가 열려 있는데 포커스가 body로 빠진 경우(내부 비동기 재렌더로 포커스 노드가 사라짐).
    // 텍스트 입력 자동 포커스는 모바일 키보드를 띄우므로 패널 컨테이너(tabindex=-1)에만 포커스.
    // 사용자가 특정 필드를 쓰는 중(activeElement가 실제 요소)이면 뺏지 않는다.
    const openedDialog = state.modal || (state.previewCardNo ? "preview" : "");
    if (openedDialog) {
      const panel = document.querySelector(state.previewCardNo ? ".card-preview-panel" : ".modal-panel");
      const focusLost = document.activeElement === document.body || document.activeElement === null;
      if (panel && !panel.contains(document.activeElement) && (openedDialog !== lastRenderedDialog || focusLost)) {
        panel.focus({ preventScroll: true });
      }
    }
    lastRenderedDialog = openedDialog;
  }

  let pendingDeckScroll = null;
  let previewReturnScroll = null;
  // 카드번호 → 패럴렐(추가 일러스트) 이미지 URL 배열. 탐색이 끝난 카드만 저장(기본 일러는 제외).
  const previewParallelCache = {};
  async function loadCardParallelImages(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized || previewParallelCache[normalized]) return;
    const parallels = [];
    // _P1, _P2 … 순차 탐색. 첫 실패에서 중단(파일명이 연속이라 안전).
    for (let n = 1; n <= 12; n += 1) {
      const url = jpOfficialCardImageUrl(normalized, `_P${n}`);
      // eslint-disable-next-line no-await-in-loop
      if (await probeImageLoad(url)) parallels.push(url);
      else break;
    }
    previewParallelCache[normalized] = parallels;
    // 탐색 중 미리보기가 닫히거나 다른 카드로 바뀌지 않았고, 패럴렐이 있으면 갤러리를 다시 그린다.
    if (parallels.length && state.previewCardNo === normalized) {
      if (state.modal === "deck") renderKeepingDeckScroll();
      else render();
    }
  }
  // 대회일정 지역 칩 행은 모바일에서 가로 스크롤(overflow-x:auto)이라, 칩을 누르면
  // 전체 재렌더로 scrollLeft 이 0으로 리셋돼 맨 왼쪽으로 튄다 → 가로 스크롤 위치를 보존한다.
  function renderKeepingRegionScroll() {
    const prevLeft = document.querySelector(".event-region-chips")?.scrollLeft || 0;
    render();
    if (!prevLeft) return;
    const restore = () => {
      const chips = document.querySelector(".event-region-chips");
      if (chips) chips.scrollLeft = prevLeft;
    };
    restore(); // 동기 복원(innerHTML 직후 새 칩 행이 이미 존재)
    window.requestAnimationFrame(restore); // 레이아웃 후 한 번 더 보정
  }
  function renderKeepingDeckScroll() {
    // 데스크톱은 내부 컨테이너(.deck-modal-panel/.catalog-grid)가 스크롤되고,
    // 모바일은 .deck-modal-backdrop(페이지)이 스크롤된다 → 양쪽 모두 저장/복원.
    // 같은 틱에 두 번 호출되면(미리보기 열기 + 정발효과 캐시 후 재렌더) 두 번째는 이미
    // 초기화된 스크롤(0)을 읽으므로, 첫 호출의 목표값을 유지해 덮어쓰기를 막는다.
    if (!pendingDeckScroll) {
      pendingDeckScroll = {
        backdrop: document.querySelector(".deck-modal-backdrop")?.scrollTop || 0,
        modal: document.querySelector(".deck-modal-panel")?.scrollTop || 0,
        catalog: document.querySelector(".catalog-grid")?.scrollTop || 0,
        deckList: document.querySelector(".hub-deck-list")?.scrollTop || 0,
        window: window.scrollY || 0,
      };
    }
    render();
    window.requestAnimationFrame(() => {
      if (!pendingDeckScroll) return;
      const target = pendingDeckScroll;
      pendingDeckScroll = null;
      const nextModalBackdrop = document.querySelector(".deck-modal-backdrop");
      const nextModalPanel = document.querySelector(".deck-modal-panel");
      const nextCatalogGrid = document.querySelector(".catalog-grid");
      const nextDeckList = document.querySelector(".hub-deck-list");
      if (nextModalBackdrop) nextModalBackdrop.scrollTop = target.backdrop;
      if (nextModalPanel) nextModalPanel.scrollTop = target.modal;
      if (nextCatalogGrid) nextCatalogGrid.scrollTop = target.catalog;
      if (nextDeckList) nextDeckList.scrollTop = target.deckList;
      if (target.window) window.scrollTo(0, target.window);
    });
  }

  function renderCurrentTab() {
    if (state.tab === "home") return renderHomeView();
    if (state.tab === "tournaments") return renderTournamentsView();
    if (state.tab === "events") return renderEventsView();
    if (state.tab === "decks") return renderDecksView();
    if (state.tab === "stats") return renderStatsView();
    if (state.tab === "settings") return renderSettingsView();
    return renderMatchesView();
  }

  const { renderMatchesView, renderDateGroupHeader, renderMatchDateSections, renderFilterPanel, renderMatchesEmpty, renderMatchCard } =
    window.JJM.viewsMatches.createMatchesViews({
      escapeHTML,
      formatDate,
      resultLabel,
      playOrderLabel,
      colorDots,
      deckName,
      getDeck,
      getTournament,
      getFilteredMatches,
      matchFormatLabel,
      roundText,
      selectedAttr,
      shareDateTitle,
      shareRateText,
      shareRecordText,
      statsFromMatches,
      tournamentMatchText,
      state,
      getData: () => data,
    });
  async function fetchTournamentEvents() {
    const client = cloudClient || (await ensureCloudClient());
    if (!client) return [];
    const { data: rows, error } = await client
      .from("tournament_events")
      .select("id, title, starts_at, ends_at, location, description")
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (rows || []).map((row) => ({
      id: row.id,
      title: row.title || "대회",
      startsAt: row.starts_at,
      endsAt: row.ends_at || "",
      location: row.location || "",
      description: row.description || "",
    }));
  }

  let eventsLoading = false;
  async function loadTournamentEvents(force = false) {
    if (eventsLoading || (state.eventsLoaded && !force)) return;
    eventsLoading = true;
    try {
      state.tournamentEvents = await fetchTournamentEvents();
      state.eventsLoaded = true;
      if (state.tab === "events") render();
    } catch (error) {
      recordDiagnostic("events-load-failed", error?.message || "Tournament events load failed");
    } finally {
      eventsLoading = false;
    }
  }

  async function upsertTournamentEvent(payload) {
    const client = cloudClient || (await ensureCloudClient());
    if (!client) throw new Error("DB 연결을 확인해 주세요.");
    const row = {
      title: payload.title,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt || null,
      location: payload.location || "",
      description: payload.description || "",
      updated_at: new Date().toISOString(),
      created_by: state.authUser?.id || null,
    };
    if (payload.id) row.id = payload.id;
    const { error } = await client.from("tournament_events").upsert(row);
    if (error) throw error;
  }

  async function deleteTournamentEventById(id) {
    const client = cloudClient || (await ensureCloudClient());
    if (!client) throw new Error("DB 연결을 확인해 주세요.");
    const { error } = await client.from("tournament_events").delete().eq("id", id);
    if (error) throw error;
  }

  // 개인 일정: 본인 데이터 블록(data.personalEvents)에 저장 → 본인만 보이고, 로그인 시 기기 간 동기화.
  function personalEventList() {
    return (data.personalEvents || []).map((event) => ({ ...event, personal: true }));
  }

  // 공식(클라우드) + 개인(로컬) 일정을 합쳐 캘린더에 표시
  function allCalendarEvents() {
    return [...state.tournamentEvents, ...personalEventList()];
  }

  function savePersonalEvent(payload) {
    const events = Array.isArray(data.personalEvents) ? [...data.personalEvents] : [];
    const next = {
      id: payload.id || uid("pevt"),
      title: payload.title,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt || "",
      location: payload.location || "",
      description: payload.description || "",
    };
    const idx = payload.id ? events.findIndex((e) => e.id === payload.id) : -1;
    if (idx >= 0) events[idx] = next;
    else events.push(next);
    data.personalEvents = normalizePersonalEvents(events);
    saveData(); // saveData 가 scheduleCloudSave 까지 호출(로그인 시 클라우드 동기화)
    return next.id;
  }

  function deletePersonalEventById(id) {
    data.personalEvents = (data.personalEvents || []).filter((e) => e.id !== id);
    saveData();
  }

  function findCalendarEvent(id) {
    return allCalendarEvents().find((e) => e.id === id) || null;
  }

  function downloadIcs(events, fileName) {
    if (!events.length) {
      notifyToast("내보낼 일정 없음", "등록된 대회 일정이 없습니다.", "info");
      return;
    }
    const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(String(fileName).replace(/\.ics$/i, ""))}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function eventRegion(event) {
    const location = String(event?.location || "").trim();
    if (!location) return "지역 없음";
    return location.split("·")[0].trim() || "지역 없음";
  }

  function tournamentEventRegionOptions(events = allCalendarEvents()) {
    const counts = new Map();
    events.forEach((event) => {
      const region = eventRegion(event);
      counts.set(region, (counts.get(region) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }

  function filteredTournamentEvents() {
    const events = allCalendarEvents();
    if (!state.eventRegionFilters.size) return events;
    return events.filter((event) => state.eventRegionFilters.has(eventRegion(event)));
  }

  function renderEventRegionFilters(events) {
    const regions = tournamentEventRegionOptions(events);
    if (!regions.length) return "";
    const selectedCount = state.eventRegionFilters.size;
    return `
      <div class="event-region-panel" aria-label="대회 일정 지역 필터">
        <div class="event-region-summary">
          <strong>지역</strong>
          <span>${selectedCount ? `${selectedCount}개 지역 선택 중` : "전체 지역 표시"}</span>
        </div>
        <div class="event-region-chips">
          <button class="region-chip ${selectedCount ? "" : "active"}" type="button" data-action="event-region-clear">
            전체
            <span>${events.length}</span>
          </button>
          ${regions
            .map(([region, count]) => {
              const active = state.eventRegionFilters.has(region);
              return `
                <button class="region-chip ${active ? "active" : ""}" type="button" data-action="event-region-toggle" data-region="${escapeHTML(region)}" aria-pressed="${active ? "true" : "false"}">
                  ${escapeHTML(region)}
                  <span>${count}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // 로컬 날짜/시간 포맷 헬퍼 (캘린더 일정 패널·이벤트 수정 모달에서 사용).
  // ※ 전적 뷰 분리(views-matches) 때 모듈로 옮겨가며 app.js에서 누락됐던 것을 복원.
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function localTimeStr(d) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function renderEventsView() {
    if (!state.eventsLoaded) loadTournamentEvents();
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const matrix = monthMatrix(year, month, todayISO());
    const visibleEvents = filteredTournamentEvents();
    const byDate = groupEventsByLocalDate(visibleEvents);
    const selDate = state.selectedCalendarDate;
    const admin = isAdminUser();
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `
      <section class="events-view">
        <div class="calendar-toolbar">
          <button class="icon-button" type="button" data-action="calendar-prev-month" aria-label="이전 달">‹</button>
          <strong class="calendar-title">${year}년 ${month + 1}월</strong>
          <button class="icon-button" type="button" data-action="calendar-next-month" aria-label="다음 달">›</button>
          <div class="calendar-tools">
            <button class="control-button compact" type="button" data-action="add-personal-event">＋ 내 일정</button>
            ${admin ? `<button class="control-button active compact" type="button" data-action="add-event">＋ 공식 일정</button>` : ""}
          </div>
        </div>
        ${!state.eventsLoaded ? `<div class="mini-text">대회 일정 불러오는 중…</div>` : ""}
        ${state.eventsLoaded ? renderEventRegionFilters(allCalendarEvents()) : ""}
        <div class="calendar-grid">
          ${weekdays.map((w, i) => `<div class="calendar-weekday${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}
          ${matrix.weeks
            .flat()
            .map((cell) => {
              const evs = byDate[cell.iso] || [];
              // 스크린리더용: 숫자만 읽히지 않도록 월/일·일정 수·오늘 여부를 라벨로 제공
              const [, cellMonth, cellDay] = cell.iso.split("-").map(Number);
              const cellLabel = `${cellMonth}월 ${cellDay}일${evs.length ? `, 일정 ${evs.length}건` : ""}${cell.isToday ? ", 오늘" : ""}`;
              return `
                <button class="calendar-cell${cell.inMonth ? "" : " out"}${cell.isToday ? " today" : ""}${cell.iso === selDate ? " selected" : ""}${evs.length ? " has-ev" : ""}" type="button" data-action="select-calendar-day" data-date="${cell.iso}" aria-label="${escapeHTML(cellLabel)}"${cell.iso === selDate ? ' aria-current="date"' : ""}>
                  <span class="cal-day">${cell.day}</span>
                  ${evs.slice(0, 2).map((e) => `<span class="cal-ev${e.personal ? " personal" : ""}">${escapeHTML(e.title)}</span>`).join("")}
                  ${evs.length > 2 ? `<span class="cal-more">+${evs.length - 2}</span>` : ""}
                </button>
              `;
            })
            .join("")}
        </div>
        ${
          selDate
            ? renderCalendarDayPanel(selDate, byDate[selDate] || [], admin)
            : `<div class="mini-text" style="margin-top: 10px;">날짜를 누르면 그날의 일정이 표시됩니다. '내 일정'으로 나만 보이는 일정을 추가할 수 있어요.${admin ? " 관리자는 '공식 일정'으로 공개 대회를 올립니다." : ""}</div>`
        }
      </section>
    `;
  }

  function renderCalendarDayPanel(date, events, admin) {
    return `
      <div class="settings-card" id="calendar-day-panel" style="margin-top: 12px;">
        <h2 class="settings-title">${escapeHTML(formatDate(date))} 일정</h2>
        ${
          events.length
            ? events
                .map((ev) => {
                  const t = new Date(ev.startsAt);
                  const time = Number.isNaN(t.getTime()) ? "" : localTimeStr(t);
                  // 개인 일정은 본인이 항상 편집/삭제 가능, 공식 일정은 관리자만.
                  const canEdit = ev.personal || admin;
                  return `
                    <div class="event-row${ev.personal ? " personal" : ""}">
                      <div class="event-main">
                        <strong>${ev.personal ? `<span class="event-tag">내 일정</span> ` : ""}${escapeHTML(ev.title)}</strong>
                        <span>${time}${ev.location ? ` · ${escapeHTML(ev.location)}` : ""}</span>
                        ${ev.description ? `<p class="match-memo">${escapeHTML(ev.description)}</p>` : ""}
                      </div>
                      <div class="event-actions">
                        <a class="control-button compact" href="${escapeHTML(googleCalendarUrl(ev))}" target="_blank" rel="noopener noreferrer">📅 구글</a>
                        <button class="control-button compact" type="button" data-action="ics-download" data-event-id="${escapeHTML(ev.id)}">.ics</button>
                        ${
                          canEdit
                            ? `<button class="icon-button" type="button" data-action="edit-event" data-event-id="${escapeHTML(ev.id)}" aria-label="일정 수정" title="수정">✎</button>
                               <button class="icon-button" type="button" data-action="delete-event" data-event-id="${escapeHTML(ev.id)}" aria-label="일정 삭제" title="삭제">×</button>`
                            : ""
                        }
                      </div>
                    </div>
                  `;
                })
                .join("")
            : `<div class="mini-text">이 날짜에 등록된 대회가 없습니다.</div>`
        }
      </div>
    `;
  }

  const { renderTournamentsView, renderTournamentFlowCard, renderTournamentDateSections, renderTournamentCard } =
    window.JJM.viewsTournaments.createTournamentViews({
      escapeHTML,
      formatDate,
      matchScoreValue,
      resultLabel,
      roundText,
      shareDateTitle,
      shareRateText,
      shareRecordText,
      sortedTournaments,
      statsFromMatches,
      tournamentFinalSummaryText,
      tournamentFormatLabel,
      tournamentMatches,
      tournamentNextActionText,
      tournamentRoundProgress,
      tournamentStageActionButton,
      tournamentStageSummary,
    });
  const { renderDecksView, renderDeckCard, renderDeckVersionsSection, renderDeckCardList } =
    window.JJM.viewsDecks.createDeckViews({
      escapeHTML,
      formatDate,
      colorDots,
      DECK_LIMITS,
      statsForDeck,
      statsForDeckCard,
      sortDeckCards,
      deckCards,
      deckCountSummary,
      deckReadiness,
      deckColorText,
      deckLastUsedLabel,
      deckVersionRecords,
      cardDisplayName,
      cardMetaText,
      normalizeCardNumber,
      getData: () => data,
    });

  const STATS_PERIODS = [
    ["all", "전체"],
    ["month", "이번 달"],
    ["30d", "최근 30일"],
    ["7d", "최근 7일"],
  ];
  // 메타 대시보드에서 제외할 대전 유형 (가벼운 테스트 판은 메타 통계에 넣지 않음)
  const META_EXCLUDED_MATCH_TYPES = ["테스트 플레이"];

  function statsPeriodFromValue(value) {
    return STATS_PERIODS.some(([key]) => key === value) ? value : "all";
  }

  function statsPeriodStartMs(period) {
    const now = new Date();
    if (period === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (period === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return -Infinity;
  }

  function statsScopedMatches() {
    const period = statsPeriodFromValue(state.statsPeriod);
    if (period === "all") return data.matches;
    const start = statsPeriodStartMs(period);
    return data.matches.filter((match) => matchDateTime(match) >= start);
  }

  const { renderStatsPeriodChips, renderMetaDashboardCard, renderStatsView, renderMatchupMetricBar, renderMatchupReportCard, renderBar } =
    window.JJM.viewsStats.createStatsViews({
      escapeHTML,
      formatDate,
      resultLabel,
      resultShortLabel,
      playOrderLabel,
      state,
      getData: () => data,
      STATS_PERIODS,
      META_EXCLUDED_MATCH_TYPES,
      statsPeriodFromValue,
      statsScopedMatches,
      statsFromMatches,
      opponentMetaRows,
      validMatchupDeckId,
      deckMatchupRows,
      validMatchupOpponent,
      matchupOpponentKey,
      matchesForMatchup,
      matchupBreakdownRows,
      matchupNoteRows,
      getDeck,
      selectedAttr,
      colorDots,
      shareScoreText,
      shareGameScoreText,
      hasMatchGameBreakdown,
      matchScoreValue,
      renderDailyShareCard,
    });
  const { renderSettingsView, renderContactSettingsCard, renderFirstUseGuideCard, renderServiceStatusCard, renderDiagnosticsSettingsCard, renderSyncSettingsCard, renderInstallSettingsCard, renderCardDataSettingsCard } =
    window.JJM.viewsSettings.createSettingsViews({
      escapeHTML,
      formatSyncTime,
      userEmail,
      cloudStatusText,
      dataSummary,
      cardDataSummary,
      diagnosticStatusInfo,
      backupStatusInfo,
      isAdminUser,
      recoveryStatusInfo,
      serviceStatusTone,
      syncTone,
      state,
      getData: () => data,
      APP_VERSION,
    });
  // 트랙 B: 모달/카드 미리보기/덱 빌더 뷰는 js/views-modals.js 로 이동(순수 렌더).
  // deckReadiness(deck)·matchupOpponentKey(stats)·staticKoreanOfficialEffect(card-effects) 등
  // 팩토리 산출물을 주입받으므로 그 팩토리들보다 뒤(여기)에서 생성한다.
  // updateDeckCatalogResults/commitDeckCardSearch 는 deckSearchTimer(재할당 let) 때문에 app.js 잔류.
  const {
    renderModal,
    renderCardPreview,
    renderCatalogGridContent,
    imageIndexToArt,
    imageIndexFromArt,
    renderEventModal,
    renderKoreanCardPreview,
    renderCardEffectBlocks,
    renderCardEffectBlock,
    modalFrame,
    renderDeckImportModal,
    renderTournamentModal,
    renderMatchModal,
    renderDeckModal,
    renderCatalogCard,
    renderDeckListRow,
    renderDeckThumb,
    renderDeckThumbSections,
    renderManualCardInput,
    renderDeckFilterChip,
    renderDeckAdvancedSearch,
    renderDeckBuilder,
  } = window.JJM.viewsModals.createModalViews({
    getData: () => data,
    state,
    previewParallelCache,
    effectLoadingCards,
    colorMap,
    colorLabels,
    cardTypeLabels,
    CARD_BROWSER_LIMIT,
    CARD_CATALOG,
    DECK_LIMITS,
    KOREAN_CARD_PREVIEWS,
    MATCH_SCORE_OPTIONS,
    ROUND_STAGE_OPTIONS,
    TEAM3_MATCH_TYPE,
    BUILTIN_MATCH_TYPES,
    TEAM_POSITION_OPTIONS,
    TOURNAMENT_CUT_OPTIONS,
    TOURNAMENT_FORMAT_OPTIONS,
    escapeHTML,
    todayISO,
    resultLabel,
    normalizeCardNumber,
    normalizeCards,
    matchupOpponentKey,
    staticKoreanOfficialEffect,
    getTournament,
    sortedTournaments,
    suggestedRoundLabel,
    suggestedTeamPosition,
    suggestedTournamentStage,
    tournamentRoundProgress,
    deckReadiness,
    activeDeckAdvancedFilterCount,
    availableCopiesForCard,
    cacheDeckDraftForm,
    cardDisplayName,
    cardMetaText,
    cardPreviewData,
    cardTypeLabel,
    catalogCardToDraft,
    catalogImageSource,
    catalogMetaText,
    catalogSetPrefixes,
    checkedAttr,
    colorLabel,
    deckCardFilters,
    deckCardImageSource,
    deckCountSummary,
    deckLevelCounts,
    deckLimitViolation,
    filteredCatalogCardPool,
    filteredCatalogCards,
    findCalendarEvent,
    localDateStr,
    localTimeStr,
    matchScoreValue,
    recentDeckOptions,
    recentMatchDefaults,
    recentOpponentOptions,
    remoteCardImageUrl,
    selectedAttr,
    sortDeckCardsBy,
  });

  function updateDeckCatalogResults() {
    const catalogGrid = document.querySelector(".catalog-grid");
    if (!catalogGrid) return;
    catalogGrid.innerHTML = renderCatalogGridContent();
    const resultCount = document.querySelector(".deck-advanced-result-count");
    const total = filteredCatalogCardPool().length;
    if (resultCount) resultCount.textContent = `${total}종 검색됨 · 최대 ${CARD_BROWSER_LIMIT}종 표시`;
    const flowCount = document.querySelector("[data-builder-result-count]");
    if (flowCount) flowCount.textContent = `${total.toLocaleString("ko-KR")}종 검색됨`;
  }

  function commitDeckCardSearch(input) {
    if (!input) return;
    cacheDeckDraftForm(input.closest("#deck-form"));
    state.deckCardSearch = input.value;
    clearTimeout(deckSearchTimer);
    updateDeckCatalogResults();
  }


  function closeModal() {
    state.modal = null;
    state.previewCardNo = "";
    state.editingMatchId = null;
    state.editingTournamentId = null;
    state.prefillMatchTournamentId = "";
    state.prefillMatchRoundStage = "";
    state.prefillMatchRoundLabel = "";
    state.editingDeckId = null;
    state.importingDecks = false;
    state.deckDraftForm = null;
    state.deckDraftCards = [];
    state.editingEventId = null;
    render();
  }

  function closeCardPreview() {
    const inDeckModal = state.modal === "deck";
    const returnScroll = previewReturnScroll;
    previewReturnScroll = null;
    state.previewCardNo = "";
    if (inDeckModal) {
      renderKeepingDeckScroll();
      return;
    }
    render();
    if (returnScroll != null) {
      window.scrollTo(0, returnScroll.y || 0);
      if (returnScroll.homeResults != null) {
        const resultsBox = document.querySelector("[data-home-card-search-results]");
        if (resultsBox) resultsBox.scrollTop = returnScroll.homeResults;
      }
    }
  }

  function syncMatchFormMode(form) {
    if (!form) return;
    const roundStage = form.querySelector('input[name="roundStage"]:checked')?.value || "none";
    const isSwiss = roundStage === "swiss";
    if (isSwiss) {
      const singleInput = form.querySelector('input[name="matchFormat"][value="single"]');
      if (singleInput) singleInput.checked = true;
      const drawInput = form.querySelector('input[name="result"][value="draw"]');
      const winInput = form.querySelector('input[name="result"][value="win"]');
      if (drawInput?.checked && winInput) winInput.checked = true;
    }
    const matchFormat = form.querySelector('input[name="matchFormat"]:checked')?.value || "single";
    const isMatchMode = !isSwiss && matchFormat === "match";
    form.classList.toggle("swiss-mode", isSwiss);
    form.classList.toggle("match-mode", isMatchMode);
    form.classList.toggle("single-mode", !isMatchMode);
    // 3대3 팀전 유형이면 자리·팀 결과 필드 노출
    const isTeam3 = (form.querySelector('[name="matchType"]')?.value || "") === TEAM3_MATCH_TYPE;
    form.classList.toggle("team3-mode", isTeam3);
  }

  function applyTournamentDefaultsToMatchForm(form, options = {}) {
    if (!form) return;
    const tournamentId = form.querySelector('[name="tournamentId"]')?.value || "";
    const tournament = getTournament(tournamentId);
    const roundStage = form.querySelector('input[name="roundStage"]:checked')?.value || "none";
    const effectiveStage = tournament && roundStage === "none" ? suggestedTournamentStage(tournament.id) : roundStage;
    const roundInput = form.querySelector('[name="roundLabel"]');
    if (tournament && roundInput) {
      const suggested = suggestedRoundLabel(tournament.id, effectiveStage);
      if (options.force || !roundInput.value.trim() || roundInput.dataset.suggestedRound === roundInput.value) {
        roundInput.value = suggested;
        roundInput.dataset.suggestedRound = suggested;
      }
    }
    if (tournament && effectiveStage === "top") {
      const matchInput = form.querySelector('input[name="matchFormat"][value="match"]');
      if (matchInput) matchInput.checked = true;
    }
    syncMatchFormMode(form);
  }

  function openCardPreview(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return;
    cacheDeckDraftForm(document.querySelector("#deck-form"));
    // 일반 화면(덱 모달 밖)에서 미리보기를 열 때 현재 페이지 스크롤 + 홈 카드검색 결과 박스의
    // 내부 스크롤을 저장해두고, 닫을 때 그대로 복원한다(재렌더로 목록이 맨 위로 튀는 문제 방지).
    if (!state.previewCardNo && state.modal !== "deck") {
      previewReturnScroll = {
        y: window.scrollY,
        homeResults: document.querySelector("[data-home-card-search-results]")?.scrollTop ?? null,
      };
    }
    state.previewCardNo = normalized;
    // 덱 수정 중 덱에 있는 카드면, 저장된 일러를 기본 선택으로 연다.
    const draftCard = state.modal === "deck" ? (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === normalized) : null;
    state.previewActiveImage = draftCard ? imageIndexFromArt(draftCard.art) : 0;
    if (state.modal === "deck") renderKeepingDeckScroll();
    else render();
    // 재렌더로 초기화된 검색 결과 스크롤을 미리보기 뒤에서도 유지
    if (state.modal !== "deck" && previewReturnScroll?.homeResults != null) {
      const resultsBox = document.querySelector("[data-home-card-search-results]");
      if (resultsBox) resultsBox.scrollTop = previewReturnScroll.homeResults;
    }
    if (!KOREAN_CARD_PREVIEWS[normalized]?.effect) fetchAndCacheCardEffect(normalized);
    loadCardParallelImages(normalized);
  }

  function startDeckDraft(deck) {
    state.deckDraftForm = {
      name: deck?.name || "",
      note: deck?.note || "",
      colors: deck?.colors?.length ? [...deck.colors] : ["blue"],
    };
    state.deckDraftCards = normalizeCards(deck?.cards || []).map((card) => ({ ...card }));
    state.deckCardSearch = "";
    state.deckCardType = "all";
    state.deckAdvancedOpen = false;
    state.deckBuilderView = "catalog";
    state.deckCardFilters = createDefaultDeckCardFilters();
  }

  function toggleDeckFilterValue(group, value) {
    const filters = deckCardFilters();
    const values = Array.isArray(filters[group]) ? [...filters[group]] : [];
    const nextValues = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    state.deckCardFilters = { ...filters, [group]: nextValues };
  }

  function setDeckFilterValue(key, value) {
    state.deckCardFilters = { ...deckCardFilters(), [key]: value };
  }

  function cacheDeckDraftForm(form) {
    if (!form) return;
    const formData = new FormData(form);
    state.deckDraftForm = {
      name: String(formData.get("name") || ""),
      note: String(formData.get("note") || ""),
      colors: formData.getAll("colors").map(String),
    };
  }

  function updateDraftCard(input) {
    const card = state.deckDraftCards.find((item) => item.id === input.dataset.cardId);
    if (!card) return;
    if (input.dataset.cardField === "cardNumber") {
      card.cardNumber = normalizeCardNumber(input.value);
      input.value = card.cardNumber;
      return;
    }
    if (input.dataset.cardField === "level") {
      card.level = normalizeLevel(input.value);
      input.value = card.level;
      return;
    }
    if (input.dataset.cardField === "count") {
      const maxAllowed = availableCopiesForCard(state.deckDraftCards, card, card.id);
      card.count = Math.max(1, Math.min(maxAllowed, Number(input.value) || 1));
      input.value = card.count;
      return;
    }
    if (input.dataset.cardField === "type") {
      const previousType = card.type;
      const nextType = cardTypeLabels[input.value] ? input.value : "digimon";
      card.type = nextType;
      const maxAllowed = availableCopiesForCard(state.deckDraftCards, card, card.id);
      if (maxAllowed <= 0) {
        card.type = previousType;
        input.value = previousType;
        alert(nextType === "digiEgg" ? "디지타마는 최대 5장까지 구성할 수 있습니다." : "일반 덱은 최대 50장까지 구성할 수 있습니다.");
        return;
      }
      if (card.count > maxAllowed) {
        alert(`덱 제한 때문에 ${maxAllowed}장까지만 유지됩니다.`);
        card.count = maxAllowed;
      }
      return;
    }
    card.name = String(input.value || "").trim();
  }

  function sanitizeNewCardField(input) {
    if (input.matches("[data-new-card-number]")) {
      input.value = normalizeCardNumber(input.value);
      return;
    }
    if (input.matches("[data-new-card-level]")) {
      input.value = normalizeLevel(input.value);
    }
  }

  function openDailySharePanel() {
    state.tab = "stats";
    state.selected.clear();
    render();
    window.requestAnimationFrame(() => {
      const panel = document.querySelector("[data-daily-share-card]");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // 트랙 B 최종: 액션 컨트롤러(handleAction + 폼 제출 5종)는 js/controller.js 로 이동.
  // 모든 팩토리/함수 선언보다 뒤(리스너 직전)에서 생성 — deps 전부 초기화 완료 시점.
  // 이벤트 리스너는 let 타이머 재할당 때문에 app.js 잔류.
  const {
    handleAction,
    handleEventSubmit,
    handleMatchSubmit,
    handleTournamentSubmit,
    handleDeckSubmit,
    handleTypeSubmit,
  } = window.JJM.controller.createController({
    getData: () => data,
    state,
    CARD_CATALOG,
    cardTypeLabels,
    ROUND_STAGE_OPTIONS,
    TEAM3_MATCH_TYPE,
    TOURNAMENT_CUT_OPTIONS,
    TOURNAMENT_FORMAT_OPTIONS,
    uid,
    todayISO,
    resultFromGameStats,
    singleGameStats,
    normalizeCards,
    normalizeMatchTypeName,
    normalizeCardNumber,
    normalizeLevel,
    createDefaultDeckCardFilters,
    isAdminUser,
    saveData,
    cloneDataSnapshot,
    saveRecoveryPoint,
    restoreRecoveryPoint,
    notifyUndo,
    restoreUndo,
    clearAllData,
    copyCardUpdateCommands,
    copyDailyShareText,
    copyDeckExportCode,
    downloadBackup,
    downloadCardDataStatus,
    downloadDeckExport,
    installPwa,
    refreshAppVersion,
    clearDiagnostics,
    downloadDiagnostics,
    downloadDailyShareImage,
    downloadDeckImage,
    openDailyShareX,
    printDeckRecipe,
    downloadDeckRecipeDocx,
    addDraftCard,
    changeDraftCardCount,
    cloneDeck,
    deckReadiness,
    catalogCardToDraft,
    cardNumberOverLimit,
    applyCloudConflictVersion,
    keepLocalConflictVersion,
    loadCloudNow,
    loginWithGoogle,
    logoutGoogle,
    saveCloudData,
    getDeck,
    getTournament,
    tournamentName,
    roundText,
    suggestedRoundLabel,
    suggestedTournamentStage,
    icsFileName,
    imageIndexToArt,
    cacheDeckDraftForm,
    cardDisplayName,
    closeCardPreview,
    closeModal,
    deckCards,
    deckLimitViolation,
    deletePersonalEventById,
    deleteTournamentEventById,
    dismissToast,
    downloadDraftDeckRecipeDocx,
    downloadIcs,
    filteredTournamentEvents,
    findCalendarEvent,
    gameStatsFromScore,
    loadTournamentEvents,
    notifyToast,
    openCardPreview,
    openDailySharePanel,
    printDraftDeckRecipe,
    rememberMatchDefaults,
    render,
    renderKeepingDeckScroll,
    renderKeepingRegionScroll,
    savePersonalEvent,
    startDeckDraft,
    statsPeriodFromValue,
    toggleDeckFilterValue,
    upsertTournamentEvent,
  });

  function catalogCardByNumber(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    return CARD_CATALOG.find((card) => card.no === normalized);
  }


  document.addEventListener(
    "error",
    (event) => {
      const image = event.target?.closest?.(".catalog-image img");
      if (image) showMissingCatalogImage(image);
      const deckThumb = event.target?.closest?.(".deck-row-thumb img");
      if (deckThumb) showMissingDeckThumb(deckThumb);
      const previewImage = event.target?.closest?.(".card-preview-image img");
      if (previewImage) {
        const wrapper = previewImage.closest(".card-preview-image");
        previewImage.remove();
        if (wrapper && !wrapper.querySelector(".catalog-image-empty")) {
          const fallback = document.createElement("span");
          fallback.className = "catalog-image-empty";
          fallback.textContent = state.previewCardNo || "NO IMAGE";
          wrapper.append(fallback);
        }
      }
    },
    true
  );

  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("card-preview-backdrop")) {
      closeCardPreview();
      return;
    }
    if (event.target.classList.contains("modal-backdrop")) {
      return;
    }
    const previewClickTarget = event.target.closest('[data-action="preview-catalog-card"]');
    if (previewClickTarget) {
      event.preventDefault();
      event.stopPropagation();
      openCardPreview(previewClickTarget.dataset.cardNo);
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      state.selected.clear();
      state.matchesVisible = 50; // 전적 목록 표시 상한 초기화("더 보기" 확장분 리셋)
      render();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      handleAction(actionTarget.dataset.action, actionTarget);
    }
  });

  // 카드 미리보기: 메인 이미지를 좌우 스와이프해 일러스트(패럴렐)를 넘긴다.
  let previewSwipeStart = null;
  document.addEventListener(
    "touchstart",
    (event) => {
      const imageBox = event.target.closest(".card-preview-image.has-gallery");
      if (!imageBox || event.touches.length !== 1) {
        previewSwipeStart = null;
        return;
      }
      const touch = event.touches[0];
      previewSwipeStart = { x: touch.clientX, y: touch.clientY, count: Number(imageBox.dataset.imgCount) || 1 };
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (event) => {
      if (!previewSwipeStart || !state.previewCardNo) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - previewSwipeStart.x;
      const dy = touch.clientY - previewSwipeStart.y;
      const count = previewSwipeStart.count;
      previewSwipeStart = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return; // 가로 스와이프만
      const current = state.previewActiveImage || 0;
      const next = dx < 0 ? Math.min(current + 1, count - 1) : Math.max(current - 1, 0);
      if (next === current) return;
      state.previewActiveImage = next;
      if (state.modal === "deck") renderKeepingDeckScroll();
      else render();
    },
    { passive: true }
  );

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "match-form") handleMatchSubmit(event.target, event.submitter);
    if (event.target.id === "tournament-form") handleTournamentSubmit(event.target);
    if (event.target.id === "event-form") handleEventSubmit(event.target);
    if (event.target.id === "deck-form") {
      const deckCardSearch = document.activeElement?.matches?.("[data-deck-card-search]") ? document.activeElement : null;
      if (deckCardSearch) {
        commitDeckCardSearch(deckCardSearch);
        return;
      }
      handleDeckSubmit(event.target);
    }
    if (event.target.id === "deck-import-form") handleDeckImportSubmit(event.target);
    if (event.target.id === "type-form") handleTypeSubmit(event.target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.previewCardNo) {
      event.preventDefault();
      closeCardPreview();
      return;
    }
    if (event.key === "Escape" && state.modal) {
      event.preventDefault();
      closeModal();
      return;
    }
    // 접근성(WCAG 2.4.3): 다이얼로그가 열려 있으면 Tab 포커스를 다이얼로그 안에서 순환시킨다.
    // 카드 미리보기가 덱 빌더 위에 겹칠 수 있으므로 미리보기를 우선(Escape 처리 순서와 동일).
    if (event.key === "Tab" && (state.modal || state.previewCardNo)) {
      const panel = document.querySelector(state.previewCardNo ? ".card-preview-panel" : ".modal-panel");
      if (panel) {
        const focusables = [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.disabled && el.offsetParent !== null
        );
        if (focusables.length) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;
          if (!panel.contains(active) && active !== panel) {
            event.preventDefault();
            first.focus();
          } else if (event.shiftKey && (active === first || active === panel)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }
    if (event.key === "Enter" || event.key === " ") {
      const previewRow = event.target.closest?.('[role="button"][data-action="preview-catalog-card"]');
      if (previewRow) {
        event.preventDefault();
        openCardPreview(previewRow.dataset.cardNo);
        return;
      }
    }
    const deckCardSearch = event.target.closest?.("[data-deck-card-search]");
    if (!deckCardSearch || event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    commitDeckCardSearch(deckCardSearch);
  });

  document.addEventListener("change", (event) => {
    const matchFormat = event.target.closest('input[name="matchFormat"]');
    if (matchFormat) {
      syncMatchFormMode(matchFormat.closest("#match-form"));
      return;
    }
    const matchTypeSelect = event.target.closest('#match-form [name="matchType"]');
    if (matchTypeSelect) {
      syncMatchFormMode(matchTypeSelect.closest("#match-form"));
      return;
    }
    const roundStageInput = event.target.closest('input[name="roundStage"]');
    if (roundStageInput) {
      applyTournamentDefaultsToMatchForm(roundStageInput.closest("#match-form"));
      return;
    }
    const matchTournament = event.target.closest("[data-match-tournament-select]");
    if (matchTournament) {
      const form = matchTournament.closest("#match-form");
      const tournament = getTournament(matchTournament.value);
      const dateInput = form?.querySelector('[name="date"]');
      if (tournament && dateInput && (!dateInput.value || dateInput.value === todayISO())) dateInput.value = tournament.date;
      const suggestedStage = tournament ? suggestedTournamentStage(tournament.id) : "none";
      const stageInput = form?.querySelector(`input[name="roundStage"][value="${suggestedStage}"]`);
      const noneInput = form?.querySelector('input[name="roundStage"][value="none"]');
      if (tournament && noneInput?.checked && stageInput) stageInput.checked = true;
      if (!tournament && noneInput) noneInput.checked = true;
      // 3대3 자리(A/B/C)는 대회당 고정 → 대회 바꾸면 그 대회 직전 라운드 자리로 자동 세팅
      const seat = tournament ? suggestedTeamPosition(tournament.id) : "";
      const seatInput = seat ? form?.querySelector(`input[name="teamPosition"][value="${seat}"]`) : null;
      if (seatInput) seatInput.checked = true;
      applyTournamentDefaultsToMatchForm(form, { force: true });
      return;
    }
    const deckCardType = event.target.closest("[data-deck-card-type]");
    if (deckCardType) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
      state.deckCardType = deckCardType.value;
      render();
      return;
    }
    const dailyShareDate = event.target.closest("[data-daily-share-date]");
    if (dailyShareDate) {
      state.shareDate = dailyShareDate.value || todayISO();
      render();
      return;
    }
    const deckImageLayout = event.target.closest("[data-deck-image-layout]");
    if (deckImageLayout) {
      state.deckImageLayout = deckImageLayout.value === "archive" ? "archive" : "x";
      data.settings = { ...(data.settings || {}), deckImageLayout: state.deckImageLayout };
      saveData();
      render();
      return;
    }
    const cardField = event.target.closest("[data-card-field]");
    if (cardField) {
      updateDraftCard(cardField);
      return;
    }
    if (event.target.closest("#deck-form")) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
    }
    const matchupDeckFilter = event.target.closest("[data-matchup-deck-filter]");
    if (matchupDeckFilter) {
      state.matchupDeckId = matchupDeckFilter.value;
      state.matchupOpponent = "";
      render();
      return;
    }
    const matchupOpponentFilter = event.target.closest("[data-matchup-opponent-filter]");
    if (matchupOpponentFilter) {
      state.matchupOpponent = matchupOpponentFilter.value;
      render();
      return;
    }
    const deckFilterSelect = event.target.closest("[data-deck-filter-select]");
    if (deckFilterSelect) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
      setDeckFilterValue(deckFilterSelect.dataset.deckFilterSelect, deckFilterSelect.value);
      renderKeepingDeckScroll();
      return;
    }
    const deckTraySort = event.target.closest("[data-deck-tray-sort]");
    if (deckTraySort) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
      state.deckTraySort = ["level", "number", "type"].includes(deckTraySort.value) ? deckTraySort.value : "level";
      renderKeepingDeckScroll();
      return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter && filter.dataset.filter !== "query") {
      state.filters[filter.dataset.filter] = filter.value;
      render();
      return;
    }
    const selected = event.target.closest("[data-select-match]");
    if (selected) {
      if (selected.checked) state.selected.add(selected.dataset.selectMatch);
      else state.selected.delete(selected.dataset.selectMatch);
      render();
      return;
    }
    const restoreInput = event.target.closest("[data-restore-file]");
    if (restoreInput) {
      restoreBackup(restoreInput.files[0]);
    }
    const deckImportFile = event.target.closest("[data-deck-import-file]");
    if (deckImportFile) {
      readDeckImportFile(deckImportFile.files[0]);
    }
  });

  document.addEventListener("input", (event) => {
    const dailyShareDate = event.target.closest("[data-daily-share-date]");
    if (dailyShareDate) {
      state.shareDate = dailyShareDate.value || todayISO();
      render();
      return;
    }
    const deckCardSearch = event.target.closest("[data-deck-card-search]");
    if (deckCardSearch) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
      state.deckCardSearch = deckCardSearch.value;
      clearTimeout(deckSearchTimer);
      if (!event.isComposing) {
        deckSearchTimer = setTimeout(updateDeckCatalogResults, 180);
      }
      return;
    }
    const homeCardSearch = event.target.closest("[data-home-card-search]");
    if (homeCardSearch) {
      state.homeCardSearch = homeCardSearch.value;
      clearTimeout(homeSearchTimer);
      if (!event.isComposing) {
        homeSearchTimer = setTimeout(updateHomeCardSearchResults, 180);
      }
      return;
    }
    const newCardField = event.target.closest("[data-new-card-number], [data-new-card-level]");
    if (newCardField) {
      sanitizeNewCardField(newCardField);
      return;
    }
    const cardField = event.target.closest("[data-card-field]");
    if (cardField) {
      updateDraftCard(cardField);
      return;
    }
    if (event.target.closest("#deck-form")) {
      cacheDeckDraftForm(event.target.closest("#deck-form"));
    }
    const filter = event.target.closest('[data-filter="query"]');
    if (!filter) return;
    state.filters.query = filter.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });

  document.addEventListener("compositionend", (event) => {
    const homeCardSearch = event.target.closest("[data-home-card-search]");
    if (homeCardSearch) {
      state.homeCardSearch = homeCardSearch.value;
      clearTimeout(homeSearchTimer);
      updateHomeCardSearchResults();
      return;
    }
    const deckCardSearch = event.target.closest("[data-deck-card-search]");
    if (!deckCardSearch) return;
    commitDeckCardSearch(deckCardSearch);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    updateAuthControls();
    if (state.tab === "settings") render();
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    state.pwaInstalled = true;
    notifyToast("앱 설치 완료", "홈 화면에서 전적몬을 열 수 있습니다.", "success");
    if (state.tab === "settings") render();
  });

  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) return;
    recordDiagnostic("runtime-error", event.message || "Runtime error", {
      source: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordDiagnostic("promise-rejection", reason?.message || String(reason || "Unhandled promise rejection"), {
      stack: String(reason?.stack || "").slice(0, 1200),
    });
  });

  window.addEventListener("offline", () => {
    recordDiagnostic("network-offline", "Browser went offline");
    notifyToast("오프라인 상태", "기기에는 계속 저장하고, 연결되면 클라우드 저장을 다시 시도합니다.", "warning", 5000);
    if (state.tab === "settings") render();
  });

  window.addEventListener("online", () => {
    recordDiagnostic("network-online", "Browser went online");
    if (state.authUser) saveCloudData({ notify: true });
    if (state.tab === "settings") render();
  });

  function notifyAppUpdateReady() {
    if (state.toasts.some((toast) => toast.action?.action === "reload-app")) return;
    notifyToast("새 버전 준비됨", "캐시를 정리하고 최신 전적몬으로 다시 엽니다.", "info", 0, {
      label: "새 버전 적용",
      action: "reload-app",
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const hadController = Boolean(navigator.serviceWorker.controller);
      if (hadController) {
        navigator.serviceWorker.addEventListener("controllerchange", notifyAppUpdateReady);
      }
      navigator.serviceWorker
        .register(`sw.js?v=${APP_VERSION}`)
        .then((registration) => {
          if (registration.waiting && navigator.serviceWorker.controller) notifyAppUpdateReady();
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) notifyAppUpdateReady();
            });
          });
        })
        .catch((error) => {
          console.warn("Service worker registration failed", error);
        });
    });
  }

  render();
  initializeCloudAuth();
})();
