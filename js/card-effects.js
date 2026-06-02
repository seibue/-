/**
 * 전적몬 — 카드 효과 번역/조회/캐시 모듈 (모듈 분리 A4)
 *
 * - 모듈 레벨(순수): normalizeEffectText, autoTranslateEffectText (영문 효과 → 한글 자동 변환)
 * - createCardEffects(deps): 원격/정발 효과 조회 + 캐시 + 화면 갱신을 의존성 주입으로 연결
 *
 * 노출:
 *  - 브라우저: window.JJM.cardEffects = { createCardEffects, normalizeEffectText, autoTranslateEffectText }
 *  - Node(테스트): module.exports 동일
 *
 * 참고: loadCardEffectCache 는 state 초기화 시점에 필요해 app.js에 그대로 둔다.
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

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

  function createCardEffects(deps) {
    const {
      normalizeCardNumber,
      render,
      renderKeepingDeckScroll,
      state,
      effectLoadingCards,
      CARD_EFFECT_CACHE_KEY,
      REMOTE_CARD_API_URL,
      KOREAN_CARD_EFFECTS,
    } = deps;

    function saveCardEffectCache() {
      localStorage.setItem(CARD_EFFECT_CACHE_KEY, JSON.stringify(state.cardEffectCache));
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

    return {
      saveCardEffectCache,
      normalizeRemoteEffect,
      fetchCardEffect,
      staticKoreanOfficialEffect,
      fetchKoreanOfficialEffect,
      fetchAndCacheCardEffect,
    };
  }

  const api = { createCardEffects, normalizeEffectText, autoTranslateEffectText };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.cardEffects = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
