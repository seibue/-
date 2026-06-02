/**
 * 전적몬 — 통계/매치업 계산 모듈 (트랙 B, 안전 도메인 분리)
 *
 * 전적 집계·덱별/상대별 승률·대회 스테이지 요약 등 순수 계산 로직을 모았다.
 * 렌더링/DOM 은 포함하지 않으며, data/state 접근은 의존성 주입으로 연결한다.
 *
 * 노출:
 *  - 브라우저: window.JJM.stats = { createStats }
 *  - Node(테스트): module.exports 동일
 *
 * data 는 재할당되므로 getData() 게터로, state 는 참조로 주입한다.
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function createStats(deps) {
    const {
      getData,
      state,
      deckName,
      matchDateTime,
      shareRecordText,
      emptyRecordStats,
      addMatchToStats,
      finalizeRecordStats,
    } = deps;

    function statsFromMatches(matches) {
      const stats = emptyRecordStats();
      matches.forEach((match) => addMatchToStats(stats, match));
      return finalizeRecordStats(stats);
    }

    function statsForDeckCard(deckId, card) {
      const matches = getData().matches.filter((match) => match.deckId === deckId);
      return statsFromMatches(matches);
    }

    function statsForDeck(deckId) {
      const matches = getData().matches.filter((match) => match.deckId === deckId);
      return statsFromMatches(matches);
    }

    function summaryStats() {
      return statsFromMatches(getData().matches);
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

      getData().matches.forEach((match) => {
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
      return getData()
        .matches.filter((match) => match.deckId === deckId && matchupOpponentKey(match.opponent) === opponentKey)
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

    return {
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
    };
  }

  const api = { createStats };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.stats = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
