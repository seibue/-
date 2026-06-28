/**
 * 전적몬 — 데이터 정규화 레이어 모듈 (트랙 B: store 코어 분리, 안전 슬라이스)
 *
 * localStorage/클라우드에서 들어온 원시 데이터를 앱이 신뢰할 수 있는 형태로 정규화한다.
 * 로드/저장/병합·클라우드 동기화의 정합성을 좌우하는, 가장 검증 가치 높은 순수 로직.
 *
 * 노출:
 *  - 브라우저: window.JJM.store.createStore(deps)
 *  - Node(테스트): module.exports 동일
 *
 * createDefaultData/createDemoData/loadData(IO)와 normalizeCardNumber/normalizeLevel(공용 유틸)은
 * app.js에 그대로 두고 주입받는다. 동작을 바꾸지 말 것 — 함수 이동만, 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function createStore(deps) {
    const {
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
    } = deps;

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
        // 개인 일정(본인만 보이는 대회/메모) — per-user 데이터 블록에 저장돼 RLS로 보호·기기 간 동기화
        personalEvents: normalizePersonalEvents(saved.personalEvents),
      };
    }

    function normalizePersonalEvent(event) {
      if (!event || typeof event !== "object") return null;
      const title = String(event.title || "").trim();
      const startsAt = String(event.startsAt || event.starts_at || "").trim();
      if (!title || !startsAt || Number.isNaN(new Date(startsAt).getTime())) return null;
      const endsAtRaw = String(event.endsAt || event.ends_at || "").trim();
      const endsAt = endsAtRaw && !Number.isNaN(new Date(endsAtRaw).getTime()) ? endsAtRaw : "";
      return {
        id: event.id || uid("pevt"),
        title,
        startsAt,
        endsAt,
        location: String(event.location || "").trim(),
        description: String(event.description || "").trim(),
      };
    }

    function normalizePersonalEvents(events) {
      if (!Array.isArray(events)) return [];
      return events.map(normalizePersonalEvent).filter(Boolean);
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
        // 스위스 후 토너먼트(컷) 시작 규모. 2(결승만)/4/8/16/32/64. 미설정 시 기존 동작(4강) 유지.
        topCut: [2, 4, 8, 16, 32, 64].includes(Number(tournament.topCut)) ? Number(tournament.topCut) : 4,
        createdAt: tournament.createdAt || new Date().toISOString(),
        updatedAt: tournament.updatedAt || tournament.createdAt || new Date().toISOString(),
      };
    }

    function normalizeDeckVersions(versions) {
      if (!Array.isArray(versions)) return [];
      return versions
        .filter((version) => version && typeof version === "object")
        .map((version) => ({
          id: version.id || uid("dver"),
          label: String(version.label || "").trim(),
          cards: normalizeCards(version.cards),
          createdAt: version.createdAt || new Date().toISOString(),
        }))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    function normalizeDeck(deck) {
      return {
        id: deck.id || uid("deck"),
        name: deck.name || "이름 없는 덱",
        colors: Array.isArray(deck.colors) && deck.colors.length ? deck.colors : ["blue"],
        note: deck.note || "",
        cards: normalizeCards(deck.cards),
        versions: normalizeDeckVersions(deck.versions),
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
          // 선택한 일러스트(패럴렐) 접미사. "" = 기본, "_P1"·"_P2"… = 패럴렐
          art: /^_P\d+$/.test(String(card.art || "")) ? card.art : "",
        };
        const existing = merged.get(cardNumber);
        if (existing) {
          existing.count = Math.min(4, existing.count + normalized.count);
          existing.level = normalized.level || existing.level;
          existing.name = normalized.name || existing.name;
          existing.type = normalized.type || existing.type;
          if (normalized.art) existing.art = normalized.art;
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

    return {
      mergeData,
      normalizeMatchTypeName,
      normalizeMatchTypes,
      normalizeTournament,
      normalizeDeck,
      normalizeDeckVersions,
      normalizeCards,
      normalizeMatch,
      normalizePersonalEvents,
    };
  }

  const api = { createStore };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.store = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
