(function () {
  const STORAGE_KEY = "digilog-ko-clone-v1";
  const RECOVERY_KEY = "jeonjeokmon-recovery-point-v1";
  const DIAGNOSTIC_KEY = "jeonjeokmon-diagnostics-v1";
  const CARD_EFFECT_CACHE_KEY = "digimon-card-effect-cache-v5";
  const APP_VERSION = "20260528-strip-bottom-pad";
  const root = document.getElementById("app");

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
  const DECK_RECIPE_MAIN_MIN_ROWS = 31;
  const DECK_RECIPE_EGG_MIN_ROWS = 3;
  const DECK_RECIPE_ROW_HEIGHT_MM = 6.4;
  const DECK_RECIPE_ROW_HEIGHT_TWIPS = 363;
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
  const ROUND_STAGE_OPTIONS = [
    ["none", "일반"],
    ["swiss", "스위스"],
    ["top", "토너먼트"],
  ];
  const CARD_CATALOG = Array.isArray(window.DIGIMON_CARD_CATALOG)
    ? window.DIGIMON_CARD_CATALOG.map((card, index) => normalizeCatalogCard(card, index)).filter((card) => card.no && card.name)
    : [];
  const REMOTE_CARD_API_URL = "https://digimoncard.io/api-public/search";
  const REMOTE_CARD_IMAGE_BASE_URL = "https://images.digimoncard.io/images/cards";
  const CARD_IMAGE_LOAD_TIMEOUT_MS = 7000;
  const KOREAN_CARD_PREVIEWS = {};
  const KOREAN_CARD_EFFECTS = window.KOREAN_CARD_EFFECTS && typeof window.KOREAN_CARD_EFFECTS === "object" ? window.KOREAN_CARD_EFFECTS : {};
  const SUPABASE_URL = "https://facrfwefgnklmsxcyagu.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GzIxydhbFEMQRbezGOjQ7A_rrsvgRsE";
  const CLOUD_TABLE = "jeonjeokmon_user_data";
  const HAS_CLOUD_CONFIG = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  const ADMIN_EMAILS = ["seibue63@gmail.com"];
  let cloudClient = createCloudClient();
  let supabaseLibraryPromise = null;

  const tabs = [
    ["home", "홈"],
    ["matches", "전적 기록"],
    ["tournaments", "대회 기록"],
    ["decks", "덱 관리"],
    ["stats", "통계"],
    ["settings", "설정"],
  ];

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
    deckDraftForm: null,
    deckDraftCards: [],
    deckCardSearch: "",
    deckCardType: "all",
    deckAdvancedOpen: false,
    deckBuilderView: "catalog",
    deckCardFilters: createDefaultDeckCardFilters(),
    matchupDeckId: "",
    matchupOpponent: "",
    shareDate: "",
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
  let cloudSaveTimer = null;
  const effectLoadingCards = new Set();

  function createDefaultData() {
    return {
      settings: {},
      matchTypes: ["테이머 배틀", "매장 대표전", "친선전", "테스트 플레이"],
      decks: [],
      tournaments: [],
      matches: [],
    };
  }

  function createCloudClient() {
    if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (supabaseLibraryPromise) return supabaseLibraryPromise;
    supabaseLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Supabase 라이브러리를 불러오지 못했습니다."));
      document.head.append(script);
      setTimeout(() => {
        if (!window.supabase?.createClient) reject(new Error("Supabase 라이브러리 연결 시간이 초과되었습니다."));
      }, 10000);
    });
    return supabaseLibraryPromise;
  }

  async function ensureCloudClient() {
    if (cloudClient) return cloudClient;
    if (!HAS_CLOUD_CONFIG) return null;
    await loadSupabaseLibrary();
    cloudClient = createCloudClient();
    return cloudClient;
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

  function saveCardEffectCache() {
    localStorage.setItem(CARD_EFFECT_CACHE_KEY, JSON.stringify(state.cardEffectCache));
  }

  function normalizeMatchTypeName(value) {
    const type = String(value || "").trim();
    return type === "스토어 대회" ? "매장 대표전" : type;
  }

  function normalizeMatchTypes(types) {
    const defaults = createDefaultData().matchTypes;
    const source = Array.isArray(types) && types.length ? types : defaults;
    const seen = new Set();
    const normalized = [];
    source.forEach((item) => {
      const type = normalizeMatchTypeName(item);
      if (!type || seen.has(type)) return;
      seen.add(type);
      normalized.push(type);
    });
    return normalized.length ? normalized : defaults;
  }

  function mergeData(saved) {
    const defaults = createDefaultData();
    const settings = saved.settings && typeof saved.settings === "object" && !Array.isArray(saved.settings) ? { ...saved.settings } : {};
    return {
      settings,
      matchTypes: normalizeMatchTypes(Array.isArray(saved.matchTypes) ? saved.matchTypes : defaults.matchTypes),
      decks: Array.isArray(saved.decks) ? saved.decks.map(normalizeDeck) : [],
      tournaments: Array.isArray(saved.tournaments) ? saved.tournaments.map(normalizeTournament) : [],
      matches: Array.isArray(saved.matches) ? saved.matches.map(normalizeMatch) : [],
    };
  }

  function normalizeTournament(tournament) {
    const fallbackDate = todayISO();
    const format = TOURNAMENT_FORMAT_OPTIONS.some(([value]) => value === tournament.format) ? tournament.format : "mixed";
    return {
      id: tournament.id || uid("tournament"),
      name: String(tournament.name || "").trim() || "이름 없는 대회",
      date: String(tournament.date || fallbackDate),
      format,
      location: String(tournament.location || "").trim(),
      memo: String(tournament.memo || "").trim(),
      createdAt: tournament.createdAt || new Date().toISOString(),
      updatedAt: tournament.updatedAt || tournament.createdAt || new Date().toISOString(),
    };
  }

  function normalizeDeck(deck) {
    return {
      id: deck.id || uid("deck"),
      name: deck.name || "이름 없는 덱",
      colors: Array.isArray(deck.colors) && deck.colors.length ? deck.colors : ["blue"],
      note: deck.note || "",
      cards: normalizeCards(deck.cards),
      createdAt: deck.createdAt || new Date().toISOString(),
      updatedAt: deck.updatedAt || deck.createdAt || new Date().toISOString(),
    };
  }

  function normalizeCards(cards) {
    if (!Array.isArray(cards)) return [];
    const merged = new Map();
    cards.forEach((card) => {
      const cardNumber = normalizeCardNumber(card.cardNumber || card.number || card.no || "");
      const name = String(card.name || "").trim();
      if (!cardNumber || !name) return;
      const normalized = {
        id: card.id || uid("card"),
        cardNumber,
        level: normalizeLevel(card.level || card.lv || ""),
        name,
        count: Math.max(1, Math.min(4, Number(card.count) || 1)),
        type: cardTypeLabels[card.type] ? card.type : "digimon",
      };
      const existing = merged.get(cardNumber);
      if (existing) {
        existing.count = Math.min(4, existing.count + normalized.count);
        existing.level = normalized.level || existing.level;
        existing.name = normalized.name || existing.name;
        existing.type = normalized.type || existing.type;
      } else {
        merged.set(cardNumber, normalized);
      }
    });
    return [...merged.values()];
  }

  function normalizeMatch(match) {
    const matchFormat = match.matchFormat === "match" ? "match" : "single";
    const fallbackResult = ["win", "loss", "draw"].includes(match.result) ? match.result : "win";
    const roundStage = ROUND_STAGE_OPTIONS.some(([value]) => value === match.roundStage) ? match.roundStage : "none";
    const gameStats =
      matchFormat === "match"
        ? normalizeGameStats(match.gameWins, match.gameLosses, match.gameDraws, fallbackResult)
        : singleGameStats(fallbackResult);
    return {
      ...match,
      matchType: normalizeMatchTypeName(match.matchType) || "대전",
      result: matchFormat === "match" ? resultFromGameStats(gameStats) : fallbackResult,
      matchFormat,
      gameWins: gameStats.gameWins,
      gameLosses: gameStats.gameLosses,
      gameDraws: gameStats.gameDraws,
      tournamentId: String(match.tournamentId || ""),
      roundStage,
      roundLabel: String(match.roundLabel || "").trim(),
      cardIds: Array.isArray(match.cardIds) ? match.cardIds.map(String) : [],
      cardNames: Array.isArray(match.cardNames) ? match.cardNames.map(String) : [],
      cardNumbers: Array.isArray(match.cardNumbers) ? match.cardNumbers.map(normalizeCardNumber) : [],
    };
  }

  function normalizeCardNumber(value) {
    return String(value || "")
      .replace(/[^a-z0-9-]/gi, "")
      .toUpperCase();
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

  function diagnosticEntries() {
    try {
      const entries = JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) || "[]");
      return Array.isArray(entries) ? entries.slice(0, 40) : [];
    } catch (error) {
      return [];
    }
  }

  function safeDiagnosticDetail(detail) {
    if (!detail || typeof detail !== "object") return {};
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch (error) {
      return { note: "detail serialization failed" };
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
      <button class="auth-button" type="button" data-action="sync-cloud-now">동기화</button>
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
      <div class="toast-stack" data-toast-stack>
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
                <button class="toast-close" type="button" title="닫기" data-action="dismiss-toast" data-id="${escapeHTML(toast.id)}">×</button>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderMobileQuickActions() {
    return `
      <div class="mobile-quick-actions" aria-label="빠른 실행">
        <button class="mobile-quick-button primary" type="button" data-action="open-match">기록</button>
        <button class="mobile-quick-button" type="button" data-action="open-deck">덱</button>
        <button class="mobile-quick-button" type="button" data-action="open-daily-share-panel">공유</button>
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

  function comparableData(source) {
    const merged = mergeData(source || createDefaultData());
    delete merged.settings.lastLocalSavedAt;
    return merged;
  }

  function sameData(left, right) {
    return JSON.stringify(comparableData(left)) === JSON.stringify(comparableData(right));
  }

  function setDataFromCloud(nextData) {
    state.suppressCloudSave = true;
    data = mergeData(nextData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state.localSaveError = "";
    } catch (error) {
      console.error(error);
      recordDiagnostic("cloud-local-write-failed", error?.message || "Cloud data local write failed", {
        key: STORAGE_KEY,
        dataBytes: safeJsonSize(data),
      });
      state.localSaveError = "이 기기 저장 실패";
      notifyToast("이 기기 저장 실패", "클라우드 데이터는 불러왔지만 브라우저 저장에는 실패했습니다.", "danger", 0);
    }
    state.localSavedAt = data.settings?.lastLocalSavedAt || state.cloudUpdatedAt || "";
    state.suppressCloudSave = false;
  }

  async function fetchCloudRow() {
    if (!cloudClient || !state.authUser) return null;
    const { data: row, error } = await cloudClient
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("user_id", state.authUser.id)
      .maybeSingle();
    if (error) throw error;
    return row || null;
  }

  function scheduleCloudSave() {
    if (!cloudClient || !state.authUser || !state.cloudReady || state.suppressCloudSave) return;
    clearTimeout(cloudSaveTimer);
    state.cloudError = "";
    state.cloudStatus = "저장 대기 중";
    updateAuthControls();
    cloudSaveTimer = setTimeout(() => {
      saveCloudData();
    }, 700);
  }

  async function saveCloudData(options = {}) {
    const { force = false, notify = false } = options;
    if (!cloudClient || !state.authUser || state.suppressCloudSave) return false;
    clearTimeout(cloudSaveTimer);
    state.cloudSaving = true;
    state.cloudError = "";
    state.cloudStatus = "클라우드 저장 중";
    updateAuthControls();
    try {
      if (!force && state.cloudUpdatedAt) {
        const row = await fetchCloudRow();
        const remoteTime = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
        const knownTime = state.cloudUpdatedAt ? new Date(state.cloudUpdatedAt).getTime() : 0;
        if (row?.data && remoteTime > knownTime + 500 && !sameData(row.data, data)) {
          state.cloudSaving = false;
          state.cloudConflict = { data: mergeData(row.data), updatedAt: row.updated_at };
          state.cloudStatus = "다른 기기 변경 감지";
          notifyToast("다른 기기 변경 감지", "클라우드 버전과 이 기기 버전 중 하나를 선택해 주세요.", "warning", 8000);
          render();
          return false;
        }
      }

      const updatedAt = new Date().toISOString();
      const payload = {
        user_id: state.authUser.id,
        data: mergeData(data),
        updated_at: updatedAt,
      };
      const { error } = await cloudClient.from(CLOUD_TABLE).upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      state.cloudUpdatedAt = updatedAt;
      state.cloudConflict = null;
      state.cloudStatus = "클라우드 저장 완료";
      if (notify) notifyToast("동기화 완료", `${dataSummary()} 저장됨`, "success");
      updateAuthControls();
      return true;
    } catch (error) {
      state.cloudSaving = false;
      state.cloudError = "클라우드 저장 실패";
      console.error(error);
      recordDiagnostic("cloud-save-failed", error?.message || "Cloud save failed", {
        code: error?.code || "",
        details: error?.details || "",
      });
      notifyToast("클라우드 저장 실패", "네트워크 또는 Supabase 설정을 확인해 주세요.", "danger", 0, {
        label: "다시 저장",
        action: "retry-cloud-save",
      });
      updateAuthControls();
      return false;
    } finally {
      state.cloudSaving = false;
      updateAuthControls();
    }
  }

  async function loadCloudDataForUser(user) {
    state.cloudLoading = true;
    state.cloudReady = false;
    state.cloudError = "";
    state.cloudStatus = "클라우드 데이터 확인 중";
    updateAuthControls();
    const { data: row, error } = await cloudClient
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    if (row?.data) {
      const cloudData = mergeData(row.data);
      setDataFromCloud(cloudData);
      state.cloudUpdatedAt = row.updated_at || "";
      state.cloudConflict = null;
      state.cloudStatus = "클라우드에서 불러옴";
      notifyToast("클라우드 데이터 불러옴", dataSummary(cloudData), "success");
    } else {
      state.cloudReady = true;
      state.cloudLoading = false;
      await saveCloudData({ force: true, notify: true });
      render();
      return;
    }

    state.cloudReady = true;
    state.cloudLoading = false;
    render();
  }

  async function applyAuthSession(session) {
    const nextUser = session?.user || null;
    if (!nextUser) {
      clearTimeout(cloudSaveTimer);
      state.authUser = null;
      state.authLoading = false;
      state.cloudReady = false;
      state.cloudLoading = false;
      state.cloudSaving = false;
      state.cloudStatus = "로그인하면 클라우드 데이터 불러오기";
      state.cloudError = "";
      state.cloudConflict = null;
      updateAuthControls();
      return;
    }
    if (state.authUser?.id === nextUser.id && state.cloudReady) {
      state.authUser = nextUser;
      updateAuthControls();
      return;
    }
    state.authUser = nextUser;
    state.authLoading = false;
    try {
      await loadCloudDataForUser(nextUser);
    } catch (error) {
      state.cloudLoading = false;
      state.cloudReady = false;
      state.cloudError = "클라우드 불러오기 실패";
      console.error(error);
      recordDiagnostic("cloud-load-failed", error?.message || "Cloud load failed", {
        userId: nextUser.id,
        code: error?.code || "",
      });
      updateAuthControls();
    }
  }

  async function initializeCloudAuth() {
    try {
      await ensureCloudClient();
    } catch (error) {
      state.authLoading = false;
      state.cloudError = "DB 연결 실패";
      console.error(error);
      recordDiagnostic("cloud-init-failed", error?.message || "Cloud init failed");
      updateAuthControls();
      return;
    }
    if (!cloudClient) {
      state.authLoading = false;
      updateAuthControls();
      return;
    }
    try {
      const { data: sessionData, error } = await cloudClient.auth.getSession();
      if (error) throw error;
      await applyAuthSession(sessionData.session);
      if (window.location.hash.includes("access_token")) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
    } catch (error) {
      state.authLoading = false;
      state.cloudError = "로그인 확인 실패";
      console.error(error);
      updateAuthControls();
    }
    cloudClient.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      applyAuthSession(session);
    });
  }

  async function loginWithGoogle() {
    try {
      await ensureCloudClient();
    } catch (error) {
      state.cloudError = "DB 연결 실패";
      console.error(error);
      updateAuthControls();
    }
    if (!cloudClient) {
      alert("Supabase 연결 설정을 확인해 주세요.");
      return;
    }
    state.cloudStatus = "Google 로그인으로 이동 중";
    updateAuthControls();
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await cloudClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      state.cloudError = "Google 로그인 시작 실패";
      console.error(error);
      updateAuthControls();
      alert("Google 로그인을 시작하지 못했습니다. Supabase 설정을 확인해 주세요.");
    }
  }

  async function logoutGoogle() {
    if (!cloudClient) return;
    const saved = await saveCloudData();
    if (state.cloudConflict) {
      alert("다른 기기의 변경이 감지되어 로그아웃 전에 동기화 선택이 필요합니다.");
      return;
    }
    if (!saved && state.cloudError) return;
    const { error } = await cloudClient.auth.signOut();
    if (error) {
      alert("로그아웃에 실패했습니다.");
      console.error(error);
      return;
    }
    await applyAuthSession(null);
    notifyToast("로그아웃 완료", "이 기기에는 로컬 데이터가 남아 있습니다.", "info");
  }

  async function loadCloudNow() {
    if (!cloudClient || !state.authUser) {
      loginWithGoogle();
      return;
    }
    state.cloudLoading = true;
    state.cloudError = "";
    state.cloudStatus = "클라우드 데이터 불러오는 중";
    updateAuthControls();
    try {
      const row = await fetchCloudRow();
      if (!row?.data) {
        state.cloudLoading = false;
        await saveCloudData({ force: true, notify: true });
        return;
      }
      setDataFromCloud(row.data);
      state.cloudUpdatedAt = row.updated_at || "";
      state.cloudConflict = null;
      state.cloudStatus = "클라우드에서 다시 불러옴";
      state.cloudLoading = false;
      notifyToast("클라우드 데이터 적용", dataSummary(row.data), "success");
      render();
    } catch (error) {
      state.cloudLoading = false;
      state.cloudError = "클라우드 불러오기 실패";
      console.error(error);
      notifyToast("클라우드 불러오기 실패", "잠시 후 다시 시도해 주세요.", "danger", 7000);
      updateAuthControls();
    }
  }

  async function applyCloudConflictVersion() {
    if (!state.cloudConflict) return;
    setDataFromCloud(state.cloudConflict.data);
    state.cloudUpdatedAt = state.cloudConflict.updatedAt || "";
    state.cloudConflict = null;
    state.cloudStatus = "클라우드 버전 적용";
    notifyToast("클라우드 버전 적용", dataSummary(), "success");
    render();
  }

  async function keepLocalConflictVersion() {
    if (!state.cloudConflict) return;
    state.cloudConflict = null;
    await saveCloudData({ force: true, notify: true });
    render();
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char];
    });
  }

  function todayISO() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "날짜 없음";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(date);
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

  function suggestedRoundLabel(tournamentId, stage = "swiss") {
    const matches = tournamentMatches(tournamentId).filter((match) => (match.roundStage || "none") === stage);
    if (stage === "top") {
      const labels = ["4강", "결승"];
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
    const extensions = ["webp", "jpg", "png"];
    return cardImageNumberVariants(cardNumber)
      .flatMap((variant) => extensions.map((extension) => `${REMOTE_CARD_IMAGE_BASE_URL}/${encodeURIComponent(variant)}.${extension}`))
      .filter((src, index, sources) => sources.indexOf(src) === index);
  }

  function catalogImageSource(card) {
    return card.img || remoteCardImageUrl(card.no);
  }

  function deckCardImageSource(card) {
    const catalogCard = catalogCardByNumber(card.cardNumber);
    return catalogCard?.img || remoteCardImageUrl(card.cardNumber);
  }

  function proxiedShareImageUrl(src) {
    if (!src) return "";
    try {
      const url = new URL(src, window.location.href);
      if (url.origin === window.location.origin) return url.toString();
      if (url.hostname === "images.digimoncard.io") {
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
    return [catalogCard?.img || "", ...remoteCardImageUrls(normalized)]
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

  function normalizeEffectText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function autoTranslateEffectText(text) {
    let output = normalizeEffectText(text);
    const replacements = [
      [/\[Your Turn\]/g, "[자신의 턴]"],
      [/\[Opponent's Turn\]/g, "[상대의 턴]"],
      [/\[All Turns\]/g, "[서로의 턴]"],
      [/\[When Attacking\]/g, "[어택 시]"],
      [/\[On Play\]/g, "[등장 시]"],
      [/\[When Digivolving\]/g, "[진화 시]"],
      [/\[On Deletion\]/g, "[소멸 시]"],
      [/\[Start of Your Main Phase\]/g, "[자신의 메인 페이즈 개시 시]"],
      [/\[End of Your Turn\]/g, "[자신의 턴 종료 시]"],
      [/\[Start of Your Turn\]/g, "[자신의 턴 개시 시]"],
      [/\[End of Opponent's Turn\]/g, "[상대의 턴 종료 시]"],
      [/\[Security\]/g, "[시큐리티]"],
      [/\[Main\]/g, "[메인]"],
      [/\[Breeding\]/g, "[육성]"],
      [/\[Once Per Turn\]/g, "[턴에 1회]"],
      [/Inherited Effect/gi, "진화원 효과"],
      [/Security Effect/gi, "시큐리티 효과"],
      [/Main Effect/gi, "메인 효과"],
      [/<Draw ([0-9]+)>/gi, "<$1 드로우>"],
      [/Draw ([0-9]+) cards? from your deck\./gi, "덱에서 $1장 드로우한다."],
      [/one of your opponent's Digimon/gi, "상대 디지몬 1마리"],
      [/1 of your opponent's Digimon/gi, "상대 디지몬 1마리"],
      [/your opponent's Digimon/gi, "상대 디지몬"],
      [/your Digimon/gi, "자신의 디지몬"],
      [/this Digimon/gi, "이 디지몬"],
      [/this card/gi, "이 카드"],
      [/your hand/gi, "자신의 패"],
      [/your trash/gi, "자신의 트래시"],
      [/your deck/gi, "자신의 덱"],
      [/security stack/gi, "시큐리티"],
      [/battle area/gi, "배틀 에리어"],
      [/digivolution cards/gi, "진화원 카드"],
      [/digivolution card/gi, "진화원 카드"],
      [/\bor more\b/gi, "이상"],
      [/\bor less\b/gi, "이하"],
      [/\bWhile\b/gi, "동안"],
      [/\bhas\b/gi, "가지고 있으면"],
      [/\bit\b/gi, "이 카드는"],
      [/\bmay\b/gi, "할 수 있다"],
      [/\bdeleted\b/gi, "소멸"],
      [/\bdeletes\b/gi, "소멸"],
      [/\bdelete\b/gi, "소멸"],
      [/\bsuspended\b/gi, "레스트 상태"],
      [/\bsuspends\b/gi, "레스트"],
      [/\bsuspend\b/gi, "레스트"],
      [/\bunsuspend\b/gi, "액티브"],
      [/\bplays\b/gi, "등장"],
      [/\bplay\b/gi, "등장"],
      [/\bdigivolving\b/gi, "진화"],
      [/\bdigivolves\b/gi, "진화"],
      [/\bdigivolve\b/gi, "진화"],
      [/return/gi, "되돌린다"],
      [/trash/gi, "파기"],
      [/reveal/gi, "공개"],
      [/add/gi, "패에 추가"],
      [/gain/gi, "얻는다"],
      [/gets/gi, "얻는다"],
      [/DP or less/gi, "DP 이하"],
      [/DP or more/gi, "DP 이상"],
      [/until the end of your opponent's turn/gi, "상대의 턴 종료 시까지"],
      [/until the end of your turn/gi, "자신의 턴 종료 시까지"],
      [/for the turn/gi, "그 턴 동안"],
    ];
    replacements.forEach(([pattern, replacement]) => {
      output = output.replace(pattern, replacement);
    });
    output = output.replace(
      /진화원 효과\s+\[자신의 턴\]\s+동안 이 디지몬 가지고 있으면 ([0-9]+) 이상 진화원 카드, 이 카드는 얻는다 ([+-]?[0-9]+) DP\./gi,
      "진화원 효과 [자신의 턴] 이 디지몬의 진화원이 $1장 이상이면, 이 디지몬은 $2 DP를 얻는다."
    );
    output = output.replace(
      /\[자신의 턴\]\s+동안 이 디지몬 가지고 있으면 ([0-9]+) 이상 진화원 카드, 이 카드는 얻는다 ([+-]?[0-9]+) DP\./gi,
      "[자신의 턴] 이 디지몬의 진화원이 $1장 이상이면, 이 디지몬은 $2 DP를 얻는다."
    );
    return output;
  }

  function normalizeRemoteEffect(card) {
    if (!card) return null;
    const cardNumber = normalizeCardNumber(card.id || card.cardnumber || card.cardNumber || card.card_number || "");
    if (!cardNumber) return null;
    let mainEffect = normalizeEffectText(card.main_effect || card.mainEffect || "");
    let sourceEffect = normalizeEffectText(card.source_effect || card.inherited_effect || card.inheritedEffect || "");
    let securityEffect = normalizeEffectText(card.security_effect || card.securityEffect || "");
    const altEffect = normalizeEffectText(card.alt_effect || card.altEffect || "");
    if (/^Inherited Effect/i.test(mainEffect) && !sourceEffect) {
      sourceEffect = mainEffect.replace(/^Inherited Effect\s*/i, "");
      mainEffect = "";
    }
    if (/^Security Effect/i.test(mainEffect) && !securityEffect) {
      securityEffect = mainEffect.replace(/^Security Effect\s*/i, "");
      mainEffect = "";
    }
    mainEffect = mainEffect.replace(/^Main Effect\s*/i, "");
    sourceEffect = sourceEffect.replace(/^Inherited Effect\s*/i, "");
    securityEffect = securityEffect.replace(/^Security Effect\s*/i, "");
    return {
      cardNumber,
      fetchedAt: new Date().toISOString(),
      mainEffect,
      sourceEffect,
      securityEffect,
      altEffect,
      hasEffect: Boolean(mainEffect || sourceEffect || securityEffect || altEffect),
    };
  }

  async function fetchCardEffect(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return null;
    const params = new URLSearchParams({
      card: normalized,
      series: "Digimon Card Game",
      limit: "4",
    });
    const response = await fetch(`${REMOTE_CARD_API_URL}?${params.toString()}`);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload)) return null;
    const exact = payload.find((card) => normalizeCardNumber(card.id || card.cardNumber || card.card_number || "") === normalized) || payload[0];
    return normalizeRemoteEffect(exact);
  }

  function staticKoreanOfficialEffect(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    const effect = KOREAN_CARD_EFFECTS[normalized];
    if (!effect) return null;
    return {
      cardNumber: normalized,
      name: effect.name || "",
      source: "kr",
      sourceUrl: effect.sourceUrl || "",
      fetchedAt: effect.fetchedAt || "",
      mainEffect: effect.mainEffect || "",
      sourceEffect: effect.sourceEffect || "",
      securityEffect: effect.securityEffect || "",
      altEffect: effect.altEffect || "",
      hasEffect: Boolean(effect.mainEffect || effect.sourceEffect || effect.securityEffect || effect.altEffect),
      staticCache: true,
    };
  }

  async function fetchKoreanOfficialEffect(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    if (!normalized) return null;
    const staticEffect = staticKoreanOfficialEffect(normalized);
    if (staticEffect) return staticEffect;
    const response = await fetch(`/api/korean-card?card=${encodeURIComponent(normalized)}`);
    if (response.status === 404) {
      try {
        const payload = await response.json();
        if (payload?.found === false) return null;
      } catch (error) {
        // A Vercel NOT_FOUND page means the API function was not deployed, not that the card has no effect.
      }
      throw new Error("Korean card lookup endpoint was not found");
    }
    if (!response.ok) throw new Error(`Korean card lookup failed: ${response.status}`);
    const payload = await response.json();
    return payload?.found ? payload : null;
  }

  async function fetchAndCacheCardEffect(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    const staticEffect = staticKoreanOfficialEffect(normalized);
    if (staticEffect) {
      state.cardEffectCache[normalized] = staticEffect;
      saveCardEffectCache();
      if (state.previewCardNo === normalized) {
        if (state.modal === "deck") renderKeepingDeckScroll();
        else render();
      }
      return;
    }
    const cached = state.cardEffectCache[normalized];
    if (!normalized || (cached && !cached.error) || effectLoadingCards.has(normalized)) return;
    effectLoadingCards.add(normalized);
    if (state.previewCardNo === normalized) {
      if (state.modal === "deck") renderKeepingDeckScroll();
      else render();
    }
    try {
      state.cardEffectCache[normalized] = (await fetchKoreanOfficialEffect(normalized)) || {
        cardNumber: normalized,
        fetchedAt: new Date().toISOString(),
        hasEffect: false,
      };
      saveCardEffectCache();
    } catch (error) {
      delete state.cardEffectCache[normalized];
      saveCardEffectCache();
      console.warn("Card effect fetch failed", error);
    } finally {
      effectLoadingCards.delete(normalized);
      if (state.previewCardNo === normalized) {
        if (state.modal === "deck") renderKeepingDeckScroll();
        else render();
      }
    }
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

  function catalogCardToDraft(card, count = 1) {
    return {
      id: uid("card"),
      cardNumber: card.no,
      level: card.level,
      name: card.name,
      count,
      type: card.type,
    };
  }

  function catalogSearchText(card) {
    return `${card.no} ${card.no.replace(/-/g, "")} ${card.name} ${cardTypeLabel(card.type)} ${colorLabel(card.color)} ${colorLabel(card.color2)} ${card.rarity}`.toLowerCase();
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
      const searchText = catalogSearchText(card);
      return searchText.includes(query) || normalizeCatalogQuery(searchText).includes(compactQuery);
    }).sort(compareCatalogCards);
  }

  function filteredCatalogCards() {
    return filteredCatalogCardPool().slice(0, CARD_BROWSER_LIMIT);
  }

  function deckLevelCounts(cards) {
    const counts = { "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, T: 0, O: 0 };
    normalizeCards(cards).forEach((card) => {
      if (card.type === "tamer") counts.T += Number(card.count) || 0;
      else if (card.type === "option") counts.O += Number(card.count) || 0;
      else if (counts[card.level] !== undefined) counts[card.level] += Number(card.count) || 0;
    });
    return counts;
  }

  function cardNumberOverLimit(cards) {
    const totals = new Map();
    for (const card of cards) {
      const cardNumber = normalizeCardNumber(card.cardNumber);
      if (!cardNumber) continue;
      totals.set(cardNumber, (totals.get(cardNumber) || 0) + (Number(card.count) || 0));
      if (totals.get(cardNumber) > 4) return cardNumber;
    }
    return "";
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

  function resultLabel(result) {
    return {
      win: "승리",
      loss: "패배",
      draw: "무승부",
    }[result] || "기록";
  }

  function resultShortLabel(result) {
    return {
      win: "승",
      loss: "패",
      draw: "무",
    }[result] || "기록";
  }

  function resultFromGameStats(stats) {
    if ((Number(stats.gameWins) || 0) > (Number(stats.gameLosses) || 0)) return "win";
    if ((Number(stats.gameWins) || 0) < (Number(stats.gameLosses) || 0)) return "loss";
    return "draw";
  }

  function singleGameStats(result) {
    return {
      gameWins: result === "win" ? 1 : 0,
      gameLosses: result === "loss" ? 1 : 0,
      gameDraws: result === "draw" ? 1 : 0,
    };
  }

  function normalizeGameStats(wins, losses, draws, fallbackResult = "win") {
    const gameWins = Math.max(0, Math.min(9, Number(wins) || 0));
    const gameLosses = Math.max(0, Math.min(9, Number(losses) || 0));
    const gameDraws = Math.max(0, Math.min(9, Number(draws) || 0));
    if (gameWins + gameLosses + gameDraws) return { gameWins, gameLosses, gameDraws };
    return singleGameStats(fallbackResult);
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

  function emptyRecordStats() {
    return { total: 0, wins: 0, losses: 0, draws: 0, gameTotal: 0, gameWins: 0, gameLosses: 0, gameDraws: 0 };
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

  function finalizeRecordStats(stats) {
    return {
      ...stats,
      rate: stats.total ? Math.round((stats.wins / stats.total) * 100) : 0,
      gameRate: stats.gameTotal ? Math.round((stats.gameWins / stats.gameTotal) * 100) : 0,
    };
  }

  function playOrderLabel(order) {
    return {
      first: "선공",
      second: "후공",
      unknown: "선후공 미상",
    }[order] || "선후공 미상";
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

  function availableCopiesForCard(cards, card, excludeId = "") {
    const summary = deckCountSummary(cards, excludeId);
    const sameNumberCopies = normalizeCards(cards)
      .filter((item) => item.id !== excludeId && normalizeCardNumber(item.cardNumber) === normalizeCardNumber(card.cardNumber))
      .reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    const sameNumberAvailable = Math.max(0, 4 - sameNumberCopies);
    const totalAvailable = Math.max(0, DECK_LIMITS.total - summary.total);
    const zoneAvailable =
      card.type === "digiEgg"
        ? Math.max(0, DECK_LIMITS.digiEgg - summary.digiEgg)
        : Math.max(0, DECK_LIMITS.main - summary.main);
    return Math.min(sameNumberAvailable, totalAvailable, zoneAvailable);
  }

  function addDraftCard(card, requestedCount = 1) {
    const cardNumber = normalizeCardNumber(card.cardNumber);
    const level = normalizeLevel(card.level);
    const name = String(card.name || "").trim();
    const type = cardTypeLabels[card.type] ? card.type : "digimon";
    const count = Math.max(1, Math.min(4, Number(requestedCount) || 1));
    const needsLevel = type === "digimon" || type === "digiEgg";
    if (!cardNumber || !name || (needsLevel && !level)) {
      alert(needsLevel ? "카드 넘버, Lv, 카드 이름을 모두 입력해 주세요." : "카드 넘버와 카드 이름을 입력해 주세요.");
      return false;
    }

    const existing = state.deckDraftCards.find((item) => normalizeCardNumber(item.cardNumber) === cardNumber);
    if (existing) {
      const maxTotalForExisting = availableCopiesForCard(state.deckDraftCards, { ...existing, type }, existing.id);
      const available = Math.max(0, maxTotalForExisting - (Number(existing.count) || 0));
      if (available <= 0) {
        alert("덱 제한에 걸려 더 추가할 수 없습니다. 같은 카드 넘버 4장, 일반 덱 50장, 디지타마 5장 제한을 확인해 주세요.");
        return false;
      }
      if (count > available) alert(`덱 제한 때문에 ${available}장만 추가됩니다.`);
      existing.count += Math.min(count, available);
      existing.level = level;
      existing.name = name;
      existing.type = type;
      return true;
    }

    const nextCard = { id: uid("card"), cardNumber, level, name, count, type };
    const available = availableCopiesForCard(state.deckDraftCards, nextCard);
    if (available <= 0) {
      alert(type === "digiEgg" ? "디지타마는 최대 5장까지 구성할 수 있습니다." : "일반 덱은 최대 50장까지 구성할 수 있습니다.");
      return false;
    }
    if (count > available) alert(`덱 제한 때문에 ${available}장만 추가됩니다.`);
    nextCard.count = Math.min(count, available);
    state.deckDraftCards.push(nextCard);
    return true;
  }

  function changeDraftCardCount(cardId, delta) {
    const card = state.deckDraftCards.find((item) => item.id === cardId);
    if (!card) return false;
    const current = Number(card.count) || 1;
    if (delta < 0 && current <= 1) {
      state.deckDraftCards = state.deckDraftCards.filter((item) => item.id !== cardId);
      return true;
    }
    const maxAllowed = availableCopiesForCard(state.deckDraftCards, card, card.id);
    card.count = Math.max(1, Math.min(maxAllowed, current + delta));
    return true;
  }

  function deckLimitViolation(cards) {
    const summary = deckCountSummary(cards);
    if (summary.total > DECK_LIMITS.total) return `덱은 최대 ${DECK_LIMITS.total}장까지 구성할 수 있습니다.`;
    if (summary.main > DECK_LIMITS.main) return `일반 덱은 최대 ${DECK_LIMITS.main}장까지 구성할 수 있습니다.`;
    if (summary.digiEgg > DECK_LIMITS.digiEgg) return `디지타마는 최대 ${DECK_LIMITS.digiEgg}장까지 구성할 수 있습니다.`;
    return "";
  }

  function deckReadiness(cards) {
    const normalizedCards = normalizeCards(cards);
    const summary = deckCountSummary(normalizedCards);
    const overLimit = cardNumberOverLimit(normalizedCards);
    const limitMessage = deckLimitViolation(normalizedCards);
    if (!summary.total) return { level: "empty", label: "카드 없음", detail: "덱 구축을 시작해 주세요." };
    if (overLimit) return { level: "danger", label: "제한 초과", detail: `${overLimit} 카드는 최대 4장까지만 투입할 수 있습니다.` };
    if (limitMessage) return { level: "danger", label: "제한 초과", detail: limitMessage };
    if (summary.main === DECK_LIMITS.main && summary.digiEgg >= DECK_LIMITS.digiEggReadyMin && summary.digiEgg <= DECK_LIMITS.digiEgg) {
      return {
        level: "ready",
        label: "제출 준비 완료",
        detail: `메인 덱 50장과 디지타마 ${summary.digiEgg}장으로 구축 기준을 충족했습니다.`,
      };
    }
    const missing = [];
    if (summary.main < DECK_LIMITS.main) missing.push(`메인 ${DECK_LIMITS.main - summary.main}장 부족`);
    if (summary.digiEgg < DECK_LIMITS.digiEggReadyMin) missing.push(`디지타마 ${DECK_LIMITS.digiEggReadyMin - summary.digiEgg}장 부족`);
    return { level: "warn", label: "구축 중", detail: missing.join(" · ") };
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

  function uniqueDeckName(name) {
    const base = `${name || "이름 없는 덱"} 복사본`;
    const existing = new Set(data.decks.map((deck) => deck.name));
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  }

  function cloneDeck(deck) {
    return {
      id: uid("deck"),
      name: uniqueDeckName(deck.name),
      colors: Array.isArray(deck.colors) && deck.colors.length ? [...deck.colors] : ["blue"],
      note: deck.note || "",
      cards: deckCards(deck).map((card) => ({ ...card, id: uid("card") })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function recipeCardRows(cards, minRows) {
    const rows = [...cards];
    while (rows.length < minRows) rows.push(null);
    return rows
      .map((card) => {
        if (!card) {
          return `
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `;
        }
        return `
          <tr>
            <td>${escapeHTML(card.cardNumber)}</td>
            <td>${escapeHTML(card.level || "")}</td>
            <td class="recipe-card-name">${escapeHTML(card.name)}</td>
            <td>${escapeHTML(cardTypeLabel(card.type))}</td>
            <td>${escapeHTML(card.count)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderRecipeTable(title, cards, minRows, typeHint) {
    return `
      <table class="recipe-card-table">
        <thead>
          <tr class="recipe-section-row">
            <th colspan="5">${escapeHTML(title)}</th>
          </tr>
          <tr>
            <th>카드 넘버</th>
            <th>Lv</th>
            <th>카드 이름</th>
            <th>카드의 종류${typeHint ? `<br />${escapeHTML(typeHint)}` : ""}</th>
            <th>매수</th>
          </tr>
        </thead>
        <tbody>${recipeCardRows(cards, minRows)}</tbody>
      </table>
    `;
  }

  function renderDeckRecipe(deck) {
    const cards = deckCards(deck);
    const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
    const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
    const summary = deckCountSummary(cards);
    return `
      <div class="recipe-page" style="--recipe-row-height: ${DECK_RECIPE_ROW_HEIGHT_MM}mm;">
        <table class="recipe-info-table">
          <tbody>
            <tr>
              <th>Name</th>
              <td></td>
            </tr>
            <tr>
              <th>Date.</th>
              <td>${escapeHTML(todayISO())}</td>
            </tr>
          </tbody>
        </table>
        <div class="recipe-summary">
          메인 덱 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg} · 총 ${summary.total}/${DECK_LIMITS.total}
        </div>
        ${renderRecipeTable("메인 덱", mainCards, DECK_RECIPE_MAIN_MIN_ROWS, "(디지몬, 테이머, 옵션)")}
        ${renderRecipeTable("디지타마 덱", eggCards, DECK_RECIPE_EGG_MIN_ROWS, "(디지타마)")}
      </div>
    `;
  }

  function printDeckRecipe(deck) {
    const printableDeck = normalizeDeck(deck || {});
    if (!deckCards(printableDeck).length) {
      alert("인쇄할 카드가 없습니다. 덱을 먼저 구성해 주세요.");
      return;
    }
    const limitMessage = deckLimitViolation(printableDeck.cards);
    if (limitMessage && !confirm(`${limitMessage}\n그래도 인쇄할까요?`)) return;
    let printRoot = document.getElementById("print-root");
    if (!printRoot) {
      printRoot = document.createElement("section");
      printRoot.id = "print-root";
      printRoot.className = "print-root";
      document.body.appendChild(printRoot);
    }
    printRoot.innerHTML = renderDeckRecipe(printableDeck);
    window.requestAnimationFrame(() => window.print());
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

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function readUint16(view, offset) {
    return view.getUint16(offset, true);
  }

  function readUint32(view, offset) {
    return view.getUint32(offset, true);
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value, true);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function parseZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocdOffset = -1;
    for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
      if (readUint32(view, offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("DOCX 템플릿 구조를 읽을 수 없습니다.");

    const totalEntries = readUint16(view, eocdOffset + 10);
    let centralOffset = readUint32(view, eocdOffset + 16);
    const decoder = new TextDecoder();
    const entries = [];

    for (let index = 0; index < totalEntries; index += 1) {
      if (readUint32(view, centralOffset) !== 0x02014b50) throw new Error("DOCX 중앙 디렉터리를 읽을 수 없습니다.");
      const versionMade = readUint16(view, centralOffset + 4);
      const versionNeeded = readUint16(view, centralOffset + 6);
      const flags = readUint16(view, centralOffset + 8) & ~0x08;
      const method = readUint16(view, centralOffset + 10);
      const modTime = readUint16(view, centralOffset + 12);
      const modDate = readUint16(view, centralOffset + 14);
      const crc = readUint32(view, centralOffset + 16);
      const compressedSize = readUint32(view, centralOffset + 20);
      const uncompressedSize = readUint32(view, centralOffset + 24);
      const nameLength = readUint16(view, centralOffset + 28);
      const extraLength = readUint16(view, centralOffset + 30);
      const commentLength = readUint16(view, centralOffset + 32);
      const internalAttrs = readUint16(view, centralOffset + 36);
      const externalAttrs = readUint32(view, centralOffset + 38);
      const localHeaderOffset = readUint32(view, centralOffset + 42);
      const nameBytes = bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength);
      const name = decoder.decode(nameBytes);

      if (readUint32(view, localHeaderOffset) !== 0x04034b50) throw new Error("DOCX 로컬 헤더를 읽을 수 없습니다.");
      const localNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

      entries.push({
        name,
        versionMade,
        versionNeeded,
        flags,
        method,
        modTime,
        modDate,
        crc,
        compressedSize,
        uncompressedSize,
        internalAttrs,
        externalAttrs,
        rawData: bytes.slice(dataOffset, dataOffset + compressedSize),
      });
      centralOffset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function buildZip(entries) {
    const encoder = new TextEncoder();
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, entry.versionNeeded || 20);
      writeUint16(localView, 6, entry.flags || 0);
      writeUint16(localView, 8, entry.method);
      writeUint16(localView, 10, entry.modTime || 0);
      writeUint16(localView, 12, entry.modDate || 0);
      writeUint32(localView, 14, entry.crc);
      writeUint32(localView, 18, entry.compressedSize);
      writeUint32(localView, 22, entry.uncompressedSize);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      local.set(nameBytes, 30);
      fileParts.push(local, entry.rawData);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, entry.versionMade || 20);
      writeUint16(centralView, 6, entry.versionNeeded || 20);
      writeUint16(centralView, 8, entry.flags || 0);
      writeUint16(centralView, 10, entry.method);
      writeUint16(centralView, 12, entry.modTime || 0);
      writeUint16(centralView, 14, entry.modDate || 0);
      writeUint32(centralView, 16, entry.crc);
      writeUint32(centralView, 20, entry.compressedSize);
      writeUint32(centralView, 24, entry.uncompressedSize);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, entry.internalAttrs || 0);
      writeUint32(centralView, 38, entry.externalAttrs || 0);
      writeUint32(centralView, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + entry.rawData.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    writeUint32(eocdView, 0, 0x06054b50);
    writeUint16(eocdView, 8, entries.length);
    writeUint16(eocdView, 10, entries.length);
    writeUint32(eocdView, 12, centralSize);
    writeUint32(eocdView, 16, centralOffset);
    return new Blob([...fileParts, ...centralParts, eocd], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function wordChildElements(node, localName) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return Array.from(node.childNodes).filter((child) => child.nodeType === 1 && child.localName === localName && child.namespaceURI === W_NS);
  }

  function wordDescendantElements(node, localName) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    return Array.from(node.getElementsByTagNameNS(W_NS, localName));
  }

  function descendantElements(node, localName) {
    return Array.from(node.getElementsByTagName("*")).filter((child) => child.localName === localName);
  }

  function closestElement(node, localName) {
    let current = node;
    while (current && current.nodeType === 1) {
      if (current.localName === localName) return current;
      current = current.parentNode;
    }
    return null;
  }

  function removeNode(node) {
    if (node?.parentNode) node.parentNode.removeChild(node);
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function removeDocxRecipeDecorations(doc) {
    descendantElements(doc, "AlternateContent").forEach((content) => {
      if (!compactText(content.textContent).includes("덱레시피제출양식")) return;
      removeNode(closestElement(content, "p") || content);
    });

    descendantElements(doc, "wsp").forEach((shape) => {
      if (descendantElements(shape, "txbx").length) return;
      removeNode(shape);
    });

    descendantElements(doc, "Fallback").forEach(removeNode);
    descendantElements(doc, "pict").forEach(removeNode);
  }

  function ensureWordChild(parent, localName, insertFirst = false) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    let child = wordChildElements(parent, localName)[0];
    if (!child) {
      child = parent.ownerDocument.createElementNS(W_NS, `w:${localName}`);
      if (insertFirst && parent.firstChild) parent.insertBefore(child, parent.firstChild);
      else parent.appendChild(child);
    }
    return child;
  }

  function removeWordChildren(parent, localName) {
    wordChildElements(parent, localName).forEach((child) => child.remove());
  }

  function setWordAttribute(node, name, value) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    node.setAttributeNS(W_NS, `w:${name}`, String(value));
  }

  function setDocxPageSetup(doc) {
    const body = wordChildElements(doc.documentElement, "body")[0];
    const sectionProps = wordDescendantElements(doc, "sectPr");
    const sectPr = sectionProps[sectionProps.length - 1] || ensureWordChild(body, "sectPr");
    const pgSz = ensureWordChild(sectPr, "pgSz", true);
    setWordAttribute(pgSz, "w", 11906);
    setWordAttribute(pgSz, "h", 16838);
    pgSz.removeAttribute("w:orient");

    const pgMar = ensureWordChild(sectPr, "pgMar");
    setWordAttribute(pgMar, "top", 260);
    setWordAttribute(pgMar, "right", 260);
    setWordAttribute(pgMar, "bottom", 260);
    setWordAttribute(pgMar, "left", 260);
    setWordAttribute(pgMar, "header", 0);
    setWordAttribute(pgMar, "footer", 0);
    setWordAttribute(pgMar, "gutter", 0);
  }

  function setDocxRunFontSize(root, sizeHalfPoints) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    wordDescendantElements(root, "r").forEach((run) => {
      const runProps = ensureWordChild(run, "rPr", true);
      removeWordChildren(runProps, "sz");
      removeWordChildren(runProps, "szCs");
      const size = run.ownerDocument.createElementNS(W_NS, "w:sz");
      const sizeCs = run.ownerDocument.createElementNS(W_NS, "w:szCs");
      setWordAttribute(size, "val", sizeHalfPoints);
      setWordAttribute(sizeCs, "val", sizeHalfPoints);
      runProps.append(size, sizeCs);
    });
  }

  function compactDocxParagraphs(root) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    wordDescendantElements(root, "p").forEach((paragraph) => {
      const paragraphProps = ensureWordChild(paragraph, "pPr", true);
      removeWordChildren(paragraphProps, "spacing");
      const spacing = paragraph.ownerDocument.createElementNS(W_NS, "w:spacing");
      setWordAttribute(spacing, "before", 0);
      setWordAttribute(spacing, "after", 0);
      setWordAttribute(spacing, "line", 240);
      setWordAttribute(spacing, "lineRule", "auto");
      paragraphProps.appendChild(spacing);
    });
  }

  function setDocxTableMargins(table) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const tableProps = ensureWordChild(table, "tblPr", true);
    removeWordChildren(tableProps, "tblCellMar");
    const margins = table.ownerDocument.createElementNS(W_NS, "w:tblCellMar");
    ["top", "left", "bottom", "right"].forEach((name) => {
      const margin = table.ownerDocument.createElementNS(W_NS, `w:${name}`);
      setWordAttribute(margin, "w", name === "left" || name === "right" ? 45 : 0);
      setWordAttribute(margin, "type", "dxa");
      margins.appendChild(margin);
    });
    tableProps.appendChild(margins);
  }

  function setDocxTableLayout(table, targetWidthTwips) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const tableProps = ensureWordChild(table, "tblPr", true);
    const tableWidth = ensureWordChild(tableProps, "tblW");
    setWordAttribute(tableWidth, "w", targetWidthTwips);
    setWordAttribute(tableWidth, "type", "dxa");

    removeWordChildren(tableProps, "tblLayout");
    const layout = table.ownerDocument.createElementNS(W_NS, "w:tblLayout");
    setWordAttribute(layout, "type", "fixed");
    tableProps.appendChild(layout);

    const grid = wordChildElements(table, "tblGrid")[0];
    const gridColumns = grid ? wordChildElements(grid, "gridCol") : [];
    const currentWidths = gridColumns
      .map((column) => parseInt(column.getAttributeNS(W_NS, "w") || column.getAttribute("w:w") || "0", 10))
      .filter((width) => width > 0);
    if (!currentWidths.length) return;

    const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0);
    const scaledWidths = currentWidths.map((width) => Math.max(1, Math.round((width / currentTotal) * targetWidthTwips)));
    scaledWidths[scaledWidths.length - 1] += targetWidthTwips - scaledWidths.reduce((sum, width) => sum + width, 0);

    gridColumns.forEach((column, index) => {
      setWordAttribute(column, "w", scaledWidths[index] || 1);
    });

    wordChildElements(table, "tr").forEach((row) => {
      const cells = wordChildElements(row, "tc");
      if (cells.length === scaledWidths.length) {
        cells.forEach((cell, index) => setDocxCellWidth(cell, scaledWidths[index]));
      } else if (cells.length === 1) {
        setDocxCellWidth(cells[0], targetWidthTwips);
      }
    });
  }

  function setDocxCellWidth(cell, widthTwips) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const cellProps = ensureWordChild(cell, "tcPr", true);
    removeWordChildren(cellProps, "tcW");
    const cellWidth = cell.ownerDocument.createElementNS(W_NS, "w:tcW");
    setWordAttribute(cellWidth, "w", widthTwips);
    setWordAttribute(cellWidth, "type", "dxa");
    cellProps.appendChild(cellWidth);
  }

  function setDocxRowHeight(row, heightTwips) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const rowProps = ensureWordChild(row, "trPr", true);
    removeWordChildren(rowProps, "trHeight");
    const height = row.ownerDocument.createElementNS(W_NS, "w:trHeight");
    setWordAttribute(height, "val", heightTwips);
    setWordAttribute(height, "hRule", "exact");
    rowProps.appendChild(height);
  }

  function compactDocxCardTable(table, dataRowHeight = DECK_RECIPE_ROW_HEIGHT_TWIPS) {
    setDocxTableMargins(table);
    const rows = wordChildElements(table, "tr");
    rows.forEach((row, index) => {
      const isHeader = index <= 1;
      setDocxRowHeight(row, dataRowHeight);
      compactDocxParagraphs(row, isHeader ? 170 : Math.max(145, dataRowHeight - 95));
      setDocxRunFontSize(row, 20);
    });
  }

  function compactDocxInfoTable(table) {
    setDocxTableMargins(table);
    wordChildElements(table, "tr").forEach((row) => {
      setDocxRowHeight(row, 360);
      compactDocxParagraphs(row, 220);
      setDocxRunFontSize(row, 20);
    });
  }

  function compactDocxTemplate(doc, tables) {
    const fullPageWidth = 10982;
    const dataRowHeight = DECK_RECIPE_ROW_HEIGHT_TWIPS;

    setDocxPageSetup(doc);
    compactDocxParagraphs(doc.documentElement, 150);
    if (tables[0]) {
      setDocxTableLayout(tables[0], 6800);
      compactDocxInfoTable(tables[0]);
    }
    if (tables[1]) {
      removeNode(tables[1]);
    }
    if (tables[2]) {
      setDocxTableLayout(tables[2], fullPageWidth);
      compactDocxCardTable(tables[2], dataRowHeight);
    }
    if (tables[3]) {
      setDocxTableLayout(tables[3], fullPageWidth);
      compactDocxCardTable(tables[3], dataRowHeight);
    }
  }

  function setDocxCellText(cell, value) {
    const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const XML_NS = "http://www.w3.org/XML/1998/namespace";
    const doc = cell.ownerDocument;
    let paragraph = wordChildElements(cell, "p")[0];
    if (!paragraph) {
      paragraph = doc.createElementNS(W_NS, "w:p");
      cell.appendChild(paragraph);
    }
    wordChildElements(cell, "p")
      .slice(1)
      .forEach((node) => node.remove());
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "pPr" && node.namespaceURI === W_NS)) node.remove();
    });
    const text = String(value ?? "");
    if (!text) return;
    const run = doc.createElementNS(W_NS, "w:r");
    const textNode = doc.createElementNS(W_NS, "w:t");
    textNode.setAttributeNS(XML_NS, "xml:space", "preserve");
    textNode.textContent = text;
    run.appendChild(textNode);
    paragraph.appendChild(run);
  }

  function setDocxRowValues(row, values) {
    const cells = wordChildElements(row, "tc");
    values.forEach((value, index) => {
      if (cells[index]) setDocxCellText(cells[index], value);
    });
  }

  function fillDocxCardTable(table, cards, minRows) {
    const rows = wordChildElements(table, "tr");
    const startRow = 2;
    const targetRows = Math.max(minRows, cards.length, 1);
    const rowTemplate = rows[startRow]?.cloneNode(true) || rows[rows.length - 1]?.cloneNode(true);
    while (wordChildElements(table, "tr").length < startRow + targetRows && rowTemplate) {
      table.appendChild(rowTemplate.cloneNode(true));
    }
    while (wordChildElements(table, "tr").length > startRow + targetRows) {
      wordChildElements(table, "tr").pop()?.remove();
    }
    const nextRows = wordChildElements(table, "tr");
    for (let index = 0; index < targetRows; index += 1) {
      const card = cards[index];
      setDocxRowValues(
        nextRows[startRow + index],
        card ? [card.cardNumber, card.level || "", card.name, cardTypeLabel(card.type), String(card.count)] : ["", "", "", "", ""]
      );
    }
  }

  function buildDeckRecipeDocumentXml(deck) {
    const template = window.DECK_RECIPE_DOCX_TEMPLATE;
    if (!template?.documentXml) throw new Error("DOCX 양식을 찾을 수 없습니다.");
    const parser = new DOMParser();
    const doc = parser.parseFromString(template.documentXml, "application/xml");
    removeDocxRecipeDecorations(doc);
    const tables = Array.from(doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "tbl"));
    const infoRows = wordChildElements(tables[0], "tr");
    setDocxCellText(wordChildElements(infoRows[0], "tc")[1], "");
    setDocxCellText(wordChildElements(infoRows[1], "tc")[1], todayISO());

    const cards = deckCards(deck);
    const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
    const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
    fillDocxCardTable(tables[2], mainCards, DECK_RECIPE_MAIN_MIN_ROWS);
    fillDocxCardTable(tables[3], eggCards, DECK_RECIPE_EGG_MIN_ROWS);
    compactDocxTemplate(doc, tables);
    return new XMLSerializer().serializeToString(doc);
  }

  function safeFileName(name) {
    return String(name || "deck-recipe")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function downloadDeckRecipeDocx(deck) {
    const template = window.DECK_RECIPE_DOCX_TEMPLATE;
    if (!template?.base64 || !template?.documentXml) {
      alert("DOCX 양식을 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
      return;
    }
    const printableDeck = normalizeDeck(deck || {});
    if (!deckCards(printableDeck).length) {
      alert("DOCX로 저장할 카드가 없습니다. 덱을 먼저 구성해 주세요.");
      return;
    }
    const templateBytes = base64ToBytes(template.base64);
    const documentXmlBytes = new TextEncoder().encode(buildDeckRecipeDocumentXml(printableDeck));
    const entries = parseZipEntries(templateBytes).map((entry) => {
      if (entry.name !== "word/document.xml") return entry;
      return {
        ...entry,
        flags: 0,
        method: 0,
        crc: crc32(documentXmlBytes),
        compressedSize: documentXmlBytes.length,
        uncompressedSize: documentXmlBytes.length,
        rawData: documentXmlBytes,
      };
    });
    const blob = buildZip(entries);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(printableDeck.name)}_덱_레시피_${todayISO()}.docx`;
    anchor.click();
    URL.revokeObjectURL(url);
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

  function statsForDeckCard(deckId, card) {
    const matches = data.matches.filter((match) => match.deckId === deckId);
    return statsFromMatches(matches);
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

  function statsForDeck(deckId) {
    const matches = data.matches.filter((match) => match.deckId === deckId);
    return statsFromMatches(matches);
  }

  function summaryStats() {
    return statsFromMatches(data.matches);
  }

  function normalizeOpponentDeckName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function matchupOpponentKey(value) {
    return normalizeOpponentDeckName(value).toLowerCase();
  }

  function deckMatchupRows(deckId = "", limit = 12) {
    const rows = new Map();

    data.matches.forEach((match) => {
      const opponent = normalizeOpponentDeckName(match.opponent);
      if (deckId && match.deckId !== deckId) return;
      if (!match.deckId || !opponent) return;

      const key = `${match.deckId}::${opponent.toLowerCase()}`;
      if (!rows.has(key)) {
        rows.set(key, {
          deckId: match.deckId,
          deckName: deckName(match.deckId),
          opponent,
          ...emptyRecordStats(),
        });
      }

      const row = rows.get(key);
      addMatchToStats(row, match);
    });

    return [...rows.values()]
      .map(finalizeRecordStats)
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.rate - a.rate ||
          a.deckName.localeCompare(b.deckName, "ko") ||
          a.opponent.localeCompare(b.opponent, "ko")
      )
      .slice(0, limit || undefined);
  }

  function statsFromMatches(matches) {
    const stats = emptyRecordStats();
    matches.forEach((match) => addMatchToStats(stats, match));
    return finalizeRecordStats(stats);
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

  function stageStatsFromMatches(matches, stage) {
    return finalizeRecordStats(
      matches.filter((match) => (match.roundStage || "none") === stage).reduce((stats, match) => addMatchToStats(stats, match), emptyRecordStats())
    );
  }

  function tournamentStageSummary(matches, format = "mixed") {
    const swiss = stageStatsFromMatches(matches, "swiss");
    const top = stageStatsFromMatches(matches, "top");
    const none = stageStatsFromMatches(matches, "none");
    const parts = [];
    if (swiss.total) parts.push(`스위스 ${shareRecordText(swiss)}`);
    if (top.total) parts.push(`토너먼트 ${shareRecordText(top)}`);
    if (none.total) {
      const fallbackLabel = format === "swiss" ? "스위스" : format === "top" ? "토너먼트" : "라운드 미구분";
      parts.push(`${fallbackLabel} ${shareRecordText(none)}`);
    }
    return parts.join(" / ");
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

  function validMatchupDeckId(deckRows) {
    if (deckRows.some((row) => row.deck.id === state.matchupDeckId)) return state.matchupDeckId;
    return deckRows[0]?.deck.id || "";
  }

  function validMatchupOpponent(matchupRows) {
    const selectedKey = matchupOpponentKey(state.matchupOpponent);
    const selected = matchupRows.find((row) => matchupOpponentKey(row.opponent) === selectedKey);
    return selected?.opponent || matchupRows[0]?.opponent || "";
  }

  function matchesForMatchup(deckId, opponent) {
    const opponentKey = matchupOpponentKey(opponent);
    return data.matches
      .filter((match) => match.deckId === deckId && matchupOpponentKey(match.opponent) === opponentKey)
      .sort((a, b) => matchDateTime(b) - matchDateTime(a) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  function matchupBreakdownRows(matches, field, labels = {}) {
    const rows = new Map();
    matches.forEach((match) => {
      const rawValue = match[field] || "unknown";
      const label = labels[rawValue] || rawValue || "미기록";
      if (!rows.has(label)) rows.set(label, []);
      rows.get(label).push(match);
    });
    return [...rows.entries()]
      .map(([label, rowMatches]) => ({ label, stats: statsFromMatches(rowMatches) }))
      .sort((a, b) => b.stats.total - a.stats.total || b.stats.rate - a.stats.rate || a.label.localeCompare(b.label, "ko"));
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

  function homeRecentDeckRows(limit = 3) {
    const day = 24 * 60 * 60 * 1000;
    const today = new Date(`${todayISO()}T00:00:00`).getTime();
    const recentMatches = data.matches.filter((match) => matchDateTime(match) >= today - day * 6);
    const sourceMatches = recentMatches.length ? recentMatches : data.matches;
    const rows = new Map();

    sourceMatches.forEach((match) => {
      const deckId = match.deckId || "missing";
      if (!rows.has(deckId)) {
        rows.set(deckId, {
          deckId,
          name: deckId === "missing" ? "덱 미기록" : deckName(deckId),
          total: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          rate: 0,
          lastTime: 0,
        });
      }
      const row = rows.get(deckId);
      row.total += 1;
      if (match.result === "win") row.wins += 1;
      if (match.result === "loss") row.losses += 1;
      if (match.result === "draw") row.draws += 1;
      row.lastTime = Math.max(row.lastTime, matchDateTime(match));
    });

    return [...rows.values()]
      .map((row) => ({ ...row, rate: row.total ? Math.round((row.wins / row.total) * 100) : 0 }))
      .sort((a, b) => b.lastTime - a.lastTime || b.total - a.total || a.name.localeCompare(b.name, "ko"))
      .slice(0, limit);
  }

  function homeTrendRows() {
    const day = 24 * 60 * 60 * 1000;
    const today = new Date(`${todayISO()}T00:00:00`).getTime();
    const start = today - day * 27;
    const rows = ["4주 전", "3주 전", "2주 전", "이번 주"].map((label) => ({
      label,
      total: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      rate: 0,
    }));

    data.matches.forEach((match) => {
      const time = matchDateTime(match);
      if (time < start || time > today) return;
      const index = Math.min(3, Math.max(0, Math.floor((time - start) / (day * 7))));
      const row = rows[index];
      row.total += 1;
      if (match.result === "win") row.wins += 1;
      if (match.result === "loss") row.losses += 1;
      if (match.result === "draw") row.draws += 1;
    });

    return rows.map((row) => ({ ...row, rate: row.total ? Math.round((row.wins / row.total) * 100) : 0 }));
  }

  function renderHomeView() {
    const today = dailyShareSummary(todayISO());
    const overall = summaryStats();
    const deckRows = homeRecentDeckRows();
    const matchupRows = today.matchups.length ? today.matchups.slice(0, 3) : deckMatchupRows("").slice(0, 3);
    const trendRows = homeTrendRows();
    const defaults = recentMatchDefaults();
    const displayStats = today.stats.total ? today.stats : { total: 0, wins: 0, losses: 0, draws: 0 };
    const displayRate = displayStats.total ? Math.round((displayStats.wins / displayStats.total) * 100) : 0;
    const topDeck = today.decks[0]?.label || deckRows[0]?.name || "";
    const heroDetail = today.stats.total
      ? `${topDeck || "덱 미기록"} 기준 오늘 ${today.stats.total}경기 진행`
      : overall.total
        ? `오늘 기록은 아직 없습니다. 전체 ${shareRecordText(overall)}`
        : "첫 전적을 기록하면 이곳에 오늘 흐름이 표시됩니다.";

    return `
      <section class="home-dashboard">
        ${shouldShowStarterGuide() ? renderHomeStarterCard() : ""}
        ${renderSaveStatusStrip()}
        <div class="home-hero-grid">
          <article class="home-panel home-today" style="--rate: ${displayRate}%">
            <div class="home-panel-head">
              <div>
                <h2>오늘 전적</h2>
                <p class="mini-text">${formatDate(todayISO())} · ${today.stats.total ? "오늘 입력 기준" : "기록 대기 중"}</p>
              </div>
              <span class="home-chip">${today.stats.total ? `오늘 ${today.stats.total}전` : "첫 기록 대기"}</span>
            </div>
            <div class="home-today-body">
              <div>
                <div class="home-record">${shareRecordText(displayStats)}</div>
                <div class="home-detail">${escapeHTML(heroDetail)}</div>
                <button class="primary-action home-action" type="button" data-action="open-match">전적 빠르게 추가</button>
              </div>
              <div class="rate-ring home-rate-ring" aria-label="오늘 승률 ${displayRate}%"><span>${displayRate}%</span></div>
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>최근 사용 덱</h2>
              <span class="mini-text">${deckRows.length ? "최근 기록 기준" : "덱 기록 없음"}</span>
            </div>
            <div class="home-list">
              ${
                deckRows.length
                  ? deckRows
                      .map(
                        (row) => `
                          <div class="home-list-row">
                            <div>
                              <strong>${escapeHTML(row.name)}</strong>
                              <span>최근 ${row.total}전 ${row.wins}승</span>
                            </div>
                            <b>${shareScoreText(row)}</b>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="home-empty">덱을 만들고 전적을 기록하면 최근 사용 덱이 표시됩니다.</div>`
              }
            </div>
          </article>
        </div>

        <div class="home-grid">
          <article class="home-panel">
            <div class="home-panel-head">
              <h2>최근 매치업</h2>
              <span class="mini-text">${today.matchups.length ? "오늘 입력 요약" : "누적 기록 기준"}</span>
            </div>
            <div class="home-list">
              ${
                matchupRows.length
                  ? matchupRows
                      .map(
                        (row) => `
                          <div class="home-list-row">
                            <div>
                              <strong>vs ${escapeHTML(row.opponent)}</strong>
                              <span>${row.total}전 · 승률 ${row.total ? Math.round((row.wins / row.total) * 100) : 0}%</span>
                            </div>
                            <b>${shareScoreText(row)}</b>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="home-empty">상대 덱 이름을 적으면 매치업이 자동으로 모입니다.</div>`
              }
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>빠른 기록</h2>
              <span class="mini-text">최근 입력값 자동 적용</span>
            </div>
            <div class="home-quick-grid">
              <div class="home-quick-item"><span>덱</span><strong>${escapeHTML(defaults.deckId ? deckName(defaults.deckId) : "덱 선택")}</strong></div>
              <div class="home-quick-item"><span>상대</span><strong>${escapeHTML(defaults.opponent || "상대 입력")}</strong></div>
              <div class="home-quick-item"><span>유형</span><strong>${escapeHTML(defaults.matchType || data.matchTypes[0] || "대전")}</strong></div>
              <div class="home-quick-item"><span>선/후공</span><strong>${escapeHTML(playOrderLabel(defaults.playOrder || "unknown"))}</strong></div>
              <button class="primary-action home-action full" type="button" data-action="open-match">기록 추가</button>
            </div>
          </article>
        </div>

        <div class="home-grid">
          <article class="home-panel">
            <div class="home-panel-head">
              <h2>이번 달 흐름</h2>
              <span class="mini-text">최근 4주 승률</span>
            </div>
            <div class="home-bars">
              ${trendRows
                .map(
                  (row) => `
                    <div class="home-bar-row">
                      <div class="bar-head"><span>${escapeHTML(row.label)}</span><span>${row.total ? `${row.rate}% · ${row.total}전` : "기록 없음"}</span></div>
                      <div class="bar-track"><div class="bar-fill" style="--bar: ${row.total ? Math.max(4, row.rate) : 0}%"></div></div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>다음에 볼 것</h2>
              <span class="mini-text">추천 액션</span>
            </div>
            <div class="home-list">
              <button class="home-list-row button-row" type="button" data-tab="decks">
                <div>
                  <strong>${escapeHTML(deckRows[0]?.name || "덱 관리")}</strong>
                  <span>덱별 카드 승률과 구축 상태 확인</span>
                </div>
                <b>보기</b>
              </button>
              <button class="home-list-row button-row" type="button" data-action="open-daily-share-panel">
                <div>
                  <strong>오늘 전적 공유</strong>
                  <span>X에 올릴 문장과 이미지 만들기</span>
                </div>
                <b>열기</b>
              </button>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderHomeStarterCard() {
    const steps = [
      ["1", "덱 만들기", data.decks.some((deck) => !String(deck.id).startsWith("sample-")) || (data.decks.length && !data.settings?.demoData)],
      ["2", "전적 기록", data.matches.some((match) => !String(match.id).startsWith("sample-")) || (data.matches.length && !data.settings?.demoData)],
      ["3", "통계 확인", data.matches.length > 0],
      ["4", "X 공유", data.matches.some((match) => match.date === todayISO())],
    ];
    return `
      <article class="home-panel starter-card">
        <div class="home-panel-head">
          <div>
            <h2>처음이라면 이 순서로 시작</h2>
            <p class="mini-text">샘플 데이터는 화면을 보여주기 위한 예시입니다. 내 덱을 만들면 자연스럽게 교체해서 쓸 수 있습니다.</p>
          </div>
          <span class="home-chip">가이드</span>
        </div>
        <div class="starter-steps">
          ${steps
            .map(
              ([number, label, done]) => `
                <span class="${done ? "done" : ""}"><strong>${number}</strong>${escapeHTML(label)}</span>
              `
            )
            .join("")}
        </div>
        <div class="starter-actions">
          <button class="primary-action compact" type="button" data-action="open-deck">내 덱 만들기</button>
          <button class="control-button" type="button" data-action="open-match">전적 남기기</button>
          <button class="control-button" type="button" data-tab="settings">전체 가이드</button>
          <button class="quiet-button" type="button" data-action="dismiss-starter-guide">숨기기</button>
        </div>
      </article>
    `;
  }

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
        </header>
        <nav class="tabs" aria-label="주요 화면">
          ${tabs
            .map(
              ([id, label]) => `
                <button class="tab-button ${state.tab === id ? "active" : ""}" type="button" data-tab="${id}">
                  ${label}
                </button>
              `
            )
            .join("")}
        </nav>
        <main class="content ${state.tab === "home" ? "home-content" : ""} ${["tournaments", "matches", "stats"].includes(state.tab) ? "wide-content" : ""}">${renderCurrentTab()}</main>
        ${renderCloudConflictBanner()}
        ${renderModal()}
        ${renderCardPreview()}
        ${renderToastStack()}
        ${renderMobileQuickActions()}
      </div>
    `;
    // 모달이 열려 있을 때 배경 페이지 스크롤 차단
    document.body.classList.toggle("modal-open", !!(state.modal || state.previewCardNo));
  }

  function renderKeepingDeckScroll() {
    const modalPanel = document.querySelector(".deck-modal-panel");
    const catalogGrid = document.querySelector(".catalog-grid");
    const deckList = document.querySelector(".hub-deck-list");
    const scrollState = {
      modal: modalPanel?.scrollTop || 0,
      catalog: catalogGrid?.scrollTop || 0,
      deckList: deckList?.scrollTop || 0,
    };
    render();
    window.requestAnimationFrame(() => {
      const nextModalPanel = document.querySelector(".deck-modal-panel");
      const nextCatalogGrid = document.querySelector(".catalog-grid");
      const nextDeckList = document.querySelector(".hub-deck-list");
      if (nextModalPanel) nextModalPanel.scrollTop = scrollState.modal;
      if (nextCatalogGrid) nextCatalogGrid.scrollTop = scrollState.catalog;
      if (nextDeckList) nextDeckList.scrollTop = scrollState.deckList;
    });
  }

  function renderCurrentTab() {
    if (state.tab === "home") return renderHomeView();
    if (state.tab === "tournaments") return renderTournamentsView();
    if (state.tab === "decks") return renderDecksView();
    if (state.tab === "stats") return renderStatsView();
    if (state.tab === "settings") return renderSettingsView();
    return renderMatchesView();
  }

  function renderMatchesView() {
    const matches = getFilteredMatches();
    const hasActiveFilter =
      state.filters.query || state.filters.result !== "all" || state.filters.deck !== "all" || state.filters.type !== "all";

    return `
      <section>
        <button class="primary-action" type="button" data-action="open-match">＋ 기록을 추가</button>
        <div class="toolbar">
          <div class="toolbar-main">
            <button class="control-button ${state.filtersOpen || hasActiveFilter ? "active" : ""}" type="button" data-action="toggle-filters">
              🔍 필터 ${hasActiveFilter ? "적용됨" : "▼"}
            </button>
            ${
              state.bulkMode && state.selected.size
                ? `<button class="danger-button" type="button" data-action="delete-selected">${state.selected.size}개 삭제</button>`
                : ""
            }
          </div>
          <button class="quiet-button ${state.memoOnly ? "active" : ""}" type="button" data-action="toggle-memo">메모</button>
          <button class="quiet-button ${state.bulkMode ? "active" : ""}" type="button" data-action="toggle-bulk">일괄</button>
        </div>
        ${state.filtersOpen ? renderFilterPanel() : ""}
        ${
          matches.length
            ? renderMatchDateSections(matches)
            : renderMatchesEmpty(hasActiveFilter || state.memoOnly)
        }
      </section>
    `;
  }

  function renderDateGroupHeader(date, matches, options = {}) {
    const stats = statsFromMatches(matches);
    const tournamentCount = new Set(matches.map((match) => match.tournamentId).filter(Boolean)).size;
    const extra = options.extra || (tournamentCount ? ` · 대회 ${tournamentCount}개` : "");
    return `
      <div class="date-group-head">
        <div>
          <strong>${escapeHTML(shareDateTitle(date))}</strong>
          <span>${escapeHTML(shareRecordText(stats))} · 승률 ${escapeHTML(shareRateText(stats.wins, stats.total))}${escapeHTML(extra)}</span>
        </div>
        <span class="date-group-chip">${matches.length}전</span>
      </div>
    `;
  }

  function renderMatchDateSections(matches) {
    const groups = new Map();
    matches.forEach((match) => {
      const date = match.date || "no-date";
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(match);
    });
    return `
      <div class="date-group-stack">
        ${[...groups.entries()]
          .map(
            ([date, group]) => `
              <section class="date-group">
                ${renderDateGroupHeader(date, group)}
                <div class="list-stack date-group-list">${group.map(renderMatchCard).join("")}</div>
              </section>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderFilterPanel() {
    return `
      <div class="filter-panel">
        <div class="filter-grid">
          <label class="field full">
            <span>검색</span>
            <input class="input" type="search" value="${escapeHTML(state.filters.query)}" placeholder="덱, 상대, 메모 검색" data-filter="query" />
          </label>
          <label class="field">
            <span>결과</span>
            <select class="select" data-filter="result">
              <option value="all"${selectedAttr(state.filters.result, "all")}>전체</option>
              <option value="win"${selectedAttr(state.filters.result, "win")}>승리</option>
              <option value="loss"${selectedAttr(state.filters.result, "loss")}>패배</option>
              <option value="draw"${selectedAttr(state.filters.result, "draw")}>무승부</option>
            </select>
          </label>
          <label class="field">
            <span>덱</span>
            <select class="select" data-filter="deck">
              <option value="all"${selectedAttr(state.filters.deck, "all")}>전체</option>
              ${data.decks
                .map((deck) => `<option value="${escapeHTML(deck.id)}"${selectedAttr(state.filters.deck, deck.id)}>${escapeHTML(deck.name)}</option>`)
                .join("")}
            </select>
          </label>
          <label class="field">
            <span>대전 유형</span>
            <select class="select" data-filter="type">
              <option value="all"${selectedAttr(state.filters.type, "all")}>전체</option>
              ${data.matchTypes
                .map((type) => `<option value="${escapeHTML(type)}"${selectedAttr(state.filters.type, type)}>${escapeHTML(type)}</option>`)
                .join("")}
            </select>
          </label>
          <div class="field">
            <span>&nbsp;</span>
            <button class="control-button" type="button" data-action="clear-filters">초기화</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderMatchesEmpty(filtered) {
    return `
      <div class="empty-state">
        <div class="empty-icon pixel-card" aria-hidden="true"><span></span></div>
        <div class="empty-title">${filtered ? "조건에 맞는 기록이 없습니다" : "기록이 없습니다"}</div>
        <div class="empty-copy">${
          filtered ? "필터를 바꾸거나 초기화해 주세요" : "「기록을 추가」에서 대전을 기록해 보세요"
        }</div>
        <div class="empty-actions">
          ${
            filtered
              ? `<button class="control-button" type="button" data-action="clear-filters">필터 초기화</button>`
              : `
                <button class="primary-action compact" type="button" data-action="open-match">기록 추가</button>
                <button class="control-button" type="button" data-action="open-deck">덱 먼저 만들기</button>
              `
          }
        </div>
      </div>
    `;
  }

  function renderMatchCard(match) {
    const deck = getDeck(match.deckId);
    // 대회 라운드 뱃지: roundText()로 "스위스 R2", "토너먼트 4강" 등 생성
    const round = roundText(match);
    const roundStage = match.roundStage && match.roundStage !== "none" ? match.roundStage : "";
    const tournamentName = getTournament(match.tournamentId)?.name || "";
    // 라운드 뱃지가 없을 때는 기존 방식(대회명 · 라운드)으로 폴백
    const tournamentFallbackText = !roundStage ? tournamentMatchText(match) : "";
    return `
      <article class="match-card">
        ${
          state.bulkMode
            ? `<label class="bulk-check" title="선택"><input type="checkbox" data-select-match="${escapeHTML(match.id)}"${
                state.selected.has(match.id) ? " checked" : ""
              } /></label>`
            : `<span class="result-pill ${escapeHTML(match.result)}">${resultLabel(match.result)}</span>`
        }
        <div class="match-main">
          <div class="match-title">
            ${deck ? colorDots(deck.colors) : ""}
            <span>${escapeHTML(deckName(match.deckId))}</span>
          </div>
          <div class="match-meta">
            ${formatDate(match.date)} · ${escapeHTML(match.matchType || "대전")} · ${escapeHTML(playOrderLabel(match.playOrder))}
            · <span class="match-format-badge">${escapeHTML(matchFormatLabel(match))}</span>
            ${round && roundStage
              ? ` <span class="round-stage-badge ${escapeHTML(roundStage)}">${escapeHTML(round)}</span>`
              : tournamentFallbackText
                ? ` · <span class="match-format-badge tournament">${escapeHTML(tournamentFallbackText)}</span>`
                : ""}
            ${match.opponent ? ` · 상대 ${escapeHTML(match.opponent)}` : ""}
          </div>
          ${round && roundStage && tournamentName
            ? `<p class="match-tournament-name">🏆 ${escapeHTML(tournamentName)}</p>`
            : ""}
          ${match.memo ? `<p class="match-memo">${escapeHTML(match.memo)}</p>` : ""}
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" title="수정" data-action="edit-match" data-id="${escapeHTML(match.id)}">✎</button>
          <button class="icon-button" type="button" title="삭제" data-action="delete-match" data-id="${escapeHTML(match.id)}">×</button>
        </div>
      </article>
    `;
  }

  function renderTournamentsView() {
    const tournaments = sortedTournaments();
    return `
      <section>
        <div class="toolbar">
          <div class="toolbar-main">
            <button class="primary-action" type="button" data-action="open-tournament">＋ 대회 추가</button>
          </div>
        </div>
        ${renderTournamentFlowCard(tournaments[0])}
        ${
          tournaments.length
            ? renderTournamentDateSections(tournaments)
            : `<div class="empty-state">
                <div class="empty-icon pixel-bars"></div>
                <h2>아직 대회 기록이 없습니다</h2>
                <p>매장 대표전처럼 스위스와 토너먼트가 섞인 날은 대회부터 만들고 라운드별 전적을 연결해보세요.</p>
                <div class="empty-actions">
                  <button class="primary-action compact" type="button" data-action="open-tournament">대회 추가</button>
                  <button class="control-button" type="button" data-action="open-match">전적 먼저 기록</button>
                </div>
              </div>`
        }
      </section>
    `;
  }

  function renderTournamentFlowCard(latestTournament) {
    const nextAction = latestTournament ? tournamentNextActionText(latestTournament) : "대회 만들기";
    return `
      <article class="home-panel tournament-flow-card">
        <div class="home-panel-head">
          <div>
            <h2>매장 대표전 기록 흐름</h2>
            <p class="mini-text">대회를 먼저 만들고 스위스, 토너먼트 라운드를 연결하면 오늘 전적 공유 문구까지 자동으로 정리됩니다.</p>
          </div>
          <span class="home-chip">대회 모드</span>
        </div>
        <div class="starter-steps tournament-steps">
          <span class="${latestTournament ? "done" : ""}"><strong>1</strong>대회 생성</span>
          <span class="${latestTournament && tournamentMatches(latestTournament.id).some((match) => match.roundStage === "swiss") ? "done" : ""}"><strong>2</strong>스위스 기록</span>
          <span class="${latestTournament && tournamentMatches(latestTournament.id).some((match) => match.roundStage === "top") ? "done" : ""}"><strong>3</strong>토너먼트 기록</span>
          <span class="${latestTournament && tournamentMatches(latestTournament.id).length ? "done" : ""}"><strong>4</strong>공유문 생성</span>
        </div>
        <div class="starter-actions">
          <button class="primary-action compact" type="button" data-action="${latestTournament ? "open-match-for-tournament" : "open-tournament"}"${
            latestTournament ? ` data-id="${escapeHTML(latestTournament.id)}"` : ""
          }>${escapeHTML(nextAction)}</button>
          ${
            latestTournament
              ? `
                ${tournamentStageActionButton(latestTournament, "swiss", "스위스")}
                ${tournamentStageActionButton(latestTournament, "top", "토너먼트", "gold")}
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderTournamentDateSections(tournaments) {
    const groups = new Map();
    tournaments.forEach((tournament) => {
      const date = tournament.date || "no-date";
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(tournament);
    });
    return `
      <div class="date-group-stack">
        ${[...groups.entries()]
          .map(
            ([date, group]) => `
              <section class="date-group">
                <div class="date-group-head">
                  <div>
                    <strong>${escapeHTML(shareDateTitle(date))}</strong>
                    <span>대회 ${group.length}개</span>
                  </div>
                  <span class="date-group-chip">${group.length}개</span>
                </div>
                <div class="list-stack date-group-list">${group.map(renderTournamentCard).join("")}</div>
              </section>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderTournamentCard(tournament) {
    const matches = tournamentMatches(tournament.id);
    const stats = statsFromMatches(matches);
    const stageSummary = tournamentStageSummary(matches, tournament.format);
    const recent = [...matches].slice(-4).reverse();
    const nextAction = tournamentNextActionText(tournament);
    const progress = tournamentRoundProgress(tournament);
    const finalSummary = tournamentFinalSummaryText(tournament);
    return `
      <article class="match-card tournament-card">
        <span class="result-pill draw">${stats.total ? `${stats.rate}%` : "대회"}</span>
        <div class="match-main">
          <div class="match-title">
            <span>${escapeHTML(tournament.name)}</span>
            <em class="tournament-final-summary">${escapeHTML(finalSummary)}</em>
          </div>
          <div class="match-meta">
            ${formatDate(tournament.date)} · ${escapeHTML(tournamentFormatLabel(tournament.format))}
            ${tournament.location ? ` · ${escapeHTML(tournament.location)}` : ""}
          </div>
          <div class="tournament-summary">
            <strong>${shareRecordText(stats)}</strong>
            <span>승률 ${shareRateText(stats.wins, stats.total)}</span>
            ${stageSummary ? `<span>${escapeHTML(stageSummary)}</span>` : `<span>연결된 라운드 전적 없음</span>`}
            <span>스위스 ${progress.swissCount}R · 토너먼트 ${progress.topCount}R</span>
          </div>
          ${
            recent.length
              ? `<div class="tournament-round-list">
                  ${recent
                    .map(
                      (match) => `
                        <span>${escapeHTML(roundText(match) || "일반")} · vs ${escapeHTML(match.opponent || "상대 미기록")} · ${escapeHTML(
                          match.matchFormat === "match" ? matchScoreValue(match) : resultLabel(match.result)
                        )}</span>
                      `
                    )
                    .join("")}
                </div>`
              : ""
          }
          ${tournament.memo ? `<p class="match-memo">${escapeHTML(tournament.memo)}</p>` : ""}
        </div>
        <div class="card-actions">
          <button class="icon-button text-icon" type="button" title="이 대회 전적 추가" data-action="open-match-for-tournament" data-id="${escapeHTML(tournament.id)}">${escapeHTML(nextAction)}</button>
          ${tournamentStageActionButton(tournament, "swiss", "스위스")}
          ${tournamentStageActionButton(tournament, "top", "토너먼트", "gold")}
          <button class="icon-button" type="button" title="수정" data-action="edit-tournament" data-id="${escapeHTML(tournament.id)}">✎</button>
          <button class="icon-button" type="button" title="삭제" data-action="delete-tournament" data-id="${escapeHTML(tournament.id)}">×</button>
        </div>
      </article>
    `;
  }

  function renderDecksView() {
    return `
      <section>
        <div class="deck-toolbar">
          <button class="primary-action" type="button" data-action="open-deck">＋ 덱을 추가</button>
          <button class="control-button" type="button" data-action="open-deck-import">덱 가져오기</button>
        </div>
        ${
          data.decks.length
            ? `<div class="list-stack">${data.decks.map(renderDeckCard).join("")}</div>`
            : `
              <div class="empty-state">
                <div class="empty-icon pixel-stack" aria-hidden="true"><span></span></div>
                <div class="empty-title">등록된 덱이 없습니다</div>
                <div class="empty-copy">덱을 만들면 전적 입력이 더 빨라집니다</div>
                <div class="empty-actions">
                  <button class="primary-action compact" type="button" data-action="open-deck">덱 추가 시작</button>
                  <button class="control-button" type="button" data-action="open-deck-import">덱 코드 가져오기</button>
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  function renderDeckCard(deck) {
    const stats = statsForDeck(deck.id);
    const cards = sortDeckCards(deckCards(deck));
    const summary = deckCountSummary(cards);
    const readiness = deckReadiness(cards);
    return `
      <article class="deck-card">
        <div class="deck-head">
          <div>
            <div class="deck-name">${colorDots(deck.colors)} <span>${escapeHTML(deck.name)}</span></div>
            <div class="mini-text">${
              cards.length
                ? `총 ${summary.total}/${DECK_LIMITS.total}장 · 일반 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg} · ${cards.length}종`
                : "구축된 카드 없음"
            }</div>
            <div class="deck-readiness ${escapeHTML(readiness.level)}">
              <strong>${escapeHTML(readiness.label)}</strong>
              <span>${escapeHTML(readiness.detail)}</span>
            </div>
            <div class="deck-meta-grid">
              <span><strong>최근 사용</strong>${escapeHTML(deckLastUsedLabel(deck.id))}</span>
              <span><strong>색상</strong>${escapeHTML(deckColorText(deck.colors))}</span>
            </div>
            ${deck.note ? `<div class="mini-text">${escapeHTML(deck.note)}</div>` : ""}
          </div>
          <div class="card-actions">
            <button class="icon-button" type="button" title="수정" data-action="edit-deck" data-id="${escapeHTML(deck.id)}">✎</button>
            <button class="icon-button" type="button" title="덱 레시피 인쇄" data-action="print-deck" data-id="${escapeHTML(deck.id)}">⎙</button>
            <button class="icon-button text-icon" type="button" title="DOCX 다운로드" data-action="download-deck-docx" data-id="${escapeHTML(deck.id)}">DOCX</button>
            <button class="icon-button text-icon" type="button" title="덱 이미지 저장" data-action="download-deck-image" data-id="${escapeHTML(deck.id)}">PNG</button>
            <button class="icon-button text-icon" type="button" title="덱 내보내기" data-action="export-deck" data-id="${escapeHTML(deck.id)}">내보내기</button>
            <button class="icon-button" type="button" title="복사" data-action="clone-deck" data-id="${escapeHTML(deck.id)}">⧉</button>
            <button class="icon-button" type="button" title="삭제" data-action="delete-deck" data-id="${escapeHTML(deck.id)}">×</button>
          </div>
        </div>
        <div class="deck-stats">
          <div class="deck-stat"><strong>${stats.total}</strong><span>전적</span></div>
          <div class="deck-stat"><strong>${stats.wins}</strong><span>승</span></div>
          <div class="deck-stat"><strong>${stats.losses}</strong><span>패</span></div>
          <div class="deck-stat"><strong>${stats.rate}%</strong><span>승률</span></div>
        </div>
        ${cards.length ? renderDeckCardList(deck, cards) : ""}
      </article>
    `;
  }

  function renderDeckCardList(deck, cards) {
    return `
      <details class="deck-build-preview deck-rate-details">
        <summary class="card-rate-summary">
          <span class="card-rate-title">카드별 승률</span>
          <span class="card-rate-count">${cards.length}종</span>
        </summary>
        <div class="card-rate-list">
          ${cards
            .map((card) => {
              const stats = statsForDeckCard(deck.id, card);
              return `
                <div class="card-rate-row">
                  <div class="card-rate-main">
                    <strong>${escapeHTML(cardDisplayName(card))}</strong>
                    <span>${escapeHTML(cardMetaText(card))}</span>
                  </div>
                  <div class="card-rate-score">
                    <strong>${stats.total ? `${stats.rate}%` : "-"}</strong>
                    <span>${stats.total}전 ${stats.wins}승</span>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </details>
    `;
  }

  function renderStatsView() {
    const stats = summaryStats();
    const deckRows = data.decks
      .map((deck) => ({ deck, stats: statsForDeck(deck.id) }))
      .filter((row) => row.stats.total > 0)
      .sort((a, b) => b.stats.total - a.stats.total);
    const typeRows = data.matchTypes
      .map((type) => {
        const total = data.matches.filter((match) => match.matchType === type).length;
        return { type, total };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const selectedMatchupDeckId = validMatchupDeckId(deckRows);
    const matchupRows = deckMatchupRows(selectedMatchupDeckId, 0);
    const selectedMatchupOpponent = validMatchupOpponent(matchupRows);

    return `
      <section>
        <div class="stats-grid">
          <article class="stat-card rate-card" style="--rate: ${stats.rate}%">
            <div class="rate-ring" aria-label="전체 승률 ${stats.rate}%"><span>${stats.rate}%</span></div>
            <div>
              <div class="stat-label">전체 승률</div>
              <div class="mini-text">승 ${stats.wins} · 패 ${stats.losses} · 무 ${stats.draws}</div>
            </div>
          </article>
          <article class="stat-card">
            <div class="stat-label">총 전적</div>
            <div class="stat-value">${stats.total}</div>
          </article>
          <article class="stat-card">
            <div class="stat-label">등록 덱</div>
            <div class="stat-value">${data.decks.length}</div>
          </article>
        </div>
        ${renderDailyShareCard()}
        ${
          stats.total
            ? `
              <div class="settings-card" style="margin-top: 12px;">
                <h2 class="settings-title">덱별 성적</h2>
                <div class="bar-list">
                  ${deckRows.map((row) => renderBar(row.deck.name, `${row.stats.total}전 · 승률 ${row.stats.rate}%`, row.stats.rate)).join("")}
                </div>
              </div>
              <div class="settings-card" style="margin-top: 12px;">
                <h2 class="settings-title">대전 유형</h2>
                <div class="bar-list">
                  ${typeRows.map((row) => renderBar(row.type, `${row.total}회`, Math.round((row.total / stats.total) * 100))).join("")}
                </div>
              </div>
              ${renderMatchupReportCard(deckRows, selectedMatchupDeckId, matchupRows, selectedMatchupOpponent)}
            `
            : `
              <div class="empty-state">
                <div class="empty-icon pixel-bars" aria-hidden="true"><span></span></div>
                <div class="empty-title">아직 통계가 없습니다</div>
                <div class="empty-copy">전적을 추가하면 승률과 덱별 기록이 표시됩니다</div>
              </div>
            `
        }
      </section>
    `;
  }

  function renderMatchupMetricBar(label, stats, tone = "") {
    const percent = stats.total ? stats.rate : 0;
    return `
      <div class="matchup-metric-row">
        <div class="bar-head">
          <span>${escapeHTML(label)}</span>
          <span>${
            stats.total
              ? `${stats.wins}승 ${stats.losses}패${stats.draws ? ` ${stats.draws}무` : ""} · ${stats.rate}%${
                  hasMatchGameBreakdown(stats) ? ` · 게임 ${shareGameScoreText(stats)}` : ""
                }`
              : "기록 없음"
          }</span>
        </div>
        <div class="bar-track"><div class="bar-fill ${tone}" style="--bar: ${stats.total ? Math.max(4, percent) : 0}%"></div></div>
      </div>
    `;
  }

  function renderMatchupReportCard(deckRows, selectedDeckId, matchupRows, selectedOpponent) {
    const selectedRow = matchupRows.find((row) => matchupOpponentKey(row.opponent) === matchupOpponentKey(selectedOpponent));
    const selectedDeck = getDeck(selectedDeckId);
    const matches = selectedRow ? matchesForMatchup(selectedDeckId, selectedRow.opponent) : [];
    const matchupStats = selectedRow || statsFromMatches(matches);
    const playRows = matchupBreakdownRows(matches, "playOrder", {
      first: "선공",
      second: "후공",
      unknown: "선후공 미상",
    });
    const typeRows = matchupBreakdownRows(matches, "matchType").slice(0, 3);
    const recentMatches = matches.slice(0, 4);
    const notes = matchupNoteRows(selectedRow, playRows);

    return `
      <div class="settings-card matchup-report-card">
        <div class="matchup-report-head">
          <div>
            <h2 class="settings-title">덱별 상대 분석</h2>
            <div class="mini-text">사용 덱과 상대 덱을 고르면 승률, 선후공, 최근 대전을 한 화면에서 봅니다.</div>
          </div>
          <div class="matchup-report-filters">
            <label class="matchup-filter">
              <span>사용 덱</span>
              <select class="select" data-matchup-deck-filter>
                ${deckRows
                  .map(
                    (row) =>
                      `<option value="${escapeHTML(row.deck.id)}"${selectedAttr(selectedDeckId, row.deck.id)}>${escapeHTML(row.deck.name)}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="matchup-filter">
              <span>상대 덱</span>
              <select class="select" data-matchup-opponent-filter ${matchupRows.length ? "" : "disabled"}>
                ${
                  matchupRows.length
                    ? matchupRows
                        .map(
                          (row) =>
                            `<option value="${escapeHTML(row.opponent)}"${selectedAttr(selectedOpponent, row.opponent)}>vs ${escapeHTML(row.opponent)}</option>`
                        )
                        .join("")
                    : `<option value="">상대 기록 없음</option>`
                }
              </select>
            </label>
          </div>
        </div>
        ${
          selectedRow
            ? `
              <div class="matchup-report-hero">
                <div class="matchup-report-deck">
                  <div class="matchup-deck-top">
                    ${colorDots(selectedDeck?.colors)}
                    <span>${matchupStats.total}전 ${matchupStats.wins}승 ${matchupStats.losses}패${matchupStats.draws ? ` ${matchupStats.draws}무` : ""}</span>
                  </div>
                  <strong>${escapeHTML(selectedDeck?.name || matchupStats.deckName)}</strong>
                </div>
                <div class="matchup-versus">VS</div>
                <div class="matchup-report-rate">
                  <div class="rate-ring matchup-report-ring" style="--rate: ${matchupStats.rate}%">
                    <span>${matchupStats.rate}%</span>
                  </div>
                  <div>
                    <strong>${escapeHTML(selectedRow.opponent)} 상대 ${shareScoreText(matchupStats)}</strong>
                    <span>${playRows
                      .filter((row) => row.stats.total)
                      .slice(0, 2)
                      .map((row) => `${row.label} ${row.stats.rate}%`)
                      .join(" / ") || "선후공 기록 없음"}</span>
                  <span>최근 ${recentMatches
                      .slice(0, 3)
                      .map((match) => `${resultShortLabel(match.result)}${match.matchFormat === "match" ? ` ${matchScoreValue(match)}` : ""}`)
                      .join(", ")}</span>
                  </div>
                </div>
              </div>

              <div class="matchup-report-grid">
                <section class="matchup-report-section">
                  <div class="matchup-section-head">
                    <h3>상세 승률</h3>
                    <span class="mini-text">자동 집계</span>
                  </div>
                  <div class="matchup-metrics">
                    ${renderMatchupMetricBar("전체", matchupStats)}
                    ${playRows.map((row) => renderMatchupMetricBar(row.label, row.stats, row.label === "후공" ? "warn" : "")).join("")}
                    ${typeRows.map((row) => renderMatchupMetricBar(row.label, row.stats)).join("")}
                  </div>
                </section>

                <section class="matchup-report-section">
                  <div class="matchup-section-head">
                    <h3>최근 대전</h3>
                    <span class="mini-text">최신순</span>
                  </div>
                  <div class="matchup-recent-list">
                    ${recentMatches
                      .map(
                        (match) => `
                          <div class="matchup-recent-row">
                            <span class="matchup-result-pill ${escapeHTML(match.result)}">${escapeHTML(resultShortLabel(match.result))}</span>
                            <div>
                              <strong>vs ${escapeHTML(selectedRow.opponent)}</strong>
                              <span>${escapeHTML(match.matchType || "대전")} · ${escapeHTML(playOrderLabel(match.playOrder))} · ${escapeHTML(
                                formatDate(match.date)
                              )}</span>
                            </div>
                            <b>${escapeHTML(match.matchFormat === "match" ? matchScoreValue(match) : resultLabel(match.result))}</b>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                </section>
              </div>

              <div class="matchup-report-grid">
                <section class="matchup-report-section">
                  <div class="matchup-section-head">
                    <h3>메모 후보</h3>
                    <span class="mini-text">다음 기록에 연결</span>
                  </div>
                  <div class="matchup-note-list">
                    ${
                      notes.length
                        ? notes
                            .map(
                              ([title, detail]) => `
                                <div class="matchup-note">
                                  <strong>${escapeHTML(title)}</strong>
                                  <span>${escapeHTML(detail)}</span>
                                </div>
                              `
                            )
                            .join("")
                        : `<div class="matchup-note"><strong>기록 누적 중</strong><span>상대 기록이 더 쌓이면 선후공 차이나 조정 후보를 자동으로 보여줍니다.</span></div>`
                    }
                  </div>
                </section>
              </div>
            `
            : `<div class="daily-share-empty">선택한 덱의 전적 기록에서 상대 덱 이름을 입력하면 매치업 리포트가 표시됩니다.</div>`
        }
      </div>
    `;
  }

  function renderBar(label, detail, percent) {
    return `
      <div class="bar-row">
        <div class="bar-head"><span>${escapeHTML(label)}</span><span>${escapeHTML(detail)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="--bar: ${Math.max(4, percent)}%"></div></div>
      </div>
    `;
  }

  function renderSettingsView() {
    const recovery = recoveryStatusInfo();
    return `
      <section class="settings-stack">
        ${renderFirstUseGuideCard()}
        ${renderSyncSettingsCard()}
        ${renderDiagnosticsSettingsCard()}
        ${isAdminUser() ? renderServiceStatusCard() : ""}
        <article class="settings-card">
          <h2 class="settings-title">대전 유형 관리</h2>
          ${data.matchTypes
            .map(
              (type) => `
                <div class="type-row">
                  <span>${escapeHTML(type)}</span>
                  <button class="icon-button" type="button" title="삭제" data-action="delete-type" data-type="${escapeHTML(type)}">×</button>
                </div>
              `
            )
            .join("")}
          <form class="backup-row" id="type-form">
            <input class="input" name="typeName" placeholder="새 유형" autocomplete="off" />
            <button class="control-button active" type="submit">추가</button>
          </form>
        </article>
        <article class="settings-card">
          <div class="settings-title-row">
            <h2 class="settings-title">내 데이터 백업</h2>
            <span class="sync-badge ${backupStatusInfo().tone}">${escapeHTML(backupStatusInfo().label)}</span>
          </div>
          <div class="mini-text">전적과 덱 데이터를 JSON 파일로 저장하거나, 저장해 둔 백업 파일로 복원합니다. 마지막 백업: ${escapeHTML(backupStatusInfo().detail)}</div>
          <div class="recovery-point">
            <div>
              <strong>${escapeHTML(recovery.label)}</strong>
              <span>${escapeHTML(recovery.detail)}</span>
            </div>
            <button class="control-button" type="button" data-action="restore-recovery-point" ${recovery.available ? "" : "disabled"}>최근 복구 지점 적용</button>
          </div>
          <div class="backup-row">
            <button class="control-button" type="button" data-action="download-backup">백업 파일 저장</button>
            <label class="control-button" style="display: grid; place-items: center; cursor: pointer;">
              백업 파일 불러오기
              <input class="hidden-input" type="file" accept=".json,application/json" data-restore-file />
            </label>
          </div>
        </article>
        ${isAdminUser() ? renderCardDataSettingsCard() : ""}
        ${renderInstallSettingsCard()}
        <article class="settings-card">
          <h2 class="settings-title" style="color: var(--danger);">위험 구역</h2>
          <div class="mini-text">${state.authUser ? "저장된 모든 전적, 덱, 설정을 이 기기와 클라우드에서 초기화합니다." : "저장된 모든 전적, 덱, 설정을 초기화합니다."}</div>
          <div class="backup-row">
            <button class="danger-button" type="button" data-action="clear-all">전체 삭제</button>
          </div>
        </article>
      </section>
    `;
  }

  function renderFirstUseGuideCard() {
    const steps = [
      ["1", "Google 로그인", "PC와 휴대폰에서 같은 데이터를 이어서 사용합니다."],
      ["2", "덱 만들기", "덱 관리를 열고 메인 50장, 디지타마 4~5장까지 구성합니다."],
      ["3", "전적 기록", "사용한 덱, 상대 덱, 승패를 남깁니다."],
      ["4", "통계 확인", "덱 승률과 매치업 승률을 확인합니다."],
      ["5", "백업 보관", "큰 수정 전에는 내 데이터 백업 파일을 저장해 둡니다."],
    ];
    return `
      <article class="settings-card guide-card">
        <div class="settings-title-row">
          <h2 class="settings-title">처음 시작 가이드</h2>
          <span class="sync-badge ok">첫 사용자용</span>
        </div>
        <div class="mini-text">처음 보이는 샘플 덱과 전적은 화면 구성을 보여주기 위한 예시입니다. 수정하거나 삭제해도 괜찮습니다.</div>
        <div class="guide-steps">
          ${steps
            .map(
              ([number, title, detail]) => `
                <div class="guide-step">
                  <strong>${number}</strong>
                  <div>
                    <span>${escapeHTML(title)}</span>
                    <p>${escapeHTML(detail)}</p>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="open-deck">덱 추가로 시작</button>
          <button class="control-button" type="button" data-action="open-match">전적 기록하기</button>
        </div>
      </article>
    `;
  }

  function renderServiceStatusCard() {
    const backup = backupStatusInfo();
    const signedIn = Boolean(state.authUser);
    const cardSummary = cardDataSummary();
    const localSaved = formatSyncTime(state.localSavedAt || data.settings?.lastLocalSavedAt);
    const statusTone = serviceStatusTone();
    const statusLabel = statusTone === "ok" ? "정상" : statusTone === "busy" ? "진행 중" : statusTone === "danger" ? "확인 필요" : "주의";
    return `
      <article class="settings-card service-status-card">
        <div class="settings-title-row">
          <h2 class="settings-title">서비스 상태</h2>
          <span class="sync-badge ${statusTone}">${statusLabel}</span>
        </div>
        <div class="mini-text">운영에 필요한 저장, 백업, 카드 데이터 상태를 한눈에 확인합니다.</div>
        <div class="sync-info-grid service-health-grid">
          <div class="${state.localSaveError ? "danger" : "ok"}">
            <span>이 기기 저장</span>
            <strong>${escapeHTML(state.localSaveError || localSaved || "자동 저장 대기")}</strong>
          </div>
          <div class="${state.cloudError ? "danger" : signedIn ? "ok" : "warn"}">
            <span>클라우드</span>
            <strong>${escapeHTML(signedIn ? cloudStatusText() : "로그인 전")}</strong>
          </div>
          <div class="${backup.tone}">
            <span>마지막 백업</span>
            <strong>${escapeHTML(backup.detail)}</strong>
          </div>
          <div class="ok">
            <span>내 데이터</span>
            <strong>${escapeHTML(dataSummary())}</strong>
          </div>
          <div class="${cardSummary.missingImageCount ? "warn" : "ok"}">
            <span>카드 이미지 키</span>
            <strong>${cardSummary.missingImageCount ? `${cardSummary.missingImageCount.toLocaleString("ko-KR")}장 확인` : "정상"}</strong>
          </div>
          <div class="${cardSummary.effectCount ? "ok" : "warn"}">
            <span>정발 효과</span>
            <strong>${cardSummary.effectCount.toLocaleString("ko-KR")}장</strong>
          </div>
        </div>
        <div class="mini-text">앱 버전: ${escapeHTML(APP_VERSION)}</div>
      </article>
    `;
  }

  function renderDiagnosticsSettingsCard() {
    const status = diagnosticStatusInfo();
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">문제 진단</h2>
          <span class="sync-badge ${status.tone}">${escapeHTML(status.label)}</span>
        </div>
        <div class="mini-text">여러 기기에서 오래 쓰다가 생기는 저장, 동기화, 이미지 로딩 문제를 진단 파일로 남깁니다. 문제가 생기면 이 파일만 확인해도 원인을 훨씬 빨리 좁힐 수 있습니다.</div>
        <div class="sync-info-grid">
          <div>
            <span>최근 기록</span>
            <strong>${escapeHTML(status.detail)}</strong>
          </div>
          <div>
            <span>앱 버전</span>
            <strong>${escapeHTML(APP_VERSION)}</strong>
          </div>
          <div>
            <span>네트워크</span>
            <strong>${navigator.onLine ? "온라인" : "오프라인"}</strong>
          </div>
        </div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="download-diagnostics">진단 파일 저장</button>
          <button class="control-button" type="button" data-action="clear-diagnostics" ${status.count ? "" : "disabled"}>기록 비우기</button>
        </div>
      </article>
    `;
  }

  function renderSyncSettingsCard() {
    const signedIn = Boolean(state.authUser);
    const lastSaved = formatSyncTime(state.cloudUpdatedAt);
    const localSaved = formatSyncTime(state.localSavedAt || data.settings?.lastLocalSavedAt);
    const backup = backupStatusInfo();
    return `
      <article class="settings-card sync-settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">계정 / 동기화</h2>
          <span class="sync-badge ${syncTone()}"><span class="sync-dot ${syncTone()}"></span>${escapeHTML(cloudStatusText())}</span>
        </div>
        <div class="sync-info-grid">
          <div>
            <span>계정</span>
            <strong>${escapeHTML(signedIn ? userEmail() || "로그인됨" : "로그인 전")}</strong>
          </div>
          <div>
            <span>저장 데이터</span>
            <strong>${escapeHTML(dataSummary())}</strong>
          </div>
          <div>
            <span>최근 동기화</span>
            <strong>${escapeHTML(lastSaved || "아직 없음")}</strong>
          </div>
          <div>
            <span>이 기기 저장</span>
            <strong>${escapeHTML(localSaved || "자동 저장 전")}</strong>
          </div>
          <div class="${escapeHTML(backup.tone)}">
            <span>백업 상태</span>
            <strong>${escapeHTML(backup.label)} · ${escapeHTML(backup.detail)}</strong>
          </div>
          <div class="${state.cloudError ? "danger" : state.cloudSaving || state.cloudLoading ? "busy" : signedIn ? "ok" : "warn"}">
            <span>저장 상태</span>
            <strong>${escapeHTML(cloudStatusText())}</strong>
          </div>
        </div>
        <div class="backup-row sync-actions">
          ${
            signedIn
              ? `
                <button class="control-button active" type="button" data-action="sync-cloud-now">지금 저장</button>
                <button class="control-button" type="button" data-action="load-cloud-now">클라우드 불러오기</button>
                <button class="control-button" type="button" data-action="logout-google">로그아웃</button>
              `
              : `<button class="primary-action compact" type="button" data-action="login-google">Google 로그인</button>`
          }
        </div>
      </article>
    `;
  }

  function renderInstallSettingsCard() {
    const installed = state.pwaInstalled;
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">앱 설치</h2>
          <span class="sync-badge ${installed ? "ok" : "offline"}">${installed ? "설치됨" : "선택 가능"}</span>
        </div>
        <div class="mini-text">${installed ? "홈 화면 앱 모드로 실행 중입니다." : "휴대폰이나 PC 홈 화면에 전적몬을 앱처럼 추가할 수 있습니다."}</div>
        <div class="backup-row">
          <button class="control-button ${state.installPrompt ? "active" : ""}" type="button" data-action="install-pwa">${state.installPrompt ? "홈 화면에 추가" : "설치 안내"}</button>
        </div>
      </article>
    `;
  }

  function renderCardDataSettingsCard() {
    const summary = cardDataSummary();
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">카드 데이터 관리</h2>
          <span class="sync-badge ${summary.missingImageCount ? "warn" : "ok"}">운영자용</span>
        </div>
        <div class="mini-text">신규 카드가 보이지 않거나 이미지/정발 효과가 비어 있을 때, PC에서 갱신 스크립트를 실행한 뒤 GitHub에 파일을 올립니다.</div>
        <div class="sync-info-grid card-data-grid">
          <div>
            <span>카드 카탈로그</span>
            <strong>${summary.catalogCount.toLocaleString("ko-KR")}장</strong>
          </div>
          <div>
            <span>이미지 미등록</span>
            <strong>${summary.missingImageCount.toLocaleString("ko-KR")}장</strong>
          </div>
          <div>
            <span>정발 효과</span>
            <strong>${summary.effectCount.toLocaleString("ko-KR")}장</strong>
          </div>
        </div>
        <div class="mini-text">정발 효과 최근 수집: ${escapeHTML(formatSyncTime(summary.latestEffectFetch) || "기록 없음")}</div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="copy-card-update-commands">갱신 명령 복사</button>
          <button class="control-button" type="button" data-action="download-card-data-status">상태 파일 저장</button>
        </div>
      </article>
    `;
  }

  function renderModal() {
    if (!state.modal) return "";
    if (state.modal === "match") return renderMatchModal();
    if (state.modal === "tournament") return renderTournamentModal();
    if (state.modal === "deck") return renderDeckModal();
    if (state.modal === "deck-import") return renderDeckImportModal();
    return "";
  }

  function renderCardPreview() {
    if (!state.previewCardNo) return "";
    const card = cardPreviewData(state.previewCardNo);
    if (!card) return "";
    const imageSrc = card.img || remoteCardImageUrl(card.no);
    return `
      <div class="card-preview-backdrop">
        <section class="card-preview-panel" role="dialog" aria-modal="true" aria-label="${escapeHTML(card.name)} 미리보기">
          <button class="icon-button card-preview-close" type="button" title="닫기" data-action="close-card-preview">×</button>
          <div class="card-preview-image">
            ${
              imageSrc
                ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" loading="eager" />`
                : `<span class="catalog-image-empty">${escapeHTML(card.no)}</span>`
            }
          </div>
          ${renderKoreanCardPreview(card)}
        </section>
      </div>
    `;
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
    return `
      <div class="modal-backdrop">
        <section class="modal-panel ${escapeHTML(className)}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
          <div class="modal-head">
            <h2 class="modal-title">${escapeHTML(title)}</h2>
            <button class="icon-button" type="button" title="닫기" data-action="close-modal">×</button>
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
        </div>
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
        <label class="field">
          <span>새 덱 이름</span>
          <input class="input" name="newDeckName" placeholder="새 덱으로 기록할 때 입력" autocomplete="off" />
        </label>
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
    return `
      <button class="catalog-card${count ? " in-deck" : ""}" type="button" data-action="add-catalog-card" data-card-no="${escapeHTML(
        card.no
      )}"${canAdd ? "" : " disabled"} title="${escapeHTML(card.no)} ${escapeHTML(card.name)}">
        <span class="catalog-image" data-action="preview-catalog-card" data-card-no="${escapeHTML(card.no)}">
          ${
            imageSrc
              ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" data-card-no="${escapeHTML(card.no)}" loading="lazy" />`
              : `<span class="catalog-image-empty">${escapeHTML(card.no)}</span>`
          }
        </span>
        ${count ? `<span class="catalog-count">${count}</span>` : ""}
        <span class="catalog-info">
          <strong>${escapeHTML(card.name)}</strong>
          <small>${escapeHTML(card.no)} · ${escapeHTML(catalogMetaText(card))}</small>
        </span>
      </button>
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
          <button class="step-button" type="button" data-action="decrement-deck-card" data-card-id="${escapeHTML(card.id)}">-</button>
          <input class="input count-input" data-card-field="count" data-card-id="${escapeHTML(card.id)}" type="number" min="1" max="4" value="${
            card.count
          }" aria-label="매수" />
          <button class="step-button" type="button" data-action="increment-deck-card" data-card-id="${escapeHTML(card.id)}">+</button>
        </div>
        <button class="icon-button" type="button" title="카드 삭제" data-action="remove-deck-card" data-card-id="${escapeHTML(card.id)}">×</button>
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
    const mainCards = cards.filter((c) => c.type !== "digiEgg");
    const eggCards  = cards.filter((c) => c.type === "digiEgg");
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

  function renderDeckAdvancedSearch(resultCount) {
    if (!state.deckAdvancedOpen) return "";
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
            <div class="mobile-builder-summary">
              <span>메인 <strong>${summary.main}/${DECK_LIMITS.main}</strong></span>
              <span>디지타마 <strong>${summary.digiEgg}/${DECK_LIMITS.digiEgg}</strong></span>
              <span>총 <strong>${summary.total}/${DECK_LIMITS.total}</strong></span>
            </div>
          </div>
          <div class="builder-flow-strip" aria-label="덱 구축 진행 상태">
            <span data-builder-result-count>${catalogResultCount.toLocaleString("ko-KR")}종 검색됨</span>
            <span>카드 클릭으로 +1장</span>
            <span class="${escapeHTML(builderStatusTone)}">현재 ${summary.total}/${DECK_LIMITS.total}장</span>
            <span>같은 카드 번호 최대 4장</span>
          </div>
          <div class="deck-builder-tabs">
            <button class="deck-tab-btn${state.deckBuilderView !== "tray" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="catalog">카드 찾기</button>
            <button class="deck-tab-btn${state.deckBuilderView === "tray" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="tray">덱 목록 (${summary.total}장)</button>
          </div>
        </div>
        ${renderDeckAdvancedSearch(catalogResultCount)}

        <div class="hub-layout">
          <section class="catalog-panel${state.deckBuilderView === "tray" ? " mobile-hidden" : ""}" aria-label="카드 카탈로그">
            <div class="catalog-grid">
              ${renderCatalogGridContent()}
            </div>
          </section>

          <section class="deck-tray${state.deckBuilderView === "catalog" ? " mobile-hidden" : ""}" aria-label="구축 중인 덱">
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
    render();
  }

  function closeCardPreview() {
    state.previewCardNo = "";
    if (state.modal === "deck") renderKeepingDeckScroll();
    else render();
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
    state.previewCardNo = normalized;
    if (state.modal === "deck") renderKeepingDeckScroll();
    else render();
    if (!KOREAN_CARD_PREVIEWS[normalized]?.effect) fetchAndCacheCardEffect(normalized);
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
      const newDeckName = panel?.querySelector('[name="newDeckName"]');
      if (select) {
        select.value = target.dataset.id || "";
        select.focus();
      }
      if (newDeckName) newDeckName.value = "";
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
      state.deckBuilderView = target.dataset.view === "tray" ? "tray" : "catalog";
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
    const newDeckName = String(formData.get("newDeckName") || "").trim();
    let deckId = String(formData.get("deckId") || "");
    if (newDeckName) deckId = ensureDeck(newDeckName).id;
    if (!deckId) {
      alert("덱을 선택하거나 새 덱 이름을 입력해 주세요.");
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
    const tournament = {
      id: state.editingTournamentId || uid("tournament"),
      name,
      date: String(formData.get("date") || todayISO()),
      format: TOURNAMENT_FORMAT_OPTIONS.some(([value]) => value === formatValue) ? formatValue : "mixed",
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

  function uniqueImportedDeckName(name) {
    const base = String(name || "가져온 덱").trim() || "가져온 덱";
    const existingNames = new Set(data.decks.map((deck) => deck.name));
    if (!existingNames.has(base)) return base;
    let index = 2;
    while (existingNames.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  }

  function catalogCardByNumber(cardNumber) {
    const normalized = normalizeCardNumber(cardNumber);
    return CARD_CATALOG.find((card) => card.no === normalized);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function apiCardType(type) {
    const normalized = String(type || "").toLowerCase();
    if (normalized.includes("digi-egg") || normalized.includes("digiegg")) return "digiEgg";
    if (normalized.includes("option")) return "option";
    if (normalized.includes("tamer")) return "tamer";
    if (normalized.includes("digimon")) return "digimon";
    return "digimon";
  }

  function normalizeRemoteCard(card) {
    const cardNumber = normalizeCardNumber(card.id || card.cardnumber || card.cardNumber || card.card_number || "");
    const name = String(card.name || "").trim();
    if (!cardNumber || !name) return null;
    return {
      cardNumber,
      level: normalizeLevel(card.level || ""),
      name,
      type: apiCardType(card.type),
      img: remoteCardImageUrl(cardNumber),
    };
  }

  async function fetchRemoteCardInfo(cardNumbers) {
    const uniqueNumbers = [...new Set(cardNumbers.map(normalizeCardNumber).filter(Boolean))];
    const missingNumbers = uniqueNumbers.filter((number) => !catalogCardByNumber(number));
    const remoteCards = new Map();
    for (let index = 0; index < missingNumbers.length; index += 12) {
      const chunk = missingNumbers.slice(index, index + 12);
      const params = new URLSearchParams({
        card: chunk.join(","),
        series: "Digimon Card Game",
        limit: String(chunk.length * 4),
      });
      try {
        const response = await fetch(`${REMOTE_CARD_API_URL}?${params.toString()}`);
        if (!response.ok) continue;
        const payload = await response.json();
        if (!Array.isArray(payload)) continue;
        payload.map(normalizeRemoteCard).filter(Boolean).forEach((card) => {
          if (!remoteCards.has(card.cardNumber)) remoteCards.set(card.cardNumber, card);
        });
      } catch (error) {
        console.warn("Card info fetch failed", error);
      }
      if (index + 12 < missingNumbers.length) await delay(850);
    }
    return remoteCards;
  }

  function enrichImportedCard(card, remoteCards) {
    const cardNumber = normalizeCardNumber(card.cardNumber || card.number || card.no || card.id || "");
    const catalogCard = catalogCardByNumber(cardNumber);
    const remoteCard = remoteCards.get(cardNumber);
    return {
      ...card,
      cardNumber,
      level: normalizeLevel(card.level || catalogCard?.level || remoteCard?.level || ""),
      name: String(catalogCard?.name || remoteCard?.name || card.name || cardNumber).trim(),
      type: cardTypeLabels[catalogCard?.type]
        ? catalogCard.type
        : cardTypeLabels[remoteCard?.type]
          ? remoteCard.type
          : cardTypeLabels[card.type]
            ? card.type
            : "digimon",
    };
  }

  async function enrichImportedDecks(rawDecks) {
    const cardNumbers = rawDecks.flatMap((deck) => deck?.cards || []).map((card) => card.cardNumber || card.number || card.no || card.id || "");
    const remoteCards = await fetchRemoteCardInfo(cardNumbers);
    return rawDecks.map((deck) => ({
      ...deck,
      cards: Array.isArray(deck?.cards) ? deck.cards.map((card) => enrichImportedCard(card, remoteCards)) : [],
    }));
  }

  function importedCardFromLine(cardNumber, count, nameHint, sectionType) {
    const normalizedNumber = normalizeCardNumber(cardNumber);
    if (!normalizedNumber) return null;
    const catalogCard = catalogCardByNumber(normalizedNumber);
    const type = sectionType === "digiEgg" ? "digiEgg" : catalogCard?.type || "digimon";
    const inferredLevel = normalizeLevel(nameHint.match(/lv\.?\s*([0-9])/i)?.[1] || "");
    const name = catalogCard?.name || nameHint.replace(/lv\.?\s*[0-9]/i, "").trim() || normalizedNumber;
    return {
      id: uid("card"),
      cardNumber: normalizedNumber,
      level: catalogCard?.level || inferredLevel || (type === "digiEgg" ? "2" : ""),
      name,
      type,
      count: Math.max(1, Math.min(4, Number(count) || 1)),
    };
  }

  function parseDeckTextLine(line, sectionType) {
    const compact = line.replace(/\s+/g, " ").trim();
    let match = compact.match(/^(\d{1,2})\s*[xX장매]?\s*\(([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\)\s*(.*)$/);
    if (match) return importedCardFromLine(match[2], match[1], match[3] || "", sectionType);

    match = compact.match(/^(\d{1,2})\s*[xX장매]?\s+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s*(.*)$/);
    if (match) return importedCardFromLine(match[2], match[1], match[3] || "", sectionType);

    match = compact.match(/^(\d{1,2})\s*[xX장매]?\s+(.+?)\s+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)$/);
    if (match) return importedCardFromLine(match[3], match[1], match[2] || "", sectionType);

    match = compact.match(/^\(([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\)\s*[xX*]?\s*(\d{1,2})\s*(.*)$/);
    if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

    match = compact.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s*(?:x|\*)\s*(\d{1,2})\s*(.*)$/i);
    if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

    match = compact.match(/^\(([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\)\s*(.*)$/);
    if (match) return importedCardFromLine(match[1], 1, match[2] || "", sectionType);

    match = compact.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s+(.+?)\s*[xX*]\s*(\d{1,2})$/);
    if (match) return importedCardFromLine(match[1], match[3], match[2] || "", sectionType);

    match = compact.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s+(.+?)\s+(\d{1,2})\s*[장매]?$/);
    if (match) return importedCardFromLine(match[1], match[3], match[2] || "", sectionType);

    match = compact.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s+(\d{1,2})\s*(.*)$/);
    if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

    match = compact.match(/^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)+)\s*(.*)$/);
    if (match) return importedCardFromLine(match[1], 1, match[2] || "", sectionType);

    return null;
  }

  function parseDeckTextImport(source, fallbackName) {
    let deckName = fallbackName || "가져온 덱";
    let sectionType = "main";
    const cards = [];
    String(source || "")
      .split(/\r?\n/)
      .forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("//")) return;

        const nameMatch = line.match(/^(?:덱\s*이름|deck\s*name|name)\s*[:：]\s*(.+)$/i);
        if (nameMatch) {
          deckName = nameMatch[1].trim();
          return;
        }
        if (/^(?:메인|메인\s*덱|main|main\s*deck|deck)\b/i.test(line)) {
          sectionType = "main";
          return;
        }
        if (/^(?:디지타마|digi\s*egg|digitama|egg)\b/i.test(line)) {
          sectionType = "digiEgg";
          return;
        }

        const card = parseDeckTextLine(line, sectionType);
        if (card) cards.push(card);
      });

    return [{ name: deckName, colors: ["blue"], note: "", cards }];
  }

  function decksFromJsonImport(parsed, fallbackName) {
    if (Array.isArray(parsed)) {
      if (parsed.every((item) => item && typeof item === "object" && (item.cardNumber || item.no))) {
        return [{ name: fallbackName || "가져온 덱", colors: ["blue"], note: "", cards: parsed }];
      }
      return parsed;
    }
    if (!parsed || typeof parsed !== "object") return [];
    if (Array.isArray(parsed.decks)) return parsed.decks;
    if (parsed.deck) return [parsed.deck];
    if (Array.isArray(parsed.cards)) {
      return [{ name: parsed.name || fallbackName || "가져온 덱", colors: parsed.colors || ["blue"], note: parsed.note || "", cards: parsed.cards }];
    }
    return [];
  }

  function normalizeImportedDeck(rawDeck, fallbackName) {
    const deck = normalizeDeck({
      ...rawDeck,
      id: uid("deck"),
      name: uniqueImportedDeckName(rawDeck?.name || fallbackName || "가져온 덱"),
      colors: Array.isArray(rawDeck?.colors) && rawDeck.colors.length ? rawDeck.colors : ["blue"],
      note: rawDeck?.note || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    deck.id = uid("deck");
    deck.createdAt = new Date().toISOString();
    deck.updatedAt = new Date().toISOString();
    return deck;
  }

  function parseDeckImportSource(source, fallbackName) {
    const text = String(source || "").trim();
    if (!text) return [];
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return decksFromJsonImport(JSON.parse(text), fallbackName);
      } catch (error) {
        return parseDeckTextImport(text, fallbackName);
      }
    }
    return parseDeckTextImport(text, fallbackName);
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

  function drawShareRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fillShareText(ctx, text, x, y, options = {}) {
    const {
      size = 28,
      weight = 800,
      color = "#e8f4f8",
      align = "left",
      baseline = "alphabetic",
      maxWidth,
    } = options;
    ctx.font = `${weight} ${size}px "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(String(text || ""), x, y, maxWidth);
  }

  function wrapShareLines(ctx, text, maxWidth, maxLines = 2) {
    const source = String(text || "").trim();
    if (!source) return [];
    const words = source.split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
        return;
      }
      lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    if (lines.length <= maxLines) return lines;
    const clipped = lines.slice(0, maxLines);
    while (ctx.measureText(`${clipped[maxLines - 1]}...`).width > maxWidth && clipped[maxLines - 1].length > 1) {
      clipped[maxLines - 1] = clipped[maxLines - 1].slice(0, -1);
    }
    clipped[maxLines - 1] = `${clipped[maxLines - 1]}...`;
    return clipped;
  }

  function drawSharePanel(ctx, x, y, width, height, title, rows, rowFormatter, emptyText) {
    drawShareRoundRect(ctx, x, y, width, height, 18);
    ctx.fillStyle = "rgba(4, 10, 20, 0.68)";
    ctx.fill();
    ctx.strokeStyle = "rgba(25, 231, 255, 0.42)";
    ctx.lineWidth = 2;
    ctx.stroke();

    fillShareText(ctx, title, x + 26, y + 42, { size: 26, weight: 900, color: "#ffd21f" });
    ctx.font = '800 24px "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

    const visibleRows = rows.slice(0, 6);
    if (!visibleRows.length) {
      fillShareText(ctx, emptyText, x + 26, y + 94, { size: 24, weight: 700, color: "#8bb9da" });
      return;
    }

    visibleRows.forEach((row, index) => {
      const rowY = y + 91 + index * 43;
      const text = rowFormatter(row);
      const lines = wrapShareLines(ctx, text, width - 52, 1);
      fillShareText(ctx, lines[0], x + 26, rowY, { size: 24, weight: 800, color: "#e8f4f8" });
    });

    if (rows.length > visibleRows.length) {
      fillShareText(ctx, `+${rows.length - visibleRows.length}개 더`, x + 26, y + height - 24, { size: 20, weight: 800, color: "#8bb9da" });
    }
  }

  function drawDailyShareImage(canvas, summary) {
    const ctx = canvas.getContext("2d");
    const width = 1200;
    const height = 675;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(25, 231, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(25, 231, 255, 0.26)");
    gradient.addColorStop(0.46, "rgba(255, 210, 31, 0.12)");
    gradient.addColorStop(1, "rgba(255, 59, 107, 0.16)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawShareRoundRect(ctx, 36, 32, width - 72, height - 64, 24);
    ctx.fillStyle = "rgba(9, 19, 34, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "#19e7ff";
    ctx.lineWidth = 4;
    ctx.stroke();

    fillShareText(ctx, "전적몬", 72, 93, { size: 44, weight: 900, color: "#19e7ff" });
    fillShareText(ctx, "CARD BATTLE LOG", 74, 126, { size: 18, weight: 900, color: "#ffd21f" });
    fillShareText(ctx, shareDateTitle(summary.date), width - 78, 92, { size: 32, weight: 900, color: "#e8f4f8", align: "right" });

    const stats = summary.stats;
    fillShareText(ctx, shareRecordText(stats), 72, 204, { size: 54, weight: 900, color: "#ffffff" });
    fillShareText(ctx, `승률 ${shareRateText(stats.wins, stats.total)}`, 72, 253, { size: 32, weight: 900, color: "#ffd21f" });
    const ringX = 1000;
    const ringY = 218;
    const radius = 82;
    const rate = stats.total ? stats.wins / stats.total : 0;
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(119, 160, 201, 0.24)";
    ctx.beginPath();
    ctx.arc(ringX, ringY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#19e7ff";
    ctx.beginPath();
    ctx.arc(ringX, ringY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rate);
    ctx.stroke();
    fillShareText(ctx, shareRateText(stats.wins, stats.total), ringX, ringY + 9, { size: 34, weight: 900, color: "#ffffff", align: "center", baseline: "middle" });

    drawSharePanel(
      ctx,
      72,
      306,
      498,
      244,
      "사용 덱",
      summary.decks,
      (row) => `${row.label} ${shareScoreText(row)}${hasMatchGameBreakdown(row) ? ` / G ${shareGameScoreText(row)}` : ""} (${shareRateText(row.wins, row.total)})`,
      "덱 기록 없음"
    );
    drawSharePanel(
      ctx,
      612,
      306,
      516,
      244,
      "상대별 기록",
      summary.matchups,
      (row) => `vs ${row.opponent} ${shareScoreText(row)}${hasMatchGameBreakdown(row) ? ` / G ${shareGameScoreText(row)}` : ""}`,
      "상대 기록 없음"
    );

    fillShareText(ctx, "#디지몬카드게임 #전적몬", 72, height - 72, { size: 26, weight: 900, color: "#ffd21f" });
    fillShareText(ctx, "jeonjeokmon", width - 72, height - 72, { size: 20, weight: 900, color: "#8bb9da", align: "right" });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("blob read failed"));
      reader.readAsDataURL(blob);
    });
  }

  function loadImageElement(src) {
    if (!src) return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };
      const timer = window.setTimeout(() => done(null), CARD_IMAGE_LOAD_TIMEOUT_MS);
      image.onload = () => {
        done(image);
      };
      image.onerror = () => {
        done(null);
      };
      if (!String(src).startsWith("data:")) image.crossOrigin = "anonymous";
      image.src = src;
    });
  }

  async function loadShareCardImage(src) {
    if (!src) return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), CARD_IMAGE_LOAD_TIMEOUT_MS) : null;
    try {
      const response = await fetch(src, { cache: "no-store", signal: controller?.signal });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return null;
      return await loadImageElement(await blobToDataUrl(blob));
    } catch (error) {
      recordDiagnostic("share-image-fetch-failed", error?.message || "Image fetch failed", { src });
      return loadImageElement(src);
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  }

  async function loadFirstShareCardImage(sources) {
    for (const src of sources) {
      const image = await loadShareCardImage(src);
      if (image) return image;
    }
    return null;
  }

  async function inspectDeckImages(deck) {
    const cards = sortDeckCards(deckCards(deck));
    const entries = await Promise.all(
      cards.map(async (card) => {
        const image = await loadFirstShareCardImage(shareCardImageSources(card));
        return [normalizeCardNumber(card.cardNumber), { card, image }];
      })
    );
    const images = new Map(entries.map(([cardNumber, entry]) => [cardNumber, entry.image]));
    const missingCards = entries.filter(([, entry]) => !entry.image).map(([, entry]) => entry.card);
    return { images, missingCards, missingImageCount: missingCards.length };
  }

  function drawShareCardImage(ctx, image, x, y, width, height) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const sourceRatio = imageWidth / imageHeight;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = imageWidth;
    let sourceHeight = imageHeight;

    if (sourceRatio > targetRatio) {
      sourceWidth = imageHeight * targetRatio;
      sourceX = (imageWidth - sourceWidth) / 2;
    } else {
      sourceHeight = imageWidth / targetRatio;
      sourceY = (imageHeight - sourceHeight) / 2;
    }

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function drawDeckSharePlaceholder(ctx, card, x, y, width, height) {
    const color = colorMap[card.color] || "#94a3b8";
    ctx.save();
    drawShareRoundRect(ctx, x, y, width, height, 10);
    ctx.clip();
    ctx.fillStyle = "#07101e";
    ctx.fill();
    const placeholderGradient = ctx.createLinearGradient(x, y, x + width, y + height);
    placeholderGradient.addColorStop(0, "rgba(25, 231, 255, 0.34)");
    placeholderGradient.addColorStop(0.52, "rgba(2, 8, 18, 0.82)");
    placeholderGradient.addColorStop(1, "rgba(255, 210, 31, 0.28)");
    ctx.fillStyle = placeholderGradient;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    for (let lineX = x - height; lineX < x + width; lineX += 22) {
      ctx.fillRect(lineX, y, 2, height * 1.8);
    }
    ctx.restore();

    fillShareText(ctx, normalizeCardNumber(card.cardNumber), x + width / 2, y + height * 0.34, {
      size: Math.max(16, Math.round(width * 0.13)),
      weight: 900,
      color: "#ffffff",
      align: "center",
      baseline: "middle",
      maxWidth: width - 18,
    });
    wrapShareLines(ctx, card.name, width - 20, 2).forEach((line, index) => {
      fillShareText(ctx, line, x + width / 2, y + height * 0.52 + index * 24, {
        size: Math.max(13, Math.round(width * 0.09)),
        weight: 800,
        color: "#e8f4f8",
        align: "center",
        baseline: "middle",
        maxWidth: width - 18,
      });
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    drawShareRoundRect(ctx, x + 1.5, y + 1.5, width - 3, height - 3, 8);
    ctx.stroke();
  }

  function drawDeckShareCard(ctx, card, image, x, y, width, height) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.46)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    drawShareRoundRect(ctx, x, y, width, height, 10);
    ctx.clip();
    if (image) drawShareCardImage(ctx, image, x, y, width, height);
    else drawDeckSharePlaceholder(ctx, card, x, y, width, height);
    ctx.restore();

    ctx.strokeStyle = image ? "rgba(232, 244, 248, 0.72)" : "rgba(25, 231, 255, 0.86)";
    ctx.lineWidth = 3;
    drawShareRoundRect(ctx, x, y, width, height, 10);
    ctx.stroke();

    const badgeSize = Math.max(30, Math.round(width * 0.24));
    const badgeX = x + width - badgeSize / 2 - 8;
    const badgeY = y + badgeSize / 2 + 8;
    ctx.fillStyle = "#ffd21f";
    ctx.strokeStyle = "#04101d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    fillShareText(ctx, `x${Number(card.count) || 0}`, badgeX, badgeY + 1, {
      size: Math.max(15, Math.round(width * 0.12)),
      weight: 900,
      color: "#08111f",
      align: "center",
      baseline: "middle",
    });
  }

  function deckShareImageLayoutOptions(layout, cardCount) {
    if (layout === "archive") {
      return { columns: 10, width: 1600, padding: 40, gap: 10, headerHeight: 96, sectionHeader: 40, sectionGap: 24 };
    }
    const columns = cardCount > 42 ? 16 : cardCount > 30 ? 14 : cardCount > 24 ? 12 : 10;
    return { columns, width: 1600, padding: 38, gap: 8, headerHeight: 86, sectionHeader: 34, sectionGap: 18 };
  }

  async function drawDeckShareImage(canvas, deck, date, options = {}) {
    const ctx = canvas.getContext("2d");
    const cards = sortDeckCards(deckCards(deck));
    const mainCards = cards.filter((card) => card.type !== "digiEgg");
    const eggCards = cards.filter((card) => card.type === "digiEgg");
    const selectedLayout = options.layout || state.deckImageLayout || "x";
    const layout = deckShareImageLayoutOptions(selectedLayout, cards.length);
    const { columns, width, padding, gap, headerHeight, sectionHeader, sectionGap } = layout;
    const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
    const cardHeight = cardWidth * 1.4;
    const eggSectionGap = eggCards.length ? sectionGap : 0;
    const mainRows = Math.max(1, Math.ceil(mainCards.length / columns));
    const eggRows = eggCards.length ? Math.ceil(eggCards.length / columns) : 0;
    const summary = deckCountSummary(cards);
    const calculatedHeight = Math.ceil(
      padding +
        headerHeight +
        sectionHeader +
        mainRows * cardHeight +
        Math.max(0, mainRows - 1) * gap +
        eggSectionGap +
        (eggRows ? sectionHeader + eggRows * cardHeight + Math.max(0, eggRows - 1) * gap : 0) +
        padding
    );
    const height = selectedLayout === "x" ? Math.max(900, calculatedHeight) : calculatedHeight;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(25, 231, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const deckGradient = ctx.createLinearGradient(0, 0, width, height);
    deckGradient.addColorStop(0, "rgba(25, 231, 255, 0.24)");
    deckGradient.addColorStop(0.48, "rgba(255, 210, 31, 0.09)");
    deckGradient.addColorStop(1, "rgba(255, 59, 107, 0.16)");
    ctx.fillStyle = deckGradient;
    ctx.fillRect(0, 0, width, height);

    fillShareText(ctx, deck.name || "이름 없는 덱", padding, selectedLayout === "archive" ? 56 : 52, {
      size: selectedLayout === "archive" ? 40 : 38,
      weight: 900,
      color: "#ffffff",
      maxWidth: width - padding * 2 - 300,
    });
    fillShareText(ctx, `${date} · 메인 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg}`, padding, selectedLayout === "archive" ? 96 : 88, {
      size: selectedLayout === "archive" ? 24 : 22,
      weight: 900,
      color: "#ffd21f",
    });
    fillShareText(ctx, "전적몬", width - padding, selectedLayout === "archive" ? 60 : 56, { size: selectedLayout === "archive" ? 38 : 36, weight: 900, color: "#19e7ff", align: "right" });
    fillShareText(ctx, "DECK IMAGE", width - padding, selectedLayout === "archive" ? 98 : 90, { size: 18, weight: 900, color: "#8bb9da", align: "right" });

    const images =
      options.preloadedImages instanceof Map
        ? options.preloadedImages
        : new Map(
            await Promise.all(cards.map(async (card) => [normalizeCardNumber(card.cardNumber), await loadFirstShareCardImage(shareCardImageSources(card))]))
          );
    const missingImageCount = cards.filter((card) => !images.get(normalizeCardNumber(card.cardNumber))).length;

    let cursorY = padding + headerHeight;
    const drawSection = (title, sectionCards) => {
      fillShareText(ctx, title, padding, cursorY + 28, {
        size: 26,
        weight: 900,
        color: "#ffd21f",
      });
      cursorY += sectionHeader;
      sectionCards.forEach((card, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + col * (cardWidth + gap);
        const y = cursorY + row * (cardHeight + gap);
        drawDeckShareCard(ctx, card, images.get(normalizeCardNumber(card.cardNumber)), x, y, cardWidth, cardHeight);
      });
      const rows = Math.max(1, Math.ceil(sectionCards.length / columns));
      cursorY += rows * cardHeight + Math.max(0, rows - 1) * gap;
    };

    drawSection("메인 덱", mainCards);
    if (eggCards.length) {
      cursorY += eggSectionGap;
      drawSection("디지타마 덱", eggCards);
    }
    if (missingImageCount) {
      fillShareText(ctx, `이미지 대체 표시 ${missingImageCount}종`, width - padding, height - 18, {
        size: 16,
        weight: 900,
        color: "#ffd21f",
        align: "right",
      });
    }
    return { missingImageCount, width, height, layout: selectedLayout };
  }

  function canvasDownloadUrl(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else resolve(canvas.toDataURL("image/png"));
        }, "image/png");
      } catch (error) {
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (fallbackError) {
          reject(fallbackError);
        }
      }
    });
  }

  async function downloadCanvasPng(canvas, fileName) {
    const downloadUrl = await canvasDownloadUrl(canvas);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.click();
    if (String(downloadUrl).startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  async function downloadDeckImage(deck, date = todayISO(), options = {}) {
    const { notify = true } = options;
    const printableDeck = normalizeDeck(deck || {});
    const cards = deckCards(printableDeck);
    if (!cards.length) {
      if (notify) notifyToast("저장할 카드 없음", "덱에 카드가 없습니다. 먼저 덱을 구성해 주세요.", "info");
      return false;
    }
    try {
      const inspection = await inspectDeckImages(printableDeck);
      if (notify && inspection.missingImageCount) {
        recordDiagnostic("deck-image-missing", `${inspection.missingImageCount} card images missing`, {
          deckId: printableDeck.id || "",
          deckName: printableDeck.name || "",
          cards: inspection.missingCards.slice(0, 10).map((card) => normalizeCardNumber(card.cardNumber)),
        });
        const examples = inspection.missingCards.slice(0, 5).map(cardDisplayName).join(", ");
        const extra = inspection.missingImageCount > 5 ? ` 외 ${inspection.missingImageCount - 5}종` : "";
        const shouldContinue = confirm(
          `카드 이미지 ${inspection.missingImageCount}종을 불러오지 못했습니다.\n${examples}${extra}\n\n대체 카드로 표시해서 저장할까요?`
        );
        if (!shouldContinue) {
          notifyToast("덱 이미지 저장 취소", "이미지가 준비되지 않은 카드를 확인한 뒤 다시 시도해 주세요.", "info");
          return false;
        }
      } else if (notify) {
        notifyToast("카드 이미지 준비 완료", `${cards.length}종 카드 이미지를 확인했습니다.`, "success", 1600);
      }
      const canvas = document.createElement("canvas");
      const layout = options.layout || state.deckImageLayout || "x";
      const result = await drawDeckShareImage(canvas, printableDeck, date, { layout, preloadedImages: inspection.images });
      const suffix = layout === "archive" ? "large" : "x";
      const fileName = `jeonjeokmon-${safeFileName(printableDeck.name)}-${date}-${suffix}.png`;
      await downloadCanvasPng(canvas, fileName);
      if (notify) {
        notifyToast(
          "덱 이미지 저장",
          result?.missingImageCount ? `${fileName} · 이미지 ${result.missingImageCount}종은 대체 카드로 표시됨` : fileName,
          result?.missingImageCount ? "warning" : "success"
        );
      }
      return true;
    } catch (error) {
      recordDiagnostic("deck-image-download-failed", error?.message || "Deck image download failed", {
        deckId: printableDeck.id || "",
        deckName: printableDeck.name || "",
      });
      if (notify) notifyToast("이미지 저장 실패", "카드 이미지 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", "warning");
      return false;
    }
  }

  async function downloadDailyShareImage(date = shareDateValue()) {
    const summary = dailyShareSummary(date);
    if (!summary.stats.total) {
      notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
      return;
    }
    const decks = dailyShareUsedDecks(summary);
    if (!decks.length) {
      notifyToast("저장할 덱 없음", "선택한 날짜의 전적에 저장된 덱 정보가 없습니다.", "info");
      return;
    }
    try {
      let savedCount = 0;
      for (const deck of decks) {
        if (await downloadDeckImage(deck, date, { notify: false })) savedCount += 1;
      }
      if (savedCount) {
        notifyToast("사용 덱 이미지 저장", savedCount === 1 ? "덱 이미지 1장을 저장했습니다." : `덱 이미지 ${savedCount}장을 저장했습니다.`, "success");
      } else {
        notifyToast("이미지 저장 실패", "저장할 수 있는 덱 이미지를 만들지 못했습니다.", "warning");
      }
    } catch (error) {
      notifyToast("이미지 저장 실패", "카드 이미지 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", "warning");
    }
  }

  function openDailyShareX() {
    const text = dailyShareText();
    if (!text) {
      notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
      return;
    }
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    const opened = window.open(url, "_blank");
    if (opened) {
      opened.opener = null;
      return;
    }
    copyDailyShareText();
    notifyToast("팝업이 차단됨", "공유문을 복사했으니 X에 붙여넣어 주세요.", "info");
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

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.id === "match-form") handleMatchSubmit(event.target, event.submitter);
    if (event.target.id === "tournament-form") handleTournamentSubmit(event.target);
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
