(function () {
  const STORAGE_KEY = "digilog-ko-clone-v1";
  const RECOVERY_KEY = "jeonjeokmon-recovery-point-v1";
  const DIAGNOSTIC_KEY = "jeonjeokmon-diagnostics-v1";
  const CARD_EFFECT_CACHE_KEY = "digimon-card-effect-cache-v5";
  const APP_VERSION = "20260617-tabbar-bigger";
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
  // createDefaultData/createDemoData/loadData(IO) 와 normalizeCardNumber/normalizeLevel(공용)은 app.js 잔류.
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
    copyDailyShareText,
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
  // (handleDeckImportSubmit/readDeckImportFile, catalogCardByNumber 는 app.js에 잔류)
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
      matchTypes: ["테이머 배틀", "매장 대표전", "친선전", "테스트 플레이"],
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
      matchTypes: ["테이머 배틀", "매장 대표전", "친선전", "테스트 플레이"],
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

  function normalizeCardNumber(value) {
    const cleaned = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    // 기본 카드번호(세트코드-번호)만 추출 → 에라타/프로모 변형 접미사 제거
    // 예: EX3-057-ERRATA → EX3-057, P-103_P2 → P-103
    const base = cleaned.match(/^[A-Z]+[0-9]*-[0-9]+/);
    if (base) return base[0];
    return cleaned.replace(/[^A-Z0-9-]/g, "");
  }

  function normalizeCatalogQuery(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/gi, "");
  }

  function normalizeLevel(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 1);
  }

  function createDefaultDeckCardFilters() {
    return {
      colors: [],
      levels: [],
      setPrefix: "all",
      sort: "catalog",
    };
  }

  function normalizeCatalogCard(card, index = 0) {
    const type = cardTypeLabels[card.type] ? card.type : "other";
    const rawImage = String(card.img || card.smallImgUrl || card.imgUrl || "").trim();
    const image = rawImage.includes("dgchub.com") ? "" : rawImage;
    return {
      index,
      no: normalizeCardNumber(card.no || card.cardNumber || card.cardNo || ""),
      level: normalizeLevel(card.level || card.lv || ""),
      name: String(card.name || "").trim(),
      type,
      color: String(card.color || "").toLowerCase(),
      color2: String(card.color2 || "").toLowerCase(),
      rarity: String(card.rarity || "").trim(),
      img: image,
    };
  }

  function saveData(options = {}) {
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

  function dataSummary(source = data) {
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
    if (!cloudClient && state.authLoading) return "DB 연결 준비 중";
    if (!cloudClient) return "Supabase 설정을 확인해 주세요";
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
    const lastBackupAt = data.settings?.lastBackupAt || "";
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
    const localSaved = formatSyncTime(state.localSavedAt || data.settings?.lastLocalSavedAt);
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
    return data.decks.some((deck) => !isSampleId(deck.id));
  }

  function hasRealMatches() {
    return data.matches.some((match) => !isSampleId(match.id));
  }

  function shouldShowStarterGuide() {
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
    const latest = data.matches
      .filter((match) => match.deckId === deckId)
      .sort((a, b) => matchDateTime(b) - matchDateTime(a) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
    return latest ? formatDate(latest.date) : "사용 기록 없음";
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
          <input class="input" type="search" value="${escapeHTML(state.homeCardSearch)}" placeholder="카드명·번호·효과 (예: 오메가몬, BT1-084)" data-home-card-search autocomplete="off" />
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

  function renderToastStack() {
    if (!state.toasts.length) return "";
    return `
      <div class="toast-stack" data-toast-stack role="status" aria-live="polite" aria-atomic="false">
        ${state.toasts
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
          .join("")}
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
      stack.outerHTML = renderToastStack();
      return;
    }
    const shell = document.querySelector(".app-shell");
    if (shell && state.toasts.length) shell.insertAdjacentHTML("beforeend", renderToastStack());
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

  function cloneDataSnapshot(source = data) {
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

  function saveRecoveryPoint(snapshot = data, reason = "변경 전 복구 지점") {
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
    data = cloneDataSnapshot(point.data);
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
    data = cloneDataSnapshot(snapshot);
    delete state.undoSnapshots[undoId];
    state.toasts = state.toasts.filter((toast) => toast.action?.undoId !== undoId);
    state.selected.clear();
    state.cloudConflict = null;
    saveData();
    notifyToast("되돌리기 완료", dataSummary(), "success");
    render();
  }

  function getDeck(id) {
    return data.decks.find((deck) => deck.id === id);
  }

  function deckName(id) {
    return getDeck(id)?.name || "삭제된 덱";
  }

  function getTournament(id) {
    return data.tournaments.find((tournament) => tournament.id === id);
  }

  function tournamentName(id) {
    return getTournament(id)?.name || "";
  }

  function tournamentFormatLabel(format) {
    return TOURNAMENT_FORMAT_OPTIONS.find(([value]) => value === format)?.[1] || "스위스+토너먼트";
  }

  function roundStageLabel(stage) {
    return ROUND_STAGE_OPTIONS.find(([value]) => value === stage)?.[1] || "일반";
  }

  function roundText(match) {
    if (!match?.tournamentId) return "";
    const stage = match.roundStage && match.roundStage !== "none" ? roundStageLabel(match.roundStage) : "";
    const label = String(match.roundLabel || "").trim();
    return [stage, label].filter(Boolean).join(" ");
  }

  function tournamentMatchText(match) {
    const tournament = getTournament(match?.tournamentId);
    if (!tournament) return "";
    const round = roundText(match);
    return round ? `${tournament.name} · ${round}` : tournament.name;
  }

  function sortedTournaments() {
    return [...data.tournaments].sort((a, b) => `${b.date || ""}${b.createdAt || ""}`.localeCompare(`${a.date || ""}${a.createdAt || ""}`));
  }

  function tournamentMatches(tournamentId) {
    return data.matches
      .filter((match) => match.tournamentId === tournamentId)
      .sort((a, b) => `${a.date || ""}${a.createdAt || ""}`.localeCompare(`${b.date || ""}${b.createdAt || ""}`));
  }

  function suggestedTournamentStage(tournamentId) {
    const matches = tournamentMatches(tournamentId);
    const topCount = matches.filter((match) => match.roundStage === "top").length;
    const swissCount = matches.filter((match) => match.roundStage === "swiss").length;
    if (topCount || swissCount >= 4) return "top";
    return "swiss";
  }

  // 컷 규모(예: 16) → 라운드 라벨 순서(예: ["16강","8강","4강","결승"])
  function topCutLabels(cut) {
    const labels = [];
    let n = Math.max(2, Number(cut) || 4);
    while (n >= 4) {
      labels.push(`${n}강`);
      n = Math.floor(n / 2);
    }
    labels.push("결승");
    return labels;
  }

  function tournamentTopCut(tournamentId) {
    const cut = Number(getTournament(tournamentId)?.topCut);
    return [2, 4, 8, 16, 32, 64, 128].includes(cut) ? cut : 4;
  }

  function suggestedRoundLabel(tournamentId, stage = "swiss") {
    const matches = tournamentMatches(tournamentId).filter((match) => (match.roundStage || "none") === stage);
    if (stage === "top") {
      const labels = topCutLabels(tournamentTopCut(tournamentId));
      return labels[Math.min(matches.length, labels.length - 1)] || `토너먼트 ${matches.length + 1}`;
    }
    if (stage === "swiss") return `R${matches.length + 1}`;
    return "";
  }

  function tournamentNextActionText(tournament) {
    const matches = tournamentMatches(tournament.id);
    const swissCount = matches.filter((match) => match.roundStage === "swiss").length;
    const topCount = matches.filter((match) => match.roundStage === "top").length;
    if (!matches.length) return "스위스 R1 입력";
    if (topCount) return `다음 토너먼트 ${suggestedRoundLabel(tournament.id, "top")}`;
    if (swissCount >= 4) return "토너먼트 라운드 입력";
    return `다음 스위스 ${suggestedRoundLabel(tournament.id, "swiss")}`;
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
        return `${roundLabelForShare(match, index)} vs ${match.opponent || "상대 미기록"} ${roundResultForShare(match)}`;
      });
  }

  function tournamentShareTitle(row) {
    const location = String(row.location || "").trim();
    const name = String(row.name || "대회").trim();
    return `${location ? `${location} ` : ""}${name} 전적`;
  }

  function tournamentDailyShareBlock(row) {
    const lines = [
      tournamentShareTitle(row),
      "",
      `사용 덱: ${tournamentDeckText(row.matches)}`,
    ];
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
    lines.push(
      dailyShareDeckLine(summary.decks),
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
              return `
                <button class="calendar-cell${cell.inMonth ? "" : " out"}${cell.isToday ? " today" : ""}${cell.iso === selDate ? " selected" : ""}${evs.length ? " has-ev" : ""}" type="button" data-action="select-calendar-day" data-date="${cell.iso}">
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

  function renderEventModal() {
    const ev = state.editingEventId ? findCalendarEvent(state.editingEventId) : null;
    const isPersonal = ev ? !!ev.personal : state.eventModalKind !== "official";
    const start = ev ? new Date(ev.startsAt) : null;
    const dateVal = start && !Number.isNaN(start.getTime()) ? localDateStr(start) : state.selectedCalendarDate || todayISO();
    const timeVal = start && !Number.isNaN(start.getTime()) ? localTimeStr(start) : "10:00";
    const end = ev?.endsAt ? new Date(ev.endsAt) : null;
    const endVal = end && !Number.isNaN(end.getTime()) ? localTimeStr(end) : "";
    const body = `
      <form class="form-grid" id="event-form">
        ${isPersonal ? `<p class="mini-text">🔒 나만 보이는 개인 일정입니다.</p>` : ""}
        <label class="field">
          <span>${isPersonal ? "일정 이름" : "대회 이름"}</span>
          <input class="input" name="title" value="${escapeHTML(ev?.title || "")}" placeholder="${isPersonal ? "예: 친구와 듀얼, 대회 신청 마감" : "예: 6월 매장 대표전"}" autocomplete="off" required />
        </label>
        <div class="form-row">
          <label class="field">
            <span>날짜</span>
            <input class="input" type="date" name="date" value="${escapeHTML(dateVal)}" required />
          </label>
          <label class="field">
            <span>시작 시간</span>
            <input class="input" type="time" name="time" value="${escapeHTML(timeVal)}" required />
          </label>
          <label class="field">
            <span>종료(선택)</span>
            <input class="input" type="time" name="endTime" value="${escapeHTML(endVal)}" />
          </label>
        </div>
        <label class="field">
          <span>장소</span>
          <input class="input" name="location" value="${escapeHTML(ev?.location || "")}" placeholder="매장명 또는 지역" autocomplete="off" />
        </label>
        <label class="field">
          <span>설명/링크</span>
          <textarea class="textarea" name="description" placeholder="참가 방법, 신청 링크, 진행 방식 등">${escapeHTML(ev?.description || "")}</textarea>
        </label>
      </form>
    `;
    const actions = `
      <button class="control-button" type="button" data-action="close-modal">취소</button>
      <button class="primary-action" type="submit" form="event-form">${ev ? "저장" : "추가"}</button>
    `;
    const titleText = isPersonal ? (ev ? "내 일정 수정" : "내 일정 추가") : ev ? "대회 일정 수정" : "대회 일정 추가";
    return modalFrame(titleText, body, actions);
  }

  async function handleEventSubmit(form) {
    const editing = state.editingEventId ? findCalendarEvent(state.editingEventId) : null;
    const isPersonal = editing ? !!editing.personal : state.eventModalKind !== "official";
    if (!isPersonal && !isAdminUser()) {
      alert("관리자만 공식 일정을 추가할 수 있습니다.");
      return;
    }
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const date = String(formData.get("date") || "");
    const time = String(formData.get("time") || "");
    const endTime = String(formData.get("endTime") || "");
    if (!title || !date || !time) {
      alert("이름, 날짜, 시작 시간을 입력해 주세요.");
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) {
      alert("날짜/시간 형식을 확인해 주세요.");
      return;
    }
    const end = endTime ? new Date(`${date}T${endTime}:00`) : null;
    const payload = {
      id: state.editingEventId || undefined,
      title,
      startsAt: start.toISOString(),
      endsAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : "",
      location: String(formData.get("location") || "").trim(),
      description: String(formData.get("description") || "").trim(),
    };
    const finishUi = () => {
      state.selectedCalendarDate = date;
      state.calendarYear = start.getFullYear();
      state.calendarMonth = start.getMonth();
      closeModal();
      notifyToast(isPersonal ? "내 일정 저장됨" : "일정 저장됨", title, "success");
    };
    // 개인 일정: 로컬 데이터에 저장(네트워크 불필요)
    if (isPersonal) {
      savePersonalEvent(payload);
      finishUi();
      return;
    }
    // 공식 일정: 클라우드 테이블에 저장(관리자)
    const submitter = document.querySelector('[form="event-form"][type="submit"]');
    if (submitter) {
      submitter.disabled = true;
      submitter.textContent = "저장 중";
    }
    try {
      await upsertTournamentEvent(payload);
      await loadTournamentEvents(true);
      finishUi();
    } catch (error) {
      if (submitter) {
        submitter.disabled = false;
        submitter.textContent = state.editingEventId ? "저장" : "추가";
      }
      alert(`일정 저장 실패: ${error?.message || "잠시 후 다시 시도해 주세요."}`);
    }
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
  function renderModal() {
    if (!state.modal) return "";
    if (state.modal === "match") return renderMatchModal();
    if (state.modal === "tournament") return renderTournamentModal();
    if (state.modal === "deck") return renderDeckModal();
    if (state.modal === "deck-import") return renderDeckImportModal();
    if (state.modal === "event") return renderEventModal();
    return "";
  }

  function renderCardPreview() {
    if (!state.previewCardNo) return "";
    const card = cardPreviewData(state.previewCardNo);
    if (!card) return "";
    const baseImage = card.img || remoteCardImageUrl(card.no);
    // 기본 일러(현행 소스) + 일본 공식 패럴렐(있으면) 을 합쳐 갤러리 구성
    const parallels = previewParallelCache[card.no] || [];
    const images = [baseImage, ...parallels].filter(Boolean);
    const activeIndex = Math.min(Math.max(state.previewActiveImage || 0, 0), Math.max(images.length - 1, 0));
    const mainSrc = images[activeIndex] || baseImage;
    const hasGallery = images.length > 1;
    // 덱 수정 중이고 이 카드가 덱에 들어있으면, 일러를 골라 덱 카드에 저장할 수 있게 한다.
    const draftCard = state.modal === "deck" ? (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === card.no) : null;
    const activeIsSaved = imageIndexToArt(activeIndex) === (draftCard?.art || "");
    // 현재 보고 있는 일러가 덱 저장본과 다를 때만 저장 버튼을 노출(저장본일 땐 버튼/문구 없음).
    const showArtSave = !!draftCard && hasGallery && !activeIsSaved;
    return `
      <div class="card-preview-backdrop">
        <section class="card-preview-panel" role="dialog" aria-modal="true" aria-label="${escapeHTML(card.name)} 미리보기">
          <button class="icon-button card-preview-close" type="button" title="닫기" aria-label="미리보기 닫기" data-action="close-card-preview">×</button>
          <div class="card-preview-image${hasGallery ? " has-gallery" : ""}" data-img-count="${images.length}">
            ${
              mainSrc
                ? `<img src="${escapeHTML(mainSrc)}" alt="${escapeHTML(card.name)}" loading="eager" />`
                : `<span class="catalog-image-empty">${escapeHTML(card.no)}</span>`
            }
            ${
              hasGallery
                ? `<button class="card-preview-nav prev" type="button" data-action="preview-set-image" data-img-index="${activeIndex - 1}" aria-label="이전 일러스트"${activeIndex === 0 ? " hidden" : ""}>‹</button>
                  <button class="card-preview-nav next" type="button" data-action="preview-set-image" data-img-index="${activeIndex + 1}" aria-label="다음 일러스트"${activeIndex === images.length - 1 ? " hidden" : ""}>›</button>
                  <span class="card-preview-counter">${activeIndex + 1} / ${images.length}</span>`
                : ""
            }
          </div>
          ${
            showArtSave
              ? `<button class="primary-action compact card-preview-art-save" type="button" data-action="save-deck-card-art">이 일러로 덱에 저장</button>`
              : ""
          }
          ${renderKoreanCardPreview(card)}
        </section>
      </div>
    `;
  }

  // 일러 갤러리 인덱스 ↔ 저장 접미사 변환 (0 = 기본, n = "_Pn")
  function imageIndexToArt(index) {
    return index > 0 ? `_P${index}` : "";
  }
  function imageIndexFromArt(art) {
    const match = /^_P(\d+)$/.exec(String(art || ""));
    return match ? Number(match[1]) : 0;
  }

  function renderKoreanCardPreview(card) {
    const preview = KOREAN_CARD_PREVIEWS[card.no] || {};
    const remoteEffect = staticKoreanOfficialEffect(card.no) || state.cardEffectCache[card.no];
    const isLoadingEffect = effectLoadingCards.has(card.no);
    const effectBlocks = renderCardEffectBlocks(card, preview, remoteEffect, isLoadingEffect);
    return `
      <div class="card-preview-korean">
        <div class="card-preview-korean-head">
          <span>${escapeHTML(preview.label || "한글 카드 정보")}</span>
          <strong>${escapeHTML(card.name)}</strong>
        </div>
        <dl>
          <div>
            <dt>카드번호</dt>
            <dd>${escapeHTML(card.no)}</dd>
          </div>
          <div>
            <dt>종류</dt>
            <dd>${escapeHTML(cardTypeLabel(card.type))}</dd>
          </div>
          <div>
            <dt>Lv</dt>
            <dd>${escapeHTML(card.level || "-")}</dd>
          </div>
          <div>
            <dt>색상</dt>
            <dd>${escapeHTML(colorLabel(card.color) || "-")}</dd>
          </div>
        </dl>
        ${effectBlocks}
      </div>
    `;
  }

  function renderCardEffectBlocks(card, preview, remoteEffect, isLoadingEffect) {
    if (preview.effect) {
      return renderCardEffectBlock(preview.effectTitle || "효과", preview.effect);
    }
    if (isLoadingEffect) {
      return `<div class="card-preview-effect loading"><span>효과</span><p>카드 효과를 불러오는 중입니다.</p></div>`;
    }
    if (!remoteEffect) {
      return "";
    }
    const isKoreanOfficial = remoteEffect.source === "kr";
    if (!isKoreanOfficial) return "";
    const blocks = [
      ["상단 텍스트", remoteEffect.mainEffect],
      ["하단 텍스트", remoteEffect.sourceEffect],
      ["시큐리티 효과", remoteEffect.securityEffect],
      ["추가 텍스트", remoteEffect.altEffect],
    ]
      .filter(([, text]) => text)
      .map(([title, text]) => renderCardEffectBlock(title, text));
    if (blocks.length) return blocks.join("");
    return "";
  }

  function renderCardEffectBlock(title, koreanText, originalText = "", badge = "") {
    return `
      <div class="card-preview-effect">
        <span>${escapeHTML(title)}${badge ? `<em>${escapeHTML(badge)}</em>` : ""}</span>
        <p>${escapeHTML(koreanText)}</p>
        ${
          originalText
            ? `
              <details>
                <summary>영문 원문</summary>
                <p lang="en">${escapeHTML(originalText)}</p>
              </details>
            `
            : ""
        }
      </div>
    `;
  }

  function modalFrame(title, body, actions, className = "") {
    const backdropClass = className.includes("deck-modal-panel") ? " deck-modal-backdrop" : "";
    return `
      <div class="modal-backdrop${backdropClass}">
        <section class="modal-panel ${escapeHTML(className)}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
          <div class="modal-head">
            <h2 class="modal-title">${escapeHTML(title)}</h2>
            <button class="icon-button" type="button" title="닫기" aria-label="닫기" data-action="close-modal">×</button>
          </div>
          <div class="modal-body">${body}</div>
          ${actions ? `<div class="modal-actions">${actions}</div>` : ""}
        </section>
      </div>
    `;
  }

  function renderDeckImportModal() {
    const body = `
      <form class="form-grid" id="deck-import-form">
        <label class="field">
          <span>덱 이름</span>
          <input class="input" name="name" placeholder="비워두면 파일/텍스트 이름을 사용합니다" />
        </label>
        <label class="field">
          <span>덱 리스트</span>
          <textarea class="textarea import-textarea" name="deckImportText" placeholder="예시&#10;4 (BT13-007)&#10;2 (BT12-021)&#10;4 ST1-03 아구몬&#10;4 Koromon BT12-003&#10;4 Agumon EX4-005&#10;&#10;디지타마&#10;1 (ST1-01)"></textarea>
        </label>
        <label class="field">
          <span>파일 가져오기</span>
          <input class="input" type="file" accept=".json,.txt,application/json,text/plain" data-deck-import-file />
        </label>
        <div class="import-hint">
          전적몬 JSON, <strong>매수 (카드번호)</strong>, <strong>매수 카드번호 이름</strong>, 디프로의 <strong>매수 영어카드명 카드번호</strong> 형식을 가져올 수 있습니다.
          내장 DB에 없는 카드번호는 공개 카드 API로 이름, Lv, 종류를 자동 확인합니다.
        </div>
      </form>
    `;
    const actions = `
      <button class="control-button" type="button" data-action="close-modal">취소</button>
      <button class="primary-action" type="submit" form="deck-import-form">${state.importingDecks ? "가져오는 중" : "가져오기"}</button>
    `;
    return modalFrame("덱 가져오기", body, actions);
  }

  function renderTournamentModal() {
    const tournament = state.editingTournamentId ? getTournament(state.editingTournamentId) : null;
    const selectedFormat = tournament?.format || "mixed";
    const selectedCut = tournament?.topCut || 4;
    const body = `
      <form class="form-grid" id="tournament-form">
        <label class="field">
          <span>대회 이름</span>
          <input class="input" name="name" value="${escapeHTML(tournament?.name || "")}" placeholder="예: 매장 대표전" autocomplete="off" required />
        </label>
        <div class="form-row">
          <label class="field">
            <span>날짜</span>
            <input class="input" type="date" name="date" value="${escapeHTML(tournament?.date || todayISO())}" />
          </label>
          <label class="field">
            <span>진행 방식</span>
            <select class="select" name="format">
              ${TOURNAMENT_FORMAT_OPTIONS.map(
                ([value, label]) => `<option value="${escapeHTML(value)}"${selectedAttr(selectedFormat, value)}>${escapeHTML(label)}</option>`
              ).join("")}
            </select>
          </label>
          <label class="field">
            <span>토너먼트 컷</span>
            <select class="select" name="topCut">
              ${TOURNAMENT_CUT_OPTIONS.map(
                ([value, label]) => `<option value="${value}"${selectedAttr(String(selectedCut), String(value))}>${escapeHTML(label)}</option>`
              ).join("")}
            </select>
          </label>
        </div>
        <p class="mini-text">스위스 종료 후 토너먼트 라운드가 선택한 컷부터 자동 진행됩니다 (예: 8강 → 4강 → 결승).</p>
        <label class="field">
          <span>장소</span>
          <input class="input" name="location" value="${escapeHTML(tournament?.location || "")}" placeholder="매장명 또는 지역" autocomplete="off" />
        </label>
        <label class="field">
          <span>메모</span>
          <textarea class="textarea" name="memo" placeholder="대회 진행 방식, 참가 인원, 특이사항">${escapeHTML(tournament?.memo || "")}</textarea>
        </label>
      </form>
    `;
    const actions = `
      <button class="control-button" type="button" data-action="close-modal">취소</button>
      <button class="primary-action" type="submit" form="tournament-form">${tournament ? "저장" : "추가"}</button>
    `;
    return modalFrame(tournament ? "대회 수정" : "대회 추가", body, actions);
  }

  function renderMatchModal() {
    const match = state.editingMatchId ? data.matches.find((item) => item.id === state.editingMatchId) : null;
    const defaults = match ? {} : recentMatchDefaults();
    const selectedDeckId = match?.deckId || defaults.deckId || "";
    const selectedMatchType = match?.matchType || defaults.matchType || data.matchTypes[0] || "대전";
    const defaultOpponent = match ? match.opponent || "" : defaults.opponent || "";
    const selectedPlayOrder = match?.playOrder || defaults.playOrder || "unknown";
    const selectedTournamentId = match?.tournamentId || state.prefillMatchTournamentId || "";
    const selectedTournament = getTournament(selectedTournamentId);
    const selectedRoundStage =
      match?.roundStage || state.prefillMatchRoundStage || (selectedTournamentId ? suggestedTournamentStage(selectedTournamentId) : "none");
    const selectedMatchFormat =
      selectedRoundStage === "swiss" ? "single" : match?.matchFormat === "match" || selectedRoundStage === "top" ? "match" : "single";
    const selectedMatchScore = selectedMatchFormat === "match" ? matchScoreValue(match) : "2-0";
    const selectedResult = selectedRoundStage === "swiss" && match?.result === "draw" ? "win" : match?.result || "win";
    const selectedRoundLabel =
      match?.roundLabel || state.prefillMatchRoundLabel || (selectedTournamentId ? suggestedRoundLabel(selectedTournamentId, selectedRoundStage) : "");
    const selectedDate = match?.date || selectedTournament?.date || todayISO();
    const selectedTournamentProgress = selectedTournament ? tournamentRoundProgress(selectedTournament) : null;
    const hasQuickDefaults = !match && Boolean(data.settings?.quickMatchDefaults || data.matches[0]);
    const recentDecks = match ? [] : recentDeckOptions(4);
    const recentOpponents = match ? [] : recentOpponentOptions(6);
    const body = `
      <form class="form-grid match-form ${selectedMatchFormat === "match" ? "match-mode" : "single-mode"}${
        selectedRoundStage === "swiss" ? " swiss-mode" : ""
      }" id="match-form">
        ${hasQuickDefaults ? `<div class="mini-text">최근 입력한 덱, 상대, 대전 유형을 기본값으로 불러왔습니다.</div>` : ""}
        <label class="field">
          <span>내 덱</span>
          <select class="select" name="deckId" data-match-deck-select>
            <option value="">덱 선택</option>
            ${data.decks
              .map((deck) => `<option value="${escapeHTML(deck.id)}"${selectedAttr(selectedDeckId, deck.id)}>${escapeHTML(deck.name)}</option>`)
              .join("")}
          </select>
        </label>
        ${
          recentDecks.length
            ? `<div class="quick-chip-row" aria-label="최근 사용 덱">
                ${recentDecks
                  .map(
                    (deck) => `
                      <button class="quick-fill-chip ${deck.id === selectedDeckId ? "active" : ""}" type="button" data-action="select-match-deck" data-id="${escapeHTML(deck.id)}">
                        ${escapeHTML(deck.name)}
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="form-row">
          <label class="field">
            <span>날짜</span>
            <input class="input" type="date" name="date" value="${escapeHTML(selectedDate)}" />
          </label>
          <label class="field">
            <span>대전 유형</span>
            <select class="select" name="matchType">
              ${data.matchTypes
                .map((type) => `<option value="${escapeHTML(type)}"${selectedAttr(selectedMatchType, type)}>${escapeHTML(type)}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <div class="form-row tournament-match-fields">
          <label class="field">
            <span>대회</span>
            <select class="select" name="tournamentId" data-match-tournament-select>
              <option value="">대회 없음</option>
              ${sortedTournaments()
                .map(
                  (tournament) =>
                    `<option value="${escapeHTML(tournament.id)}"${selectedAttr(selectedTournamentId, tournament.id)}>${escapeHTML(
                      `${tournament.name} · ${tournament.date}`
                    )}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="field">
            <span>라운드</span>
            <input class="input" name="roundLabel" value="${escapeHTML(selectedRoundLabel)}" data-suggested-round="${escapeHTML(selectedRoundLabel)}" placeholder="예: R1, 4강, 결승" autocomplete="off" />
          </label>
        </div>
        <div class="field tournament-round-stage">
          <span>라운드 구분</span>
          <div class="segmented-control round-stage-control">
            ${ROUND_STAGE_OPTIONS.map(
              ([value, label]) => `
                <label class="segmented-option">
                  <input type="radio" name="roundStage" value="${value}"${checkedAttr(selectedRoundStage, value)} />
                  <span>${label}</span>
                </label>
              `
            ).join("")}
          </div>
        </div>
        ${
          selectedTournament
            ? `<div class="match-helper-card">
                <strong>${escapeHTML(selectedTournament.name)}</strong>
                <span>
                  현재 ${selectedTournamentProgress?.swissCount || 0}스위스 / ${selectedTournamentProgress?.topCount || 0}토너먼트 ·
                  추천 ${escapeHTML(selectedRoundLabel || "직접 입력")}
                </span>
                <span>스위스는 승/패만, 토너먼트는 세트 스코어로 기록하면 공유문이 깔끔해집니다.</span>
              </div>`
            : ""
        }
        <label class="field">
          <span>상대</span>
          <input class="input" name="opponent" value="${escapeHTML(defaultOpponent)}" placeholder="상대 이름 또는 덱" autocomplete="off" />
        </label>
        ${
          recentOpponents.length
            ? `<div class="quick-chip-row" aria-label="최근 상대">
                ${recentOpponents
                  .map(
                    (opponent) => `
                      <button class="quick-fill-chip ${matchupOpponentKey(opponent) === matchupOpponentKey(defaultOpponent) ? "active" : ""}" type="button" data-action="fill-match-opponent" data-value="${escapeHTML(opponent)}">
                        vs ${escapeHTML(opponent)}
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="form-row">
          <div class="field match-format-field">
            <span>기록 방식</span>
            <div class="segmented-control match-format-control">
              ${[
                ["single", "단판"],
                ["match", "매치전"],
              ]
                .map(
                  ([value, label]) => `
                    <label class="segmented-option">
                      <input type="radio" name="matchFormat" value="${value}"${checkedAttr(selectedMatchFormat, value)} />
                      <span>${label}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="field match-score-field">
            <span>세트 스코어</span>
            <div class="segmented-control match-score-control">
              ${MATCH_SCORE_OPTIONS.map(
                ([score]) => `
                  <label class="segmented-option">
                    <input type="radio" name="matchScore" value="${score}"${checkedAttr(selectedMatchScore, score)} />
                    <span>${score}</span>
                  </label>
                `
              ).join("")}
            </div>
          </div>
          <div class="field single-result-field">
            <span>결과</span>
            <div class="segmented-control">
              ${["win", "loss", "draw"]
                .map(
                  (result) => `
                    <label class="segmented-option result-option ${result === "draw" ? "draw-result-option" : ""}">
                      <input type="radio" name="result" value="${result}"${checkedAttr(selectedResult, result)} />
                      <span>${resultLabel(result)}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="field">
            <span>선후공</span>
            <div class="segmented-control play-order-control">
              ${[
                ["unknown", "미상"],
                ["first", "선공"],
                ["second", "후공"],
              ]
                .map(
                  ([value, label]) => `
                    <label class="segmented-option">
                      <input type="radio" name="playOrder" value="${value}"${checkedAttr(selectedPlayOrder, value)} />
                      <span>${label}</span>
                    </label>
                  `
                )
                .join("")}
            </div>
          </div>
        </div>
        <label class="field">
          <span>메모</span>
          <textarea class="textarea" name="memo" placeholder="핵심 플레이, 실수, 사이드 계획 등을 적어두세요">${escapeHTML(match?.memo || "")}</textarea>
        </label>
      </form>
    `;
    const actions = `
      <button class="control-button" type="button" data-action="close-modal">취소</button>
      ${
        match
          ? `<button class="primary-action" type="submit" form="match-form">저장</button>`
          : `
            <button class="control-button active" type="submit" form="match-form" name="afterSave" value="continue">추가 후 계속</button>
            <button class="primary-action" type="submit" form="match-form">추가</button>
          `
      }
    `;
    return modalFrame(match ? "기록 수정" : "기록 추가", body, actions);
  }

  function renderDeckModal() {
    const deck = state.editingDeckId ? data.decks.find((item) => item.id === state.editingDeckId) : null;
    const draft = state.deckDraftForm || {
      name: deck?.name || "",
      note: deck?.note || "",
      colors: deck?.colors?.length ? deck.colors : ["blue"],
    };
    const selectedColors = new Set(draft.colors?.length ? draft.colors : ["blue"]);
    const levelLabels = ["2", "3", "4", "5", "6", "7", "T", "O"];
    const levelDisplayLabels = { "2": "LV.2", "3": "LV.3", "4": "LV.4", "5": "LV.5", "6": "LV.6", "7": "LV.7", "T": "테이머", "O": "옵션" };
    const levelCounts = deckLevelCounts(normalizeCards(state.deckDraftCards || []));
    const body = `
      <form class="form-grid" id="deck-form">
        <label class="field">
          <span>덱 이름</span>
          <input class="input" name="name" value="${escapeHTML(draft.name || "")}" placeholder="예: 워그레이몬" autocomplete="off" required />
        </label>
        <div class="field">
          <span>색상</span>
          <div class="color-level-row">
            <div class="swatch-row">
              ${Object.entries(colorMap)
                .map(
                  ([color, hex]) => `
                    <label class="swatch-option" title="${color}">
                      <input type="checkbox" name="colors" value="${color}"${selectedColors.has(color) ? " checked" : ""} />
                      <span style="--dot-color: ${hex}"></span>
                    </label>
                  `
                )
                .join("")}
            </div>
            <div class="level-counter-strip">
              ${levelLabels.map((label) => { const cnt = levelCounts[label] || 0; return `<span data-lv="${label.toLowerCase()}"${cnt === 0 ? ' class="zero"' : ""}><small>${escapeHTML(levelDisplayLabels[label])}</small><strong>${cnt}</strong></span>`; }).join("")}
            </div>
          </div>
        </div>
        ${renderDeckBuilder()}
        <label class="field">
          <span>메모</span>
          <textarea class="textarea" name="note" placeholder="덱 버전, 주요 카드, 조정 포인트">${escapeHTML(draft.note || "")}</textarea>
        </label>
      </form>
    `;
    const actions = `
      <button class="control-button" type="button" data-action="close-modal">취소</button>
      <button class="primary-action" type="submit" form="deck-form">${deck ? "저장" : "추가"}</button>
    `;
    return modalFrame(deck ? "덱 수정" : "덱 추가", body, actions, "deck-modal-panel");
  }

  function renderCatalogCard(card) {
    const existing = state.deckDraftCards.find((item) => normalizeCardNumber(item.cardNumber) === card.no);
    const count = Number(existing?.count) || 0;
    const canAdd = availableCopiesForCard(state.deckDraftCards, catalogCardToDraft(card, 1)) > 0;
    const imageSrc = catalogImageSource(card);
    const no = escapeHTML(card.no);
    const stepper = count
      ? `
        <div class="catalog-stepper" aria-label="${no} 수량 조절">
          <button class="catalog-step-btn" type="button" data-action="decrement-deck-card" data-card-id="${escapeHTML(existing.id)}" aria-label="${no} 1장 빼기">-</button>
          <span class="catalog-step-count">${count}<small>/4</small></span>
          <button class="catalog-step-btn" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"} aria-label="${no} 1장 추가">+</button>
        </div>
      `
      : `
        <div class="catalog-stepper">
          <button class="catalog-step-btn add-only" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"}>+ 추가</button>
        </div>
      `;
    return `
      <article class="catalog-card${count ? " in-deck" : ""}${canAdd || count ? "" : " disabled"}" title="${escapeHTML(card.no)} ${escapeHTML(card.name)}">
        <button class="catalog-image" type="button" data-action="preview-catalog-card" data-card-no="${no}" aria-label="${no} 카드 미리보기">
          ${
            imageSrc
              ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" data-card-no="${no}" loading="lazy" />`
              : `<span class="catalog-image-empty">${no}</span>`
          }
        </button>
        ${count ? `<span class="catalog-count">${count}</span>` : ""}
        <button class="catalog-info" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"} aria-label="${no} 1장 추가">
          <strong>${escapeHTML(card.name)}</strong>
          <small>${no} · ${escapeHTML(catalogMetaText(card))}</small>
        </button>
        ${stepper}
      </article>
    `;
  }

  function renderCatalogGridContent() {
    if (!CARD_CATALOG.length) {
      return `<div class="builder-empty">카드 카탈로그를 불러오지 못했습니다. 직접 입력으로 카드를 추가해 주세요.</div>`;
    }
    const catalogCards = filteredCatalogCards();
    if (!catalogCards.length) {
      return `
        <div class="builder-empty">
          <strong>검색 결과가 없습니다.</strong>
          <span>카드 번호는 BT13-111, bt13 111처럼 입력해도 찾을 수 있습니다.</span>
          <button class="control-button" type="button" data-action="clear-deck-search">검색 초기화</button>
        </div>
      `;
    }
    return catalogCards.map(renderCatalogCard).join("");
  }

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

  function renderDeckListRow(card) {
    const imageSrc = deckCardImageSource(card);
    return `
      <div class="deck-list-row">
        <div class="deck-row-card">
          <span class="deck-row-thumb" data-action="preview-catalog-card" data-card-no="${escapeHTML(normalizeCardNumber(card.cardNumber))}">
            ${
              imageSrc
                ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" data-card-no="${escapeHTML(normalizeCardNumber(card.cardNumber))}" loading="lazy" />`
                : `<span class="deck-row-thumb-empty">${escapeHTML(normalizeCardNumber(card.cardNumber).slice(0, 2) || "?")}</span>`
            }
          </span>
          <div class="deck-row-main">
            <strong>${escapeHTML(cardDisplayName(card))}</strong>
            <span>${escapeHTML(cardMetaText(card))}</span>
          </div>
        </div>
        <div class="deck-count-stepper">
          <button class="step-button" type="button" aria-label="1장 빼기" data-action="decrement-deck-card" data-card-id="${escapeHTML(card.id)}">-</button>
          <input class="input count-input" data-card-field="count" data-card-id="${escapeHTML(card.id)}" type="number" min="1" max="4" value="${
            card.count
          }" aria-label="매수" />
          <button class="step-button" type="button" aria-label="1장 추가" data-action="increment-deck-card" data-card-id="${escapeHTML(card.id)}">+</button>
        </div>
        <button class="icon-button" type="button" title="카드 삭제" aria-label="카드 삭제" data-action="remove-deck-card" data-card-id="${escapeHTML(card.id)}">×</button>
      </div>
    `;
  }

  function renderDeckThumb(card) {
    const imageSrc = deckCardImageSource(card);
    const cardNo = normalizeCardNumber(card.cardNumber);
    return `
      <div class="deck-thumb-item">
        <span class="deck-thumb-img" data-action="preview-catalog-card" data-card-no="${escapeHTML(cardNo)}">
          ${imageSrc
            ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" loading="lazy" />`
            : `<span class="deck-thumb-empty">${escapeHTML(cardNo.slice(0, 4) || "?")}</span>`}
        </span>
        <span class="deck-thumb-count">${card.count}</span>
        <div class="deck-thumb-overlay">
          <button class="deck-thumb-btn minus" type="button" data-action="decrement-deck-card" data-card-id="${escapeHTML(card.id)}" title="1장 빼기">−</button>
          <button class="deck-thumb-btn remove" type="button" data-action="remove-deck-card" data-card-id="${escapeHTML(card.id)}" title="삭제">×</button>
          <button class="deck-thumb-btn plus" type="button" data-action="increment-deck-card" data-card-id="${escapeHTML(card.id)}" title="1장 추가">+</button>
        </div>
      </div>
    `;
  }

  function renderDeckThumbSections(cards) {
    const mode = state.deckTraySort || "level";
    const mainCards = sortDeckCardsBy(cards.filter((c) => c.type !== "digiEgg"), mode);
    const eggCards = sortDeckCardsBy(cards.filter((c) => c.type === "digiEgg"), mode);
    const parts = [];
    if (mainCards.length) {
      parts.push(`
        <div class="deck-thumb-section">
          <div class="deck-thumb-section-label">메인 덱 (${mainCards.reduce((s,c)=>s+Number(c.count||0),0)}장)</div>
          <div class="deck-thumb-grid">${mainCards.map(renderDeckThumb).join("")}</div>
        </div>
      `);
    }
    if (eggCards.length) {
      parts.push(`
        <div class="deck-thumb-section">
          <div class="deck-thumb-section-label">디지타마 (${eggCards.reduce((s,c)=>s+Number(c.count||0),0)}장)</div>
          <div class="deck-thumb-grid">${eggCards.map(renderDeckThumb).join("")}</div>
        </div>
      `);
    }
    return parts.join("");
  }

  function renderManualCardInput() {
    return `
      <details class="manual-card-panel">
        <summary>직접 입력</summary>
        <div class="builder-add">
          <input class="input" data-new-card-number placeholder="카드 넘버" autocomplete="off" inputmode="text" pattern="[A-Za-z0-9-]*" />
          <input class="input" data-new-card-level placeholder="Lv" autocomplete="off" inputmode="numeric" pattern="[0-9]" maxlength="1" />
          <input class="input wide-field" data-new-card-name placeholder="카드 이름" autocomplete="off" />
          <select class="select" data-new-card-type aria-label="카드 종류">
            ${Object.entries(cardTypeLabels)
              .map(([type, label]) => `<option value="${type}">${label}</option>`)
              .join("")}
          </select>
          <input class="input" data-new-card-count type="number" min="1" max="4" value="4" aria-label="매수" />
          <button class="control-button active" type="button" data-action="add-deck-card">추가</button>
        </div>
      </details>
    `;
  }

  function renderDeckFilterChip(group, value, label, options = {}) {
    const filters = deckCardFilters();
    const active = Array.isArray(filters[group]) && filters[group].includes(value);
    return `
      <button class="deck-filter-chip ${active ? "active" : ""} ${options.color ? "color-chip" : ""}" type="button"
        data-action="toggle-deck-filter-value" data-filter-group="${escapeHTML(group)}" data-filter-value="${escapeHTML(value)}">
        ${options.color ? `<span class="color-dot" style="--dot-color: ${escapeHTML(colorMap[value] || colorMap.blue)}"></span>` : ""}
        ${escapeHTML(label)}
      </button>
    `;
  }

  function renderDeckAdvancedSearch(resultCount, forceOpen = false) {
    if (!forceOpen && !state.deckAdvancedOpen) return "";
    const filters = deckCardFilters();
    const setPrefixes = catalogSetPrefixes();
    const levelOptions = ["2", "3", "4", "5", "6", "7"];
    return `
      <div class="deck-advanced-search">
        <div class="deck-advanced-head">
          <div>
            <strong>상세 검색</strong>
            <span class="deck-advanced-result-count">${resultCount}종 검색됨 · 최대 ${CARD_BROWSER_LIMIT}종 표시</span>
          </div>
          <button class="quiet-button" type="button" data-action="clear-deck-advanced-search" ${
            activeDeckAdvancedFilterCount() ? "" : "disabled"
          }>초기화</button>
        </div>

        <div class="deck-filter-section">
          <span>색상</span>
          <div class="deck-filter-chips">
            ${Object.entries(colorLabels)
              .map(([color, label]) => renderDeckFilterChip("colors", color, label, { color: true }))
              .join("")}
          </div>
        </div>

        <div class="deck-filter-section">
          <span>Lv</span>
          <div class="deck-filter-chips compact">
            ${levelOptions.map((level) => renderDeckFilterChip("levels", level, `Lv.${level}`)).join("")}
          </div>
        </div>

        <div class="deck-filter-grid">
          <label class="field">
            <span>수록 코드</span>
            <select class="select" data-deck-filter-select="setPrefix">
              <option value="all"${selectedAttr(filters.setPrefix, "all")}>전체</option>
              ${setPrefixes.map((prefix) => `<option value="${escapeHTML(prefix)}"${selectedAttr(filters.setPrefix, prefix)}>${escapeHTML(prefix)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>정렬</span>
            <select class="select" data-deck-filter-select="sort">
              <option value="catalog"${selectedAttr(filters.sort, "catalog")}>기본 순서</option>
              <option value="number"${selectedAttr(filters.sort, "number")}>카드번호순</option>
              <option value="latest"${selectedAttr(filters.sort, "latest")}>최신 번호 우선</option>
              <option value="level"${selectedAttr(filters.sort, "level")}>Lv 낮은순</option>
              <option value="name"${selectedAttr(filters.sort, "name")}>이름순</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  function renderDeckBuilder() {
    const cards = normalizeCards(state.deckDraftCards);
    const summary = deckCountSummary(cards);
    const limitMessage = deckLimitViolation(cards);
    const readiness = deckReadiness(cards);
    const activeFilterCount = activeDeckAdvancedFilterCount();
    const catalogResultCount = filteredCatalogCardPool().length;
    const builderStatusTone = limitMessage ? "danger" : readiness.level;
    const builderView = ["catalog", "advanced", "tray"].includes(state.deckBuilderView) ? state.deckBuilderView : "catalog";
    const builderStatusLabel = limitMessage ? "제한 초과" : readiness.label;
    return `
      <div class="deck-builder hub-builder">
        <div class="builder-sticky-header">
          <div class="hub-search-row">
            <label class="hub-search">
              <span aria-hidden="true">⌕</span>
              <input class="input" type="search" value="${escapeHTML(state.deckCardSearch)}" placeholder="카드명/효과/번호" data-deck-card-search autocomplete="off" />
            </label>
            <select class="select hub-type-select" data-deck-card-type aria-label="카드 종류 필터">
              <option value="all"${selectedAttr(state.deckCardType, "all")}>전체</option>
              ${Object.entries(cardTypeLabels)
                .filter(([type]) => type !== "other")
                .map(([type, label]) => `<option value="${type}"${selectedAttr(state.deckCardType, type)}>${label}</option>`)
                .join("")}
            </select>
            <button class="control-button hub-detail-button ${state.deckAdvancedOpen || activeFilterCount ? "active" : ""}" type="button" data-action="toggle-deck-advanced-search">
              상세${activeFilterCount ? ` ${activeFilterCount}` : ""}
            </button>
            <div class="mobile-builder-summary ${escapeHTML(builderStatusTone)}">
              <span class="mobile-builder-status">${escapeHTML(builderStatusLabel)}</span>
              <span>메인 <strong>${summary.main}/${DECK_LIMITS.main}</strong></span>
              <span>디지타마 <strong>${summary.digiEgg}/${DECK_LIMITS.digiEgg}</strong></span>
              <span>총 <strong>${summary.total}/${DECK_LIMITS.total}</strong></span>
            </div>
          </div>
          <div class="builder-flow-strip" aria-label="덱 구축 진행 상태">
            <span data-builder-result-count>${catalogResultCount.toLocaleString("ko-KR")}종 검색됨</span>
            <span>카드에서 바로 수량 조절</span>
            <span class="${escapeHTML(builderStatusTone)}">현재 ${summary.total}/${DECK_LIMITS.total}장</span>
            <span>같은 카드 번호 최대 4장</span>
          </div>
          <div class="deck-builder-tabs">
            <button class="deck-tab-btn${builderView === "catalog" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="catalog">검색</button>
            <button class="deck-tab-btn${builderView === "advanced" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="advanced">상세${activeFilterCount ? ` ${activeFilterCount}` : ""}</button>
            <button class="deck-tab-btn${builderView === "tray" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="tray">덱 목록 (${summary.total}장)</button>
          </div>
        </div>
        <div class="desktop-advanced-panel">${renderDeckAdvancedSearch(catalogResultCount)}</div>

        <div class="hub-layout">
          <section class="mobile-advanced-panel${builderView === "advanced" ? "" : " mobile-hidden"}" aria-label="상세 검색">
            ${renderDeckAdvancedSearch(catalogResultCount, true)}
          </section>

          <section class="catalog-panel${builderView === "catalog" ? "" : " mobile-hidden"}" aria-label="카드 카탈로그">
            <div class="catalog-grid">
              ${renderCatalogGridContent()}
            </div>
          </section>

          <section class="deck-tray${builderView === "tray" ? "" : " mobile-hidden"}" aria-label="구축 중인 덱">
            <div class="deck-count-pills">
              <span class="deck-pill main">메인 <strong>${summary.main}/${DECK_LIMITS.main}</strong></span>
              <span class="deck-pill egg">디지타마 <strong>${summary.digiEgg}/${DECK_LIMITS.digiEgg}</strong></span>
              <span class="deck-pill total">총 <strong>${summary.total}/${DECK_LIMITS.total}</strong></span>
            </div>
            <div class="deck-readiness builder ${escapeHTML(readiness.level)}">
              <strong>${escapeHTML(readiness.label)}</strong>
              <span>${escapeHTML(readiness.detail)}</span>
            </div>
            ${limitMessage ? `<div class="builder-rule danger">${escapeHTML(limitMessage)}</div>` : ""}
            <div class="deck-list-toolbar">
              <strong>덱 목록</strong>
              <span>${cards.length}종 · ${summary.total}장</span>
              ${
                cards.length
                  ? `
                    <div class="deck-list-tools">
                      <select class="select deck-sort-select" data-deck-tray-sort aria-label="덱 목록 정렬">
                        <option value="level"${selectedAttr(state.deckTraySort, "level")}>레벨순</option>
                        <option value="number"${selectedAttr(state.deckTraySort, "number")}>번호순</option>
                        <option value="type"${selectedAttr(state.deckTraySort, "type")}>종류순</option>
                      </select>
                      <button class="deck-tool-button danger" type="button" data-action="clear-deck-draft-cards">모든 카드 비우기</button>
                    </div>
                  `
                  : ""
              }
            </div>
            ${
              cards.length
                ? `<div class="hub-deck-list">${renderDeckThumbSections(cards)}</div>`
                : `<div class="builder-empty">카드를 누르면 이곳에 덱 리스트가 쌓입니다.</div>`
            }
            ${renderManualCardInput()}
          </section>
        </div>
      </div>
    `;
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
    if (returnScroll != null) window.scrollTo(0, returnScroll);
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
    // 일반 화면(덱 모달 밖)에서 미리보기를 열 때 현재 페이지 스크롤 위치를 저장해두고,
    // 닫을 때 그대로 복원한다(미리보기 후 화면이 위/아래로 튀는 문제 방지).
    if (!state.previewCardNo && state.modal !== "deck") {
      previewReturnScroll = window.scrollY;
    }
    state.previewCardNo = normalized;
    // 덱 수정 중 덱에 있는 카드면, 저장된 일러를 기본 선택으로 연다.
    const draftCard = state.modal === "deck" ? (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === normalized) : null;
    state.previewActiveImage = draftCard ? imageIndexFromArt(draftCard.art) : 0;
    if (state.modal === "deck") renderKeepingDeckScroll();
    else render();
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

  function handleAction(action, target) {
    if (action === "preview-catalog-card") {
      openCardPreview(target.dataset.cardNo);
      return;
    }
    if (action === "close-card-preview") {
      closeCardPreview();
      return;
    }
    if (action === "preview-set-image") {
      const index = parseInt(target.dataset.imgIndex, 10);
      state.previewActiveImage = Number.isFinite(index) ? index : 0;
      if (state.modal === "deck") renderKeepingDeckScroll();
      else render();
      return;
    }
    if (action === "save-deck-card-art") {
      const draftCard = (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === state.previewCardNo);
      if (draftCard) {
        draftCard.art = imageIndexToArt(state.previewActiveImage || 0);
        notifyToast("일러 저장", `${cardDisplayName(draftCard)} 일러를 덱에 저장했습니다.`, "success", 1600);
        renderKeepingDeckScroll();
      }
      return;
    }
    if (action === "login-google") {
      loginWithGoogle();
      return;
    }
    if (action === "logout-google") {
      logoutGoogle();
      return;
    }
    if (action === "sync-cloud-now") {
      if (!state.authUser) loginWithGoogle();
      else saveCloudData({ notify: true });
      return;
    }
    if (action === "load-cloud-now") {
      loadCloudNow();
      return;
    }
    if (action === "use-cloud-version") {
      applyCloudConflictVersion();
      return;
    }
    if (action === "keep-local-version") {
      keepLocalConflictVersion();
      return;
    }
    if (action === "dismiss-toast") {
      dismissToast(target.dataset.id);
      return;
    }
    if (action === "restore-undo") {
      restoreUndo(target.dataset.undoId);
      return;
    }
    if (action === "retry-cloud-save") {
      saveCloudData({ notify: true });
      return;
    }
    if (action === "restore-recovery-point") {
      restoreRecoveryPoint();
      return;
    }
    if (action === "reload-app") {
      refreshAppVersion();
      return;
    }
    if (action === "install-pwa") {
      installPwa();
      return;
    }
    if (action === "dismiss-starter-guide") {
      data.settings = { ...(data.settings || {}), dismissedStarterGuide: true };
      saveData();
      render();
      return;
    }
    if (action === "copy-card-update-commands") {
      if (isAdminUser()) copyCardUpdateCommands();
      else notifyToast("관리자 전용 기능", "카드 데이터 관리는 관리자 계정에서만 사용할 수 있습니다.", "warning");
      return;
    }
    if (action === "copy-daily-share") {
      copyDailyShareText();
      return;
    }
    if (action === "save-daily-share-image") {
      downloadDailyShareImage();
      return;
    }
    if (action === "open-daily-share-x") {
      openDailyShareX();
      return;
    }
    if (action === "open-daily-share-panel") {
      openDailySharePanel();
      return;
    }
    if (action === "download-card-data-status") {
      if (isAdminUser()) downloadCardDataStatus();
      else notifyToast("관리자 전용 기능", "카드 데이터 관리는 관리자 계정에서만 사용할 수 있습니다.", "warning");
      return;
    }
    if (action === "download-diagnostics") {
      downloadDiagnostics();
      return;
    }
    if (action === "clear-diagnostics") {
      clearDiagnostics();
      return;
    }
    if (action === "open-match") {
      state.modal = "match";
      state.editingMatchId = null;
      state.prefillMatchTournamentId = "";
      state.prefillMatchRoundStage = "";
      state.prefillMatchRoundLabel = "";
      render();
      return;
    }
    if (action === "open-match-for-tournament") {
      state.modal = "match";
      state.editingMatchId = null;
      state.prefillMatchTournamentId = target.dataset.id || "";
      state.prefillMatchRoundStage = "";
      state.prefillMatchRoundLabel = "";
      render();
      return;
    }
    if (action === "open-match-for-tournament-stage") {
      const tournamentId = target.dataset.id || "";
      const stage = ROUND_STAGE_OPTIONS.some(([value]) => value === target.dataset.stage) ? target.dataset.stage : "swiss";
      state.modal = "match";
      state.editingMatchId = null;
      state.prefillMatchTournamentId = tournamentId;
      state.prefillMatchRoundStage = stage;
      state.prefillMatchRoundLabel = target.dataset.roundLabel || (tournamentId ? suggestedRoundLabel(tournamentId, stage) : "");
      render();
      return;
    }
    if (action === "open-tournament") {
      state.modal = "tournament";
      state.editingTournamentId = null;
      render();
      return;
    }
    if (action === "edit-tournament") {
      state.modal = "tournament";
      state.editingTournamentId = target.dataset.id;
      render();
      return;
    }
    if (action === "delete-tournament") {
      const tournament = getTournament(target.dataset.id);
      if (tournament && confirm(`「${tournament.name}」 대회를 삭제할까요? 연결된 전적은 유지하고 대회 연결만 해제됩니다.`)) {
        const snapshot = cloneDataSnapshot();
        saveRecoveryPoint(snapshot, "대회 삭제 전");
        data.tournaments = data.tournaments.filter((item) => item.id !== tournament.id);
        data.matches = data.matches.map((match) =>
          match.tournamentId === tournament.id ? { ...match, tournamentId: "", roundStage: "none", roundLabel: "" } : match
        );
        saveData();
        notifyUndo("대회 삭제됨", snapshot, `"${tournament.name}" 대회를 되돌릴 수 있습니다.`);
        render();
      }
      return;
    }
    if (action === "select-match-tournament") {
      const panel = target.closest(".modal-panel");
      const select = panel?.querySelector('[name="tournamentId"]');
      if (select) {
        select.value = target.dataset.id || "";
        select.focus();
      }
      render();
      return;
    }
    if (action === "select-match-deck") {
      const panel = target.closest(".modal-panel");
      const select = panel?.querySelector('[name="deckId"]');
      if (select) {
        select.value = target.dataset.id || "";
        select.focus();
      }
      panel?.querySelectorAll(".quick-fill-chip[data-action='select-match-deck']").forEach((button) => {
        button.classList.toggle("active", button.dataset.id === select?.value);
      });
      return;
    }
    if (action === "fill-match-opponent") {
      const panel = target.closest(".modal-panel");
      const input = panel?.querySelector('[name="opponent"]');
      if (input) {
        input.value = target.dataset.value || "";
        input.focus();
      }
      panel?.querySelectorAll(".quick-fill-chip[data-action='fill-match-opponent']").forEach((button) => {
        button.classList.toggle("active", button.dataset.value === input?.value);
      });
      return;
    }
    if (action === "edit-match") {
      state.modal = "match";
      state.editingMatchId = target.dataset.id;
      render();
      return;
    }
    if (action === "set-stats-period") {
      state.statsPeriod = statsPeriodFromValue(target.dataset.period);
      render();
      return;
    }
    if (action === "calendar-prev-month" || action === "calendar-next-month") {
      let month = state.calendarMonth + (action === "calendar-next-month" ? 1 : -1);
      let year = state.calendarYear;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      state.calendarMonth = month;
      state.calendarYear = year;
      render();
      return;
    }
    if (action === "select-calendar-day") {
      state.selectedCalendarDate = state.selectedCalendarDate === target.dataset.date ? "" : target.dataset.date;
      render();
      // 선택한 날짜의 일정 패널이 캘린더 아래(모바일은 하단 네비에 가림)에 생기므로 보이게 스크롤한다.
      // 대회가 많아 패널이 길어도 항상 패널 '상단'(제목·첫 대회)부터 보이도록 block:start 로.
      if (state.selectedCalendarDate) {
        requestAnimationFrame(() => {
          document.getElementById("calendar-day-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }
    if (action === "event-region-toggle") {
      const region = target.dataset.region || "";
      if (state.eventRegionFilters.has(region)) state.eventRegionFilters.delete(region);
      else state.eventRegionFilters.add(region);
      renderKeepingRegionScroll();
      return;
    }
    if (action === "event-region-clear") {
      state.eventRegionFilters.clear();
      renderKeepingRegionScroll();
      return;
    }
    if (action === "add-personal-event") {
      state.modal = "event";
      state.eventModalKind = "personal";
      state.editingEventId = null;
      render();
      return;
    }
    if (action === "add-event") {
      if (!isAdminUser()) return;
      state.modal = "event";
      state.eventModalKind = "official";
      state.editingEventId = null;
      render();
      return;
    }
    if (action === "edit-event") {
      const ev = findCalendarEvent(target.dataset.eventId);
      if (!ev) return;
      if (!ev.personal && !isAdminUser()) return; // 공식 일정 수정은 관리자만
      state.modal = "event";
      state.eventModalKind = ev.personal ? "personal" : "official";
      state.editingEventId = target.dataset.eventId;
      render();
      return;
    }
    if (action === "delete-event") {
      const ev = findCalendarEvent(target.dataset.eventId);
      if (!ev) return;
      if (ev.personal) {
        if (!confirm("이 개인 일정을 삭제할까요?")) return;
        deletePersonalEventById(ev.id);
        notifyToast("내 일정 삭제됨", "", "success");
        render();
        return;
      }
      if (!isAdminUser()) return;
      if (!confirm("이 대회 일정을 삭제할까요?")) return;
      deleteTournamentEventById(target.dataset.eventId)
        .then(() => loadTournamentEvents(true))
        .then(() => notifyToast("일정 삭제됨", "", "success"))
        .catch((error) => alert(`삭제 실패: ${error?.message || ""}`));
      return;
    }
    if (action === "ics-download") {
      const ev = findCalendarEvent(target.dataset.eventId);
      if (ev) downloadIcs([ev], `jeonjeokmon-${ev.title}`);
      return;
    }
    if (action === "ics-download-all") {
      downloadIcs(filteredTournamentEvents(), icsFileName());
      return;
    }
    if (action === "delete-match") {
      if (confirm("이 전적을 삭제할까요?")) {
        const snapshot = cloneDataSnapshot();
        saveRecoveryPoint(snapshot, "전적 삭제 전");
        data.matches = data.matches.filter((match) => match.id !== target.dataset.id);
        state.selected.delete(target.dataset.id);
        saveData();
        notifyUndo("전적 삭제됨", snapshot, "삭제한 전적을 되돌릴 수 있습니다.");
        render();
      }
      return;
    }
    if (action === "open-deck") {
      state.modal = "deck";
      state.editingDeckId = null;
      startDeckDraft(null);
      render();
      return;
    }
    if (action === "open-deck-import") {
      state.modal = "deck-import";
      render();
      return;
    }
    if (action === "edit-deck") {
      state.modal = "deck";
      state.editingDeckId = target.dataset.id;
      startDeckDraft(getDeck(target.dataset.id));
      render();
      return;
    }
    if (action === "delete-deck") {
      const deck = getDeck(target.dataset.id);
      if (deck && confirm(`「${deck.name}」 덱을 삭제할까요? 관련 전적은 '삭제된 덱'으로 표시됩니다.`)) {
        const snapshot = cloneDataSnapshot();
        saveRecoveryPoint(snapshot, "덱 삭제 전");
        data.decks = data.decks.filter((item) => item.id !== deck.id);
        saveData();
        notifyUndo("덱 삭제됨", snapshot, `"${deck.name}" 덱을 되돌릴 수 있습니다.`);
        render();
      }
      return;
    }
    if (action === "clone-deck") {
      const deck = getDeck(target.dataset.id);
      if (!deck) return;
      data.decks.push(cloneDeck(deck));
      saveData();
      render();
      return;
    }
    if (action === "export-deck") {
      const deck = getDeck(target.dataset.id);
      if (deck) downloadDeckExport(deck);
      return;
    }
    if (action === "copy-deck-code") {
      const deck = getDeck(target.dataset.id);
      if (deck) copyDeckExportCode(deck);
      return;
    }
    if (action === "save-deck-version") {
      const deck = getDeck(target.dataset.id);
      if (!deck) return;
      const currentCards = deckCards(deck);
      if (!currentCards.length) {
        alert("카드가 없는 덱은 버전으로 기록할 수 없습니다. 먼저 덱을 구성해 주세요.");
        return;
      }
      const versionCount = (deck.versions?.length || 0) + 1;
      const snapshot = {
        id: uid("dver"),
        label: `v${versionCount}`,
        cards: currentCards.map((card) => ({ ...card })),
        createdAt: new Date().toISOString(),
      };
      deck.versions = [...(deck.versions || []), snapshot];
      deck.updatedAt = new Date().toISOString();
      saveData();
      notifyToast("버전 기록됨", `${deck.name} ${snapshot.label} · 지금부터의 전적이 이 버전으로 집계됩니다.`, "success");
      render();
      return;
    }
    if (action === "print-deck") {
      const deck = getDeck(target.dataset.id);
      if (deck) printDeckRecipe(deck);
      return;
    }
    if (action === "download-deck-docx") {
      const deck = getDeck(target.dataset.id);
      if (deck) downloadDeckRecipeDocx(deck);
      return;
    }
    if (action === "download-deck-image") {
      const deck = getDeck(target.dataset.id);
      if (deck) downloadDeckImage(deck);
      return;
    }
    if (action === "print-deck-draft") {
      printDraftDeckRecipe();
      return;
    }
    if (action === "download-deck-draft-docx") {
      downloadDraftDeckRecipeDocx();
      return;
    }
    if (action === "deck-builder-tab") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckBuilderView = ["catalog", "advanced", "tray"].includes(target.dataset.view) ? target.dataset.view : "catalog";
      if (state.deckBuilderView === "advanced") state.deckAdvancedOpen = false;
      renderKeepingDeckScroll();
      return;
    }
    if (action === "toggle-deck-advanced-search") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckAdvancedOpen = !state.deckAdvancedOpen;
      renderKeepingDeckScroll();
      return;
    }
    if (action === "clear-deck-advanced-search") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckCardFilters = createDefaultDeckCardFilters();
      renderKeepingDeckScroll();
      return;
    }
    if (action === "clear-deck-search") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckCardSearch = "";
      state.deckCardType = "all";
      state.deckCardFilters = createDefaultDeckCardFilters();
      renderKeepingDeckScroll();
      return;
    }
    if (action === "toggle-deck-filter-value") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      toggleDeckFilterValue(target.dataset.filterGroup, target.dataset.filterValue);
      renderKeepingDeckScroll();
      return;
    }
    if (action === "add-deck-card") {
      const panel = target.closest(".modal-panel");
      cacheDeckDraftForm(panel?.querySelector("#deck-form"));
      const numberInput = panel?.querySelector("[data-new-card-number]");
      const levelInput = panel?.querySelector("[data-new-card-level]");
      const nameInput = panel?.querySelector("[data-new-card-name]");
      const countInput = panel?.querySelector("[data-new-card-count]");
      const typeInput = panel?.querySelector("[data-new-card-type]");
      const requestedCount = Math.max(1, Math.min(4, Number(countInput?.value) || 1));
      if (
        addDraftCard(
          {
            cardNumber: numberInput?.value,
            level: levelInput?.value,
            name: nameInput?.value,
            type: typeInput?.value,
          },
          requestedCount
        )
      ) {
        renderKeepingDeckScroll();
      }
      return;
    }
    if (action === "add-catalog-card") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      const card = CARD_CATALOG.find((item) => item.no === normalizeCardNumber(target.dataset.cardNo));
      if (card) {
        if (addDraftCard(catalogCardToDraft(card, 1), 1)) renderKeepingDeckScroll();
      }
      return;
    }
    if (action === "increment-deck-card" || action === "decrement-deck-card") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      changeDraftCardCount(target.dataset.cardId, action === "increment-deck-card" ? 1 : -1);
      renderKeepingDeckScroll();
      return;
    }
    if (action === "remove-deck-card") {
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckDraftCards = state.deckDraftCards.filter((card) => card.id !== target.dataset.cardId);
      renderKeepingDeckScroll();
      return;
    }
    if (action === "clear-deck-draft-cards") {
      if (!state.deckDraftCards.length) return;
      if (!confirm("현재 덱에 담긴 모든 카드를 비울까요?")) return;
      cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
      state.deckDraftCards = [];
      renderKeepingDeckScroll();
      return;
    }
    if (action === "toggle-filters") {
      state.filtersOpen = !state.filtersOpen;
      render();
      return;
    }
    if (action === "clear-filters") {
      state.filters = { query: "", result: "all", deck: "all", type: "all" };
      state.memoOnly = false;
      render();
      return;
    }
    if (action === "toggle-memo") {
      state.memoOnly = !state.memoOnly;
      render();
      return;
    }
    if (action === "toggle-bulk") {
      state.bulkMode = !state.bulkMode;
      state.selected.clear();
      render();
      return;
    }
    if (action === "delete-selected") {
      if (state.selected.size && confirm(`${state.selected.size}개의 전적을 삭제할까요?`)) {
        const snapshot = cloneDataSnapshot();
        saveRecoveryPoint(snapshot, "전적 일괄 삭제 전");
        const count = state.selected.size;
        data.matches = data.matches.filter((match) => !state.selected.has(match.id));
        state.selected.clear();
        saveData();
        notifyUndo("전적 삭제됨", snapshot, `${count}개의 전적을 되돌릴 수 있습니다.`);
        render();
      }
      return;
    }
    if (action === "delete-type") {
      if (data.matchTypes.length <= 1) {
        alert("대전 유형은 최소 1개가 필요합니다.");
        return;
      }
      const type = target.dataset.type;
      if (confirm(`「${type}」 유형을 삭제할까요? 기존 전적의 유형명은 유지됩니다.`)) {
        const snapshot = cloneDataSnapshot();
        saveRecoveryPoint(snapshot, "대전 유형 삭제 전");
        data.matchTypes = data.matchTypes.filter((item) => item !== type);
        saveData();
        notifyUndo("대전 유형 삭제됨", snapshot, `"${type}" 유형을 되돌릴 수 있습니다.`);
        render();
      }
      return;
    }
    if (action === "download-backup") {
      downloadBackup();
      return;
    }
    if (action === "clear-all") {
      clearAllData();
      return;
    }
    if (action === "close-modal") {
      closeModal();
    }
  }

  function handleMatchSubmit(form, submitter = null) {
    const formData = new FormData(form);
    const deckId = String(formData.get("deckId") || "");
    if (!deckId) {
      alert("덱을 선택해 주세요.");
      return;
    }
    const tournamentId = String(formData.get("tournamentId") || "");
    const roundStageValue = String(formData.get("roundStage") || "none");
    const roundStage = tournamentId && ROUND_STAGE_OPTIONS.some(([value]) => value === roundStageValue) ? roundStageValue : "none";
    const matchFormat = roundStage === "swiss" ? "single" : formData.get("matchFormat") === "match" ? "match" : "single";
    const rawResult = String(formData.get("result") || "win");
    const selectedResult = roundStage === "swiss" && rawResult === "draw" ? "win" : rawResult;
    const gameStats = matchFormat === "match" ? gameStatsFromScore(String(formData.get("matchScore") || "2-0")) : singleGameStats(selectedResult);
    const result = matchFormat === "match" ? resultFromGameStats(gameStats) : selectedResult;
    const match = {
      id: state.editingMatchId || uid("match"),
      deckId,
      date: String(formData.get("date") || todayISO()),
      matchType: normalizeMatchTypeName(formData.get("matchType") || data.matchTypes[0] || "대전") || "대전",
      opponent: String(formData.get("opponent") || "").trim(),
      result,
      matchFormat,
      gameWins: gameStats.gameWins,
      gameLosses: gameStats.gameLosses,
      gameDraws: gameStats.gameDraws,
      tournamentId,
      roundStage,
      roundLabel: tournamentId ? String(formData.get("roundLabel") || "").trim() : "",
      playOrder: String(formData.get("playOrder") || "unknown"),
      memo: String(formData.get("memo") || "").trim(),
      cardIds: [],
      cardNames: [],
      cardNumbers: [],
      createdAt: state.editingMatchId
        ? data.matches.find((item) => item.id === state.editingMatchId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!validateMatchBeforeSave(match)) return;

    if (state.editingMatchId) {
      data.matches = data.matches.map((item) => (item.id === state.editingMatchId ? match : item));
    } else {
      data.matches.unshift(match);
    }
    rememberMatchDefaults(match);
    saveData();
    if (!state.editingMatchId && submitter?.value === "continue") {
      state.modal = "match";
      state.editingMatchId = null;
      state.prefillMatchTournamentId = match.tournamentId;
      state.prefillMatchRoundStage = match.roundStage || (match.tournamentId ? suggestedTournamentStage(match.tournamentId) : "");
      state.prefillMatchRoundLabel = match.tournamentId ? suggestedRoundLabel(match.tournamentId, state.prefillMatchRoundStage || "swiss") : "";
      notifyToast("전적 저장 완료", "다음 경기를 바로 입력할 수 있습니다.", "success", 1800);
      render();
      return;
    }
    closeModal();
  }

  function validateMatchBeforeSave(match) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date)) {
      alert("날짜를 확인해 주세요.");
      return false;
    }
    if (!match.opponent && !confirm("상대 덱 이름이 비어 있으면 매치업 통계가 쌓이지 않습니다. 그래도 저장할까요?")) return false;
    const deck = getDeck(match.deckId);
    if (deck) {
      const cards = deckCards(deck);
      const readiness = deckReadiness(cards);
      if (readiness.level !== "ready") {
        const message = cards.length
          ? `${deck.name} 덱은 아직 제출 기준이 아닙니다.\n${readiness.detail}\n\n그래도 이 덱으로 전적을 저장할까요?`
          : `${deck.name} 덱에 카드가 없습니다.\n카드별 승률과 덱 이미지 품질이 제한될 수 있습니다.\n\n그래도 저장할까요?`;
        if (!confirm(message)) return false;
      }
    }
    const duplicate = duplicateTournamentRound(match);
    if (duplicate) {
      const round = roundText(match) || match.roundLabel || "같은 라운드";
      if (!confirm(`${tournamentName(match.tournamentId)}의 ${round} 기록이 이미 있습니다.\n중복 라운드로 저장할까요?`)) return false;
    }
    return true;
  }

  function duplicateTournamentRound(match) {
    if (!match.tournamentId || !match.roundLabel) return null;
    const targetStage = match.roundStage || "none";
    const targetLabel = String(match.roundLabel || "").trim().toLowerCase();
    return data.matches.find((item) => {
      if (item.id === match.id) return false;
      if (item.tournamentId !== match.tournamentId) return false;
      if ((item.roundStage || "none") !== targetStage) return false;
      return String(item.roundLabel || "").trim().toLowerCase() === targetLabel;
    });
  }

  function handleTournamentSubmit(form) {
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      alert("대회 이름을 입력해 주세요.");
      return;
    }
    const formatValue = String(formData.get("format") || "mixed");
    const cutValue = Number(formData.get("topCut"));
    const tournament = {
      id: state.editingTournamentId || uid("tournament"),
      name,
      date: String(formData.get("date") || todayISO()),
      format: TOURNAMENT_FORMAT_OPTIONS.some(([value]) => value === formatValue) ? formatValue : "mixed",
      topCut: TOURNAMENT_CUT_OPTIONS.some(([value]) => value === cutValue) ? cutValue : 4,
      location: String(formData.get("location") || "").trim(),
      memo: String(formData.get("memo") || "").trim(),
      createdAt: state.editingTournamentId
        ? data.tournaments.find((item) => item.id === state.editingTournamentId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (state.editingTournamentId) {
      data.tournaments = data.tournaments.map((item) => (item.id === state.editingTournamentId ? tournament : item));
    } else {
      data.tournaments.unshift(tournament);
    }
    saveData();
    closeModal();
  }

  function handleDeckSubmit(form) {
    cacheDeckDraftForm(form);
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const colors = formData.getAll("colors").map(String);
    if (!name) {
      alert("덱 이름을 입력해 주세요.");
      return;
    }
    const hasIncompleteCard = state.deckDraftCards.some((card) => {
      const type = cardTypeLabels[card.type] ? card.type : "digimon";
      const needsLevel = type === "digimon" || type === "digiEgg";
      return !normalizeCardNumber(card.cardNumber) || !String(card.name || "").trim() || (needsLevel && !normalizeLevel(card.level));
    });
    if (hasIncompleteCard) {
      alert("카드 필수 정보가 비어 있는 카드가 있습니다. 디지몬/디지타마는 Lv까지 입력해 주세요.");
      return;
    }
    const overLimit = cardNumberOverLimit(state.deckDraftCards);
    if (overLimit) {
      alert(`${overLimit} 카드는 최대 4장까지만 투입할 수 있습니다.`);
      return;
    }
    const limitMessage = deckLimitViolation(state.deckDraftCards);
    if (limitMessage) {
      alert(limitMessage);
      return;
    }
    const payload = {
      name,
      colors: colors.length ? colors : ["blue"],
      note: String(formData.get("note") || "").trim(),
      cards: normalizeCards(state.deckDraftCards),
      updatedAt: new Date().toISOString(),
    };
    if (state.editingDeckId) {
      data.decks = data.decks.map((deck) => (deck.id === state.editingDeckId ? { ...deck, ...payload } : deck));
    } else {
      data.decks.push({
        id: uid("deck"),
        ...payload,
        createdAt: new Date().toISOString(),
      });
    }
    saveData();
    closeModal();
  }

  function handleTypeSubmit(form) {
    const formData = new FormData(form);
    const typeName = normalizeMatchTypeName(formData.get("typeName") || "");
    if (!typeName) return;
    if (!data.matchTypes.includes(typeName)) data.matchTypes.push(typeName);
    saveData();
    render();
  }

  function deckExportText(deck) {
    const cards = deckCards(deck);
    const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
    const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
    const cardLine = (card) => `${card.count} ${card.cardNumber} ${card.name}`.trim();
    return [
      `덱 이름: ${deck.name || "이름 없는 덱"}`,
      "",
      "메인 덱",
      ...mainCards.map(cardLine),
      "",
      "디지타마",
      ...eggCards.map(cardLine),
    ].join("\n");
  }

  function deckExportCodeText(deck) {
    const cards = deckCards(deck);
    const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
    const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
    const entries = ["Exported from digimonmeta.com"];
    [...mainCards, ...eggCards].forEach((card) => {
      const cardNumber = String(card.cardNumber || "").trim().toUpperCase();
      if (!cardNumber) return;
      const count = Math.max(0, Math.floor(Number(card.count) || 0));
      for (let index = 0; index < count; index += 1) entries.push(cardNumber);
    });
    return JSON.stringify(entries);
  }

  async function copyDeckExportCode(deck) {
    const printableDeck = normalizeDeck(deck || {});
    if (!deckCards(printableDeck).length) {
      alert("내보낼 카드가 없습니다. 덱을 먼저 구성해 주세요.");
      return;
    }
    const code = deckExportCodeText(printableDeck);
    try {
      await navigator.clipboard.writeText(code);
      notifyToast("덱 코드 복사 완료", "다른 프로그램의 덱 가져오기에 붙여넣을 수 있습니다.", "success");
    } catch (error) {
      window.prompt("아래 덱 코드를 복사해 주세요.", code);
    }
  }

  function createDeckExportPayload(deck) {
    const printableDeck = normalizeDeck(deck || {});
    return {
      format: "jeonjeokmon-deck-v1",
      exportedAt: new Date().toISOString(),
      deck: {
        name: printableDeck.name,
        colors: printableDeck.colors,
        note: printableDeck.note,
        cards: deckCards(printableDeck).map((card) => ({
          cardNumber: card.cardNumber,
          level: card.level,
          name: card.name,
          type: card.type,
          count: card.count,
        })),
      },
      text: deckExportText(printableDeck),
    };
  }

  function downloadDeckExport(deck) {
    const printableDeck = normalizeDeck(deck || {});
    if (!deckCards(printableDeck).length) {
      alert("내보낼 카드가 없습니다. 덱을 먼저 구성해 주세요.");
      return;
    }
    const blob = new Blob([JSON.stringify(createDeckExportPayload(printableDeck), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(printableDeck.name)}_deck_${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function catalogCardByNumber(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    return CARD_CATALOG.find((card) => card.no === normalized);
  }

  async function handleDeckImportSubmit(form) {
    if (state.importingDecks) return;
    const formData = new FormData(form);
    const fallbackName = String(formData.get("name") || "").trim();
    const source = String(formData.get("deckImportText") || "").trim();
    const submitButton = document.querySelector('[form="deck-import-form"]');
    state.importingDecks = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "카드 정보 확인 중";
    }

    let importedDecks = [];
    try {
      const enrichedDecks = await enrichImportedDecks(parseDeckImportSource(source, fallbackName));
      importedDecks = enrichedDecks.map((deck) => normalizeImportedDeck(deck, fallbackName)).filter((deck) => deckCards(deck).length);
    } finally {
      state.importingDecks = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "가져오기";
      }
    }

    if (!importedDecks.length) {
      alert("가져올 덱을 찾지 못했습니다. 카드번호와 매수를 확인해 주세요.");
      return;
    }

    const invalidDeck = importedDecks.find((deck) => deckLimitViolation(deck.cards));
    if (invalidDeck) {
      alert(`${invalidDeck.name}: ${deckLimitViolation(invalidDeck.cards)}`);
      return;
    }

    data.decks.push(...importedDecks);
    saveData();
    closeModal();
  }

  function readDeckImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const modal = document.querySelector(".modal-panel");
      const textarea = modal?.querySelector('textarea[name="deckImportText"]');
      const nameInput = modal?.querySelector('input[name="name"]');
      if (textarea) textarea.value = String(reader.result || "");
      if (nameInput && !nameInput.value) nameInput.value = file.name.replace(/\.[^.]+$/, "");
    };
    reader.readAsText(file);
  }

  function downloadBackup() {
    const exportedAt = new Date().toISOString();
    data.settings = { ...(data.settings || {}), lastBackupAt: exportedAt };
    saveData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jeonjeokmon-backup-${todayISO()}-${data.decks.length}decks-${data.matches.length}matches.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notifyToast("백업 파일 저장", `${dataSummary()} · ${formatSyncTime(exportedAt)}`, "success");
    if (state.tab === "settings") render();
  }

  function restoreBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = JSON.parse(String(reader.result || ""));
        data = mergeData(restored);
        data.settings = { ...(data.settings || {}), lastRestoredAt: new Date().toISOString() };
        saveData();
        state.selected.clear();
        notifyToast("백업 파일 불러오기 완료", dataSummary(), "success");
        render();
      } catch (error) {
        alert("백업 파일을 읽을 수 없습니다.");
        notifyToast("백업 파일 불러오기 실패", "파일 형식을 확인해 주세요.", "danger", 7000);
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    const cloudNote = state.authUser ? "\n\n로그인 중이라 클라우드에도 빈 데이터가 저장됩니다." : "";
    if (!confirm(`모든 데이터를 삭제하고 처음 상태로 되돌릴까요?${cloudNote}`)) return;
    if (state.authUser && !confirm("정말 진행할까요? 다른 기기에서도 빈 데이터로 동기화됩니다.")) return;
    const snapshot = cloneDataSnapshot();
    saveRecoveryPoint(snapshot, "전체 삭제 전");
    data = createDefaultData();
    state.selected.clear();
    state.filters = { query: "", result: "all", deck: "all", type: "all" };
    state.memoOnly = false;
    state.cloudConflict = null;
    saveData();
    notifyToast("전체 삭제 완료", state.authUser ? "클라우드에도 반영합니다." : "이 기기 데이터를 비웠습니다.", "warning", 6000);
    notifyUndo("전체 삭제됨", snapshot, "삭제 전 데이터로 되돌릴 수 있습니다.");
    render();
  }

  async function refreshAppVersion() {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if (window.caches?.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("jeonjeokmon-shell-")).map((key) => caches.delete(key)));
      }
    } catch (error) {
      console.warn("App refresh cleanup failed", error);
    } finally {
      window.location.reload();
    }
  }

  async function installPwa() {
    if (state.pwaInstalled) {
      notifyToast("이미 설치됨", "전적몬이 앱 모드로 실행 중입니다.", "info");
      return;
    }
    if (!state.installPrompt) {
      alert("브라우저 메뉴에서 '홈 화면에 추가' 또는 '앱 설치'를 선택해 주세요.");
      return;
    }
    const promptEvent = state.installPrompt;
    state.installPrompt = null;
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === "accepted") {
      state.pwaInstalled = true;
      notifyToast("설치 완료", "홈 화면에서 전적몬을 열 수 있습니다.", "success");
    } else {
      notifyToast("설치 취소됨", "나중에 다시 설치할 수 있습니다.", "info");
    }
    render();
  }

  async function copyCardUpdateCommands() {
    const text = cardDataCommandsText();
    try {
      await navigator.clipboard.writeText(text);
      notifyToast("갱신 명령 복사 완료", "터미널에 붙여넣어 카드 데이터를 갱신할 수 있습니다.", "success");
    } catch (error) {
      window.prompt("아래 명령을 복사해 주세요.", text);
    }
  }

  async function copyDailyShareText() {
    const text = dailyShareText();
    if (!text) {
      notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notifyToast("전적 공유문 복사 완료", "X에 바로 붙여넣을 수 있습니다.", "success");
    } catch (error) {
      window.prompt("아래 전적 공유문을 복사해 주세요.", text);
    }
  }

  function downloadCardDataStatus() {
    const summary = cardDataSummary();
    const payload = {
      generatedAt: new Date().toISOString(),
      site: "전적몬",
      summary,
      versions: {
        app: document.querySelector('script[src^="app.js"]')?.getAttribute("src") || "",
        styles: document.querySelector('link[href^="styles.css"]')?.getAttribute("href") || "",
        catalog: document.querySelector('script[src^="card-catalog.js"]')?.getAttribute("src") || "",
        effects: document.querySelector('script[src^="korean-card-effects.js"]')?.getAttribute("src") || "",
        serviceWorker: `sw.js?v=${APP_VERSION}`,
      },
      updateCommands: cardDataCommandsText().split("\n"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jeonjeokmon-card-data-status-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notifyToast("카드 데이터 상태 저장", `${summary.catalogCount.toLocaleString("ko-KR")}장 카탈로그`, "success");
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
    if (event.key === "Enter" || event.key === " ") {
      const previewRow = event.target.closest('[role="button"][data-action="preview-catalog-card"]');
      if (previewRow) {
        event.preventDefault();
        openCardPreview(previewRow.dataset.cardNo);
        return;
      }
    }
    const deckCardSearch = event.target.closest("[data-deck-card-search]");
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
