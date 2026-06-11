/**
 * js/views-tournaments.js — 대회 기록 탭 뷰(렌더) 함수군.
 * app.js 에서 createTournamentViews(deps) 로 의존성을 주입받아 사용한다.
 * 순수 이동(동작 보존): data/state 직접 참조 없음(헬퍼 경유).
 */
(function (global) {
  function createTournamentViews(deps) {
    const {
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
    } = deps;

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
    const recent = [...matches].reverse();
    const nextAction = tournamentNextActionText(tournament);
    const progress = tournamentRoundProgress(tournament);
    const finalSummary = tournamentFinalSummaryText(tournament);
    const roundList = recent.length
      ? `<div class="tournament-round-list">
          ${recent
            .map(
              (match) => `
                <div class="tournament-round-item">
                  <span class="round-item-text">${escapeHTML(roundText(match) || "일반")} · vs ${escapeHTML(match.opponent || "상대 미기록")} · ${escapeHTML(
                    match.matchFormat === "match" ? matchScoreValue(match) : resultLabel(match.result)
                  )}</span>
                  <button class="round-item-edit" type="button" title="이 전적 수정" data-action="edit-match" data-id="${escapeHTML(match.id)}">✎</button>
                </div>
              `
            )
            .join("")}
        </div>`
      : "";
    const memo = tournament.memo ? `<p class="match-memo">${escapeHTML(tournament.memo)}</p>` : "";
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
        </div>
        <div class="card-actions">
          <button class="icon-button text-icon" type="button" title="이 대회 전적 추가" data-action="open-match-for-tournament" data-id="${escapeHTML(tournament.id)}">${escapeHTML(nextAction)}</button>
          ${tournamentStageActionButton(tournament, "swiss", "스위스")}
          ${tournamentStageActionButton(tournament, "top", "토너먼트", "gold")}
          <button class="icon-button" type="button" title="수정" aria-label="대회 수정" data-action="edit-tournament" data-id="${escapeHTML(tournament.id)}">✎</button>
          <button class="icon-button" type="button" title="삭제" aria-label="대회 삭제" data-action="delete-tournament" data-id="${escapeHTML(tournament.id)}">×</button>
        </div>
        ${roundList}
        ${memo}
      </article>
    `;
  }

    return { renderTournamentsView, renderTournamentFlowCard, renderTournamentDateSections, renderTournamentCard };
  }

  const api = { createTournamentViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsTournaments = api;
})(typeof window !== "undefined" ? window : globalThis);
