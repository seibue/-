/**
 * js/views-home.js — 홈(대시보드) 탭 뷰(렌더) 함수군.
 * app.js 에서 createHomeViews(deps) 로 의존성을 주입받아 사용한다.
 * 카드 검색(renderHomeCardSearch)은 컨트롤러 입력 핸들러와 얽혀 app.js 에 남기고 주입.
 * 순수 이동(동작 보존): data.* → getData().* 변경만.
 */
(function (global) {
  function createHomeViews(deps) {
    const {
      escapeHTML,
      formatDate,
      todayISO,
      playOrderLabel,
      deckName,
      matchDateTime,
      shareRecordText,
      shareScoreText,
      summaryStats,
      dailyShareSummary,
      deckMatchupRows,
      recentMatchDefaults,
      shouldShowStarterGuide,
      renderHomeCardSearch,
      getData,
    } = deps;

  function homeRecentDeckRows(limit = 3) {
    const day = 24 * 60 * 60 * 1000;
    const today = new Date(`${todayISO()}T00:00:00`).getTime();
    const recentMatches = getData().matches.filter((match) => matchDateTime(match) >= today - day * 6);
    const sourceMatches = recentMatches.length ? recentMatches : getData().matches;
    const rows = new Map();

    sourceMatches.forEach((match) => {
      const deckId = match.deckId || "missing";
      if (!rows.has(deckId)) {
        rows.set(deckId, {
          deckId,
          name: deckId === "missing" ? "덱 미기록" : deckName(deckId),
          total: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          rate: 0,
          lastTime: 0,
        });
      }
      const row = rows.get(deckId);
      row.total += 1;
      if (match.result === "win") row.wins += 1;
      if (match.result === "loss") row.losses += 1;
      if (match.result === "draw") row.draws += 1;
      row.lastTime = Math.max(row.lastTime, matchDateTime(match));
    });

    return [...rows.values()]
      .map((row) => ({ ...row, rate: row.total ? Math.round((row.wins / row.total) * 100) : 0 }))
      .sort((a, b) => b.lastTime - a.lastTime || b.total - a.total || a.name.localeCompare(b.name, "ko"))
      .slice(0, limit);
  }

  function homeTrendRows() {
    const day = 24 * 60 * 60 * 1000;
    const today = new Date(`${todayISO()}T00:00:00`).getTime();
    const start = today - day * 27;
    const rows = ["4주 전", "3주 전", "2주 전", "이번 주"].map((label) => ({
      label,
      total: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      rate: 0,
    }));

    getData().matches.forEach((match) => {
      const time = matchDateTime(match);
      if (time < start || time > today) return;
      const index = Math.min(3, Math.max(0, Math.floor((time - start) / (day * 7))));
      const row = rows[index];
      row.total += 1;
      if (match.result === "win") row.wins += 1;
      if (match.result === "loss") row.losses += 1;
      if (match.result === "draw") row.draws += 1;
    });

    return rows.map((row) => ({ ...row, rate: row.total ? Math.round((row.wins / row.total) * 100) : 0 }));
  }

  function renderHomeView() {
    const today = dailyShareSummary(todayISO());
    const overall = summaryStats();
    const deckRows = homeRecentDeckRows();
    const matchupRows = today.matchups.length ? today.matchups.slice(0, 3) : deckMatchupRows("").slice(0, 3);
    const trendRows = homeTrendRows();
    const defaults = recentMatchDefaults();
    const displayStats = today.stats.total ? today.stats : { total: 0, wins: 0, losses: 0, draws: 0 };
    const displayRate = displayStats.total ? Math.round((displayStats.wins / displayStats.total) * 100) : 0;
    const topDeck = today.decks[0]?.label || deckRows[0]?.name || "";
    const heroDetail = today.stats.total
      ? `${topDeck || "덱 미기록"} 기준 오늘 ${today.stats.total}경기 진행`
      : overall.total
        ? `오늘 기록은 아직 없습니다. 전체 ${shareRecordText(overall)}`
        : "첫 전적을 기록하면 이곳에 오늘 흐름이 표시됩니다.";

    return `
      <section class="home-dashboard">
        ${shouldShowStarterGuide() ? renderHomeStarterCard() : ""}
        ${renderHomeCardSearch()}
        <div class="home-hero-grid">
          <article class="home-panel home-today" style="--rate: ${displayRate}%">
            <div class="home-panel-head">
              <div>
                <h2>오늘 전적</h2>
                <p class="mini-text">${formatDate(todayISO())} · ${today.stats.total ? "오늘 입력 기준" : "기록 대기 중"}</p>
              </div>
              <span class="home-chip">${today.stats.total ? `오늘 ${today.stats.total}전` : "첫 기록 대기"}</span>
            </div>
            <div class="home-today-body">
              <div>
                <div class="home-record">${shareRecordText(displayStats)}</div>
                <div class="home-detail">${escapeHTML(heroDetail)}</div>
                <button class="primary-action home-action" type="button" data-action="open-match">전적 빠르게 추가</button>
              </div>
              <div class="rate-ring home-rate-ring" aria-label="오늘 승률 ${displayRate}%"><span>${displayRate}%</span></div>
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>최근 사용 덱</h2>
              <span class="mini-text">${deckRows.length ? "최근 기록 기준" : "덱 기록 없음"}</span>
            </div>
            <div class="home-list">
              ${
                deckRows.length
                  ? deckRows
                      .map(
                        (row) => `
                          <div class="home-list-row">
                            <div>
                              <strong>${escapeHTML(row.name)}</strong>
                              <span>최근 ${row.total}전 ${row.wins}승</span>
                            </div>
                            <b>${shareScoreText(row)}</b>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="home-empty">덱을 만들고 전적을 기록하면 최근 사용 덱이 표시됩니다.</div>`
              }
            </div>
          </article>
        </div>

        <div class="home-grid">
          <article class="home-panel">
            <div class="home-panel-head">
              <h2>최근 매치업</h2>
              <span class="mini-text">${today.matchups.length ? "오늘 입력 요약" : "누적 기록 기준"}</span>
            </div>
            <div class="home-list">
              ${
                matchupRows.length
                  ? matchupRows
                      .map(
                        (row) => `
                          <div class="home-list-row">
                            <div>
                              <strong>vs ${escapeHTML(row.opponent)}</strong>
                              <span>${row.total}전 · 승률 ${row.total ? Math.round((row.wins / row.total) * 100) : 0}%</span>
                            </div>
                            <b>${shareScoreText(row)}</b>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="home-empty">상대 덱 이름을 적으면 매치업이 자동으로 모입니다.</div>`
              }
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>빠른 기록</h2>
              <span class="mini-text">최근 입력값 자동 적용</span>
            </div>
            <div class="home-quick-grid">
              <div class="home-quick-item"><span>덱</span><strong>${escapeHTML(defaults.deckId ? deckName(defaults.deckId) : "덱 선택")}</strong></div>
              <div class="home-quick-item"><span>상대</span><strong>${escapeHTML(defaults.opponent || "상대 입력")}</strong></div>
              <div class="home-quick-item"><span>유형</span><strong>${escapeHTML(defaults.matchType || getData().matchTypes[0] || "대전")}</strong></div>
              <div class="home-quick-item"><span>선/후공</span><strong>${escapeHTML(playOrderLabel(defaults.playOrder || "unknown"))}</strong></div>
              <button class="primary-action home-action full" type="button" data-action="open-match">기록 추가</button>
            </div>
          </article>
        </div>

        <div class="home-grid">
          <article class="home-panel">
            <div class="home-panel-head">
              <h2>이번 달 흐름</h2>
              <span class="mini-text">최근 4주 승률</span>
            </div>
            <div class="home-bars">
              ${trendRows
                .map(
                  (row) => `
                    <div class="home-bar-row">
                      <div class="bar-head"><span>${escapeHTML(row.label)}</span><span>${row.total ? `${row.rate}% · ${row.total}전` : "기록 없음"}</span></div>
                      <div class="bar-track"><div class="bar-fill" style="--bar: ${row.total ? Math.max(4, row.rate) : 0}%"></div></div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="home-panel">
            <div class="home-panel-head">
              <h2>다음에 볼 것</h2>
              <span class="mini-text">추천 액션</span>
            </div>
            <div class="home-list">
              <button class="home-list-row button-row" type="button" data-tab="decks">
                <div>
                  <strong>${escapeHTML(deckRows[0]?.name || "덱 관리")}</strong>
                  <span>덱별 카드 승률과 구축 상태 확인</span>
                </div>
                <b>보기</b>
              </button>
              <button class="home-list-row button-row" type="button" data-action="open-daily-share-panel">
                <div>
                  <strong>오늘 전적 공유</strong>
                  <span>X에 올릴 문장과 이미지 만들기</span>
                </div>
                <b>열기</b>
              </button>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderHomeStarterCard() {
    const steps = [
      ["1", "덱 만들기", getData().decks.some((deck) => !String(deck.id).startsWith("sample-")) || (getData().decks.length && !getData().settings?.demoData)],
      ["2", "전적 기록", getData().matches.some((match) => !String(match.id).startsWith("sample-")) || (getData().matches.length && !getData().settings?.demoData)],
      ["3", "통계 확인", getData().matches.length > 0],
      ["4", "X 공유", getData().matches.some((match) => match.date === todayISO())],
    ];
    return `
      <article class="home-panel starter-card">
        <div class="home-panel-head">
          <div>
            <h2>처음이라면 이 순서로 시작</h2>
            <p class="mini-text">샘플 데이터는 화면을 보여주기 위한 예시입니다. 내 덱을 만들면 자연스럽게 교체해서 쓸 수 있습니다.</p>
          </div>
          <span class="home-chip">가이드</span>
        </div>
        <div class="starter-steps">
          ${steps
            .map(
              ([number, label, done]) => `
                <span class="${done ? "done" : ""}"><strong>${number}</strong>${escapeHTML(label)}</span>
              `
            )
            .join("")}
        </div>
        <div class="starter-actions">
          <button class="primary-action compact" type="button" data-action="open-deck">내 덱 만들기</button>
          <button class="control-button" type="button" data-action="open-match">전적 남기기</button>
          <button class="control-button" type="button" data-tab="settings">전체 가이드</button>
          <button class="quiet-button" type="button" data-action="dismiss-starter-guide">숨기기</button>
        </div>
      </article>
    `;
  }

    return { homeRecentDeckRows, homeTrendRows, renderHomeView, renderHomeStarterCard };
  }

  const api = { createHomeViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsHome = api;
})(typeof window !== "undefined" ? window : globalThis);
