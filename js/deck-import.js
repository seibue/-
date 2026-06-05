/**
 * 전적몬 — 덱 가져오기(import) 파서/정규화/원격조회 모듈 (트랙 B, 안전 도메인 분리)
 *
 * - 모듈 레벨(순수): apiCardType, delay
 * - createDeckImport(deps): 텍스트/JSON 덱 파싱 + 카드 정보 보강 + 정규화를 DI로 연결
 *
 * 노출:
 *  - 브라우저: window.JJM.deckImport = { createDeckImport, apiCardType }
 *  - Node(테스트): module.exports 동일
 *
 * 참고: handleDeckImportSubmit / readDeckImportFile (DOM·data 변형)과
 * catalogCardByNumber(프리뷰 공용)는 app.js에 그대로 둔다.
 * data 는 재할당되므로 getData() 게터로 주입받는다.
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

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

  function createDeckImport(deps) {
    const {
      normalizeCardNumber,
      normalizeLevel,
      remoteCardImageUrl,
      uid,
      normalizeDeck,
      catalogCardByNumber,
      getData,
      cardTypeLabels,
      REMOTE_CARD_API_URL,
    } = deps;

    function uniqueImportedDeckName(name) {
      const base = String(name || "가져온 덱").trim() || "가져온 덱";
      const existingNames = new Set(getData().decks.map((deck) => deck.name));
      if (!existingNames.has(base)) return base;
      let index = 2;
      while (existingNames.has(`${base} ${index}`)) index += 1;
      return `${base} ${index}`;
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
      let match = compact.match(/^(\d{1,2})\s*[xX장매]?\s*\(([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\)\s*(.*)$/);
      if (match) return importedCardFromLine(match[2], match[1], match[3] || "", sectionType);

      match = compact.match(/^(\d{1,2})\s*[xX장매]?\s+([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s*(.*)$/);
      if (match) return importedCardFromLine(match[2], match[1], match[3] || "", sectionType);

      match = compact.match(/^(\d{1,2})\s*[xX장매]?\s+(.+?)\s+([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)$/);
      if (match) return importedCardFromLine(match[3], match[1], match[2] || "", sectionType);

      match = compact.match(/^\(([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\)\s*[xX*]?\s*(\d{1,2})\s*(.*)$/);
      if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

      match = compact.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s*(?:x|\*)\s*(\d{1,2})\s*(.*)$/i);
      if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

      match = compact.match(/^\(([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\)\s*(.*)$/);
      if (match) return importedCardFromLine(match[1], 1, match[2] || "", sectionType);

      match = compact.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s+(.+?)\s*[xX*]\s*(\d{1,2})$/);
      if (match) return importedCardFromLine(match[1], match[3], match[2] || "", sectionType);

      match = compact.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s+(.+?)\s+(\d{1,2})\s*[장매]?$/);
      if (match) return importedCardFromLine(match[1], match[3], match[2] || "", sectionType);

      match = compact.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s+(\d{1,2})\s*(.*)$/);
      if (match) return importedCardFromLine(match[1], match[2], match[3] || "", sectionType);

      match = compact.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+)\s*(.*)$/);
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
          // 헤더 뒤 경계는 \b 대신 (?=\s|$) 사용 — \b 는 한글 뒤에서 매칭되지 않아
          // "메인"/"디지타마" 같은 한국어 단독 헤더가 인식되지 않던 버그를 수정.
          // 또한 공식 표기 "Digi-Egg" 처럼 하이픈으로 구분된 헤더도 인식하도록 [\s-]* 허용.
          if (/^(?:메인\s*덱|메인|main[\s-]*deck|main|deck)(?=\s|$)/i.test(line)) {
            sectionType = "main";
            return;
          }
          if (/^(?:디지타마|digi[\s-]*egg|digi[\s-]*tama|egg)(?=\s|$)/i.test(line)) {
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
        // digimonmeta 형식: 카드 번호 문자열 배열(헤더 + 번호가 매수만큼 반복).
        // 예: ["Exported from digimonmeta.com","EX5-001","EX5-001",...] → 번호별 매수 집계
        if (parsed.some((item) => typeof item === "string")) {
          const counts = new Map();
          parsed.forEach((item) => {
            const cardNumber = String(item || "").trim().toUpperCase();
            if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(cardNumber)) return; // "Exported from..." 같은 헤더/잡문자 제외
            counts.set(cardNumber, (counts.get(cardNumber) || 0) + 1);
          });
          if (counts.size) {
            const cards = [...counts.entries()].map(([cardNumber, count]) => ({ cardNumber, count }));
            return [{ name: fallbackName || "가져온 덱", colors: ["blue"], note: "", cards }];
          }
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

    return {
      uniqueImportedDeckName,
      normalizeRemoteCard,
      fetchRemoteCardInfo,
      enrichImportedCard,
      enrichImportedDecks,
      importedCardFromLine,
      parseDeckTextLine,
      parseDeckTextImport,
      decksFromJsonImport,
      normalizeImportedDeck,
      parseDeckImportSource,
    };
  }

  const api = { createDeckImport, apiCardType };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.deckImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
