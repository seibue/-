/**
 * js/lookups.js — 덱/대회 조회·라운드 라벨 헬퍼 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존" 원칙으로 분리했습니다. 순수 조회/파생 로직만 모았고,
 * render/handleAction/toast 같은 부수효과에는 의존하지 않습니다.
 *
 * DI: data는 재할당되므로 반드시 getData() 게터로 매번 최신값을 읽습니다.
 * 상수(TOURNAMENT_FORMAT_OPTIONS/ROUND_STAGE_OPTIONS/TEAM3_MATCH_TYPE)와 topCutLabels(format)는 주입.
 *
 * - 브라우저: window.JJM.lookups.createLookups(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createLookups(deps) {
    const { getData, TOURNAMENT_FORMAT_OPTIONS, ROUND_STAGE_OPTIONS, TEAM3_MATCH_TYPE, topCutLabels } = deps;

    function getDeck(id) {
      return getData().decks.find((deck) => deck.id === id);
    }

    function deckName(id) {
      return getDeck(id)?.name || "삭제된 덱";
    }

    function getTournament(id) {
      return getData().tournaments.find((tournament) => tournament.id === id);
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
      return [...getData().tournaments].sort((a, b) =>
        `${b.date || ""}${b.createdAt || ""}`.localeCompare(`${a.date || ""}${a.createdAt || ""}`)
      );
    }

    function tournamentMatches(tournamentId) {
      return getData()
        .matches.filter((match) => match.tournamentId === tournamentId)
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
    function tournamentTopCut(tournamentId) {
      const cut = Number(getTournament(tournamentId)?.topCut);
      return [2, 4, 8, 16, 32, 64, 128].includes(cut) ? cut : 4;
    }

    // 3대3 자리(A/B/C)는 대회당 한 번만 정하면 되게, 같은 대회의 직전 3대3 라운드 자리를 이어받는다.
    function suggestedTeamPosition(tournamentId) {
      if (!tournamentId) return "";
      const prior = tournamentMatches(tournamentId)
        .filter((match) => match.matchType === TEAM3_MATCH_TYPE && match.teamPosition)
        .pop();
      return prior?.teamPosition || "";
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

    return {
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
    };
  }

  const api = { createLookups };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.lookups = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
