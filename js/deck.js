/**
 * 전적몬 — 덱 편집(draft) 로직 모듈 (트랙 B, 안전 도메인 분리)
 *
 * 덱 구성 중 카드 추가/증감, 투입 가능 매수 계산, 구축 준비도 판정, 복제 등
 * "덱 편집" 도메인 로직을 모았다. 렌더링/DOM 은 포함하지 않는다.
 *
 * 공용 유틸(deckCards/deckCountSummary/deckLimitViolation)은 다른 모듈에도 주입되어
 * app.js에 그대로 두고, 여기서는 주입받아 사용한다(팩토리 생성 순서 충돌 방지).
 *
 * 노출:
 *  - 브라우저: window.JJM.deck = { createDeck }
 *  - Node(테스트): module.exports 동일
 *
 * data 는 재할당되므로 getData() 게터로, state 는 참조로 주입한다.
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function createDeck(deps) {
    const {
      normalizeCards,
      normalizeCardNumber,
      normalizeLevel,
      uid,
      cardTypeLabels,
      DECK_LIMITS,
      state,
      getData,
      deckCards,
      deckCountSummary,
      deckLimitViolation,
    } = deps;

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

    function uniqueDeckName(name) {
      const base = `${name || "이름 없는 덱"} 복사본`;
      const existing = new Set(getData().decks.map((deck) => deck.name));
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

    return {
      catalogCardToDraft,
      deckLevelCounts,
      cardNumberOverLimit,
      availableCopiesForCard,
      addDraftCard,
      changeDraftCardCount,
      deckReadiness,
      uniqueDeckName,
      cloneDeck,
    };
  }

  const api = { createDeck };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.deck = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
