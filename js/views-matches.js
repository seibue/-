/**
 * js/views-matches.js — 전적 기록 탭 뷰(렌더) 함수군.
 * app.js 에서 createMatchesViews(deps) 로 의존성을 주입받아 사용한다.
 * 순수 이동(동작 보존): data.* → getData().* 변경만.
 */
(function (global) {
  function createMatchesViews(deps) {
    const {
      escapeHTML,
      formatDate,
      resultLabel,
      playOrderLabel,
      colorDots,
      deckName,
      getDeck,
      getTournament,
      getFilteredMatches,
      matchFormatLabel,
      roundText,
      selectedAttr,
      shareDateTitle,
      shareRateText,
      shareRecordText,
      statsFromMatches,
      tournamentMatchText,
      state,
      getData,
    } = deps;

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
              ${getData().decks
                .map((deck) => `<option value="${escapeHTML(deck.id)}"${selectedAttr(state.filters.deck, deck.id)}>${escapeHTML(deck.name)}</option>`)
                .join("")}
            </select>
          </label>
          <label class="field">
            <span>대전 유형</span>
            <select class="select" data-filter="type">
              <option value="all"${selectedAttr(state.filters.type, "all")}>전체</option>
              ${getData().matchTypes
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
            ${match.teamResult ? ` · <span class="team3-badge ${escapeHTML(match.teamResult)}">팀 ${escapeHTML(resultLabel(match.teamResult))}${match.teamPosition ? ` · ${escapeHTML(match.teamPosition)}자리` : ""}</span>` : ""}
          </div>
          ${round && roundStage && tournamentName
            ? `<p class="match-tournament-name">🏆 ${escapeHTML(tournamentName)}</p>`
            : ""}
          ${match.memo ? `<p class="match-memo">${escapeHTML(match.memo)}</p>` : ""}
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" title="수정" aria-label="전적 수정" data-action="edit-match" data-id="${escapeHTML(match.id)}">✎</button>
          <button class="icon-button" type="button" title="삭제" aria-label="전적 삭제" data-action="delete-match" data-id="${escapeHTML(match.id)}">×</button>
        </div>
      </article>
    `;
  }

  // ── 대회일정(공식 캘린더) ─────────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, "0");
  const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const localTimeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    return { renderMatchesView, renderDateGroupHeader, renderMatchDateSections, renderFilterPanel, renderMatchesEmpty, renderMatchCard };
  }

  const api = { createMatchesViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsMatches = api;
})(typeof window !== "undefined" ? window : globalThis);
