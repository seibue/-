/**
 * js/catalog.js — 카드번호/카탈로그 정규화 순수 헬퍼 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리. 부수효과 0, 순수 변환만.
 * store/deck-import/stats/deck 팩토리가 normalizeCardNumber/normalizeLevel을 주입받으므로
 * app.js에서 store 팩토리보다 먼저 생성해야 한다.
 *
 * DI: cardTypeLabels(상수 맵)만 주입. 나머지는 순수.
 *
 * - 브라우저: window.JJM.catalog.createCatalog(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createCatalog(deps) {
    const { cardTypeLabels } = deps;

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

    return {
      normalizeCardNumber,
      normalizeCatalogQuery,
      normalizeLevel,
      createDefaultDeckCardFilters,
      normalizeCatalogCard,
    };
  }

  const api = { createCatalog };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.catalog = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
