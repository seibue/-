/**
 * js/views-stats.js — 통계 탭 뷰(렌더) 함수군.
 * app.js 에서 createStatsViews(deps) 로 의존성을 주입받아 사용한다.
 * 순수 이동(동작 보존): app.js 에 있던 함수를 그대로 옮기고 data.* → getData().* 로만 변경.
 */
(function (global) {
  function createStatsViews(deps) {
    const {
      escapeHTML,
      formatDate,
      resultLabel,
      resultShortLabel,
      playOrderLabel,
      state,
      getData,
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
    } = deps;

  function renderStatsPeriodChips() {
    const active = statsPeriodFromValue(state.statsPeriod);
    return `
      <div class="stats-period-row">
        ${STATS_PERIODS.map(
          ([key, label]) => `
            <button class="control-button ${key === active ? "active" : ""}" type="button" data-action="set-stats-period" data-period="${key}">${label}</button>
          `
        ).join("")}
      </div>
    `;
  }

  function renderMetaDashboardCard(metaRows) {
    if (!metaRows.length) return "";
    const top = metaRows[0];
    return `
      <div class="settings-card" style="margin-top: 12px;">
        <div class="settings-title-row">
          <h2 class="settings-title">메타 대시보드</h2>
          <span class="sync-badge ok">테스트 플레이 제외</span>
        </div>
        <div class="mini-text">선택한 기간에 가장 많이 만난 상대 덱과 승률입니다. 무엇을 대비해 덱을 짤지 참고하세요.</div>
        <div class="bar-list">
          ${metaRows
            .map((row) => renderBar(`vs ${row.opponent}`, `${row.total}전 · ${row.wins}승 ${row.losses}패${row.draws ? ` ${row.draws}무` : ""} · 승률 ${row.rate}%`, row.rate))
            .join("")}
        </div>
        <div class="mini-text" style="margin-top: 8px;">최다 상대: <strong>${escapeHTML(top.opponent)}</strong> (${top.total}전)</div>
      </div>
    `;
  }

  function renderStatsView() {
    const scoped = statsScopedMatches();
    const stats = statsFromMatches(scoped);
    const deckRows = getData().decks
      .map((deck) => ({ deck, stats: statsFromMatches(scoped.filter((match) => match.deckId === deck.id)) }))
      .filter((row) => row.stats.total > 0)
      .sort((a, b) => b.stats.total - a.stats.total);
    const typeRows = getData().matchTypes
      .map((type) => {
        const total = scoped.filter((match) => match.matchType === type).length;
        return { type, total };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const metaRows = opponentMetaRows(
      scoped.filter((match) => !META_EXCLUDED_MATCH_TYPES.includes(match.matchType)),
      8
    );
    const selectedMatchupDeckId = validMatchupDeckId(deckRows);
    const matchupRows = deckMatchupRows(selectedMatchupDeckId, 0, scoped);
    const selectedMatchupOpponent = validMatchupOpponent(matchupRows);
    // 3대3 팀전: 팀 승률(내 승률과 별개)
    const team3 = scoped.filter((match) => match.teamResult);
    const team3Team = {
      total: team3.length,
      wins: team3.filter((m) => m.teamResult === "win").length,
      losses: team3.filter((m) => m.teamResult === "loss").length,
      draws: team3.filter((m) => m.teamResult === "draw").length,
    };
    const team3TeamRate = team3Team.total ? Math.round((team3Team.wins / team3Team.total) * 100) : 0;
    const team3Mine = statsFromMatches(team3);

    return `
      <section>
        ${renderStatsPeriodChips()}
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
            <div class="stat-value">${getData().decks.length}</div>
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
              ${
                team3Team.total
                  ? `<div class="settings-card" style="margin-top: 12px;">
                      <h2 class="settings-title">3대3 팀전</h2>
                      <div class="bar-list">
                        ${renderBar("팀 승률", `${team3Team.total}판 · 팀 ${team3Team.wins}승 ${team3Team.losses}패${team3Team.draws ? ` ${team3Team.draws}무` : ""}`, team3TeamRate)}
                        ${renderBar("내 승률", `${team3Mine.total}판 · ${team3Mine.wins}승 ${team3Mine.losses}패${team3Mine.draws ? ` ${team3Mine.draws}무` : ""}`, team3Mine.rate)}
                      </div>
                    </div>`
                  : ""
              }
              ${renderMetaDashboardCard(metaRows)}
              ${renderMatchupReportCard(deckRows, selectedMatchupDeckId, matchupRows, selectedMatchupOpponent, scoped)}
            `
            : `
              <div class="empty-state">
                <div class="empty-icon pixel-bars" aria-hidden="true"><span></span></div>
                <div class="empty-title">${statsPeriodFromValue(state.statsPeriod) === "all" ? "아직 통계가 없습니다" : "이 기간에 전적이 없습니다"}</div>
                <div class="empty-copy">${
                  statsPeriodFromValue(state.statsPeriod) === "all"
                    ? "전적을 추가하면 승률과 덱별 기록이 표시됩니다"
                    : "다른 기간을 선택하거나 전적을 추가해 주세요"
                }</div>
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

  function renderMatchupReportCard(deckRows, selectedDeckId, matchupRows, selectedOpponent, scopedMatches = null) {
    const selectedRow = matchupRows.find((row) => matchupOpponentKey(row.opponent) === matchupOpponentKey(selectedOpponent));
    const selectedDeck = getDeck(selectedDeckId);
    const matches = selectedRow ? matchesForMatchup(selectedDeckId, selectedRow.opponent, scopedMatches) : [];
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

    return { renderStatsPeriodChips, renderMetaDashboardCard, renderStatsView, renderMatchupMetricBar, renderMatchupReportCard, renderBar };
  }

  const api = { createStatsViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsStats = api;
})(typeof window !== "undefined" ? window : globalThis);
