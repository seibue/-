/**
 * js/views-decks.js — 덱(관리) 탭의 읽기 전용 목록 뷰(렌더) 함수군.
 * app.js 에서 createDeckViews(deps) 로 의존성을 주입받아 사용한다.
 * 덱 빌더 모달(renderDeckModal 등)은 handleAction 과 얽혀 app.js 에 잔류.
 * 순수 이동(동작 보존): data.* → getData().* 변경만.
 */
(function (global) {
  function createDeckViews(deps) {
    const {
      escapeHTML,
      formatDate,
      colorDots,
      DECK_LIMITS,
      statsForDeck,
      statsForDeckCard,
      sortDeckCards,
      deckCards,
      deckCountSummary,
      deckReadiness,
      deckColorText,
      deckLastUsedLabel,
      deckVersionRecords,
      cardDisplayName,
      cardMetaText,
      normalizeCardNumber,
      getData,
    } = deps;

  function renderDecksView() {
    const data = getData();
    return `
      <section>
        <div class="deck-toolbar">
          <button class="primary-action" type="button" data-action="open-deck">＋ 덱을 추가</button>
          <button class="control-button" type="button" data-action="open-deck-import">덱 가져오기</button>
        </div>
        ${
          data.decks.length
            ? `<div class="list-stack">${data.decks.map(renderDeckCard).join("")}</div>`
            : `
              <div class="empty-state">
                <div class="empty-icon pixel-stack" aria-hidden="true"><span></span></div>
                <div class="empty-title">등록된 덱이 없습니다</div>
                <div class="empty-copy">덱을 만들면 전적 입력이 더 빨라집니다</div>
                <div class="empty-actions">
                  <button class="primary-action compact" type="button" data-action="open-deck">덱 추가 시작</button>
                  <button class="control-button" type="button" data-action="open-deck-import">덱 코드 가져오기</button>
                </div>
              </div>
            `
        }
      </section>
    `;
  }

  function renderDeckCard(deck) {
    const stats = statsForDeck(deck.id);
    const cards = sortDeckCards(deckCards(deck));
    const summary = deckCountSummary(cards);
    const readiness = deckReadiness(cards);
    return `
      <article class="deck-card">
        <div class="deck-head">
          <div>
            <div class="deck-name">${colorDots(deck.colors)} <span>${escapeHTML(deck.name)}</span></div>
            <div class="mini-text">${
              cards.length
                ? `총 ${summary.total}/${DECK_LIMITS.total}장 · 일반 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg} · ${cards.length}종`
                : "구축된 카드 없음"
            }</div>
            <div class="deck-readiness ${escapeHTML(readiness.level)}">
              <strong>${escapeHTML(readiness.label)}</strong>
              <span>${escapeHTML(readiness.detail)}</span>
            </div>
            <div class="deck-meta-grid">
              <span><strong>최근 사용</strong>${escapeHTML(deckLastUsedLabel(deck.id))}</span>
              <span><strong>색상</strong>${escapeHTML(deckColorText(deck.colors))}</span>
            </div>
            ${deck.note ? `<div class="mini-text">${escapeHTML(deck.note)}</div>` : ""}
          </div>
          <div class="card-actions">
            <button class="icon-button" type="button" title="수정" aria-label="덱 수정" data-action="edit-deck" data-id="${escapeHTML(deck.id)}">✎</button>
            <button class="icon-button" type="button" title="덱 레시피 인쇄" aria-label="덱 레시피 인쇄" data-action="print-deck" data-id="${escapeHTML(deck.id)}">⎙</button>
            <button class="icon-button text-icon" type="button" title="DOCX 다운로드" data-action="download-deck-docx" data-id="${escapeHTML(deck.id)}">DOCX</button>
            <button class="icon-button text-icon" type="button" title="덱 이미지 저장" data-action="download-deck-image" data-id="${escapeHTML(deck.id)}">PNG</button>
            <button class="icon-button text-icon" type="button" title="덱 내보내기 (JSON 파일)" data-action="export-deck" data-id="${escapeHTML(deck.id)}">내보내기</button>
            <button class="icon-button text-icon" type="button" title="덱 코드 복사 (다른 프로그램용)" data-action="copy-deck-code" data-id="${escapeHTML(deck.id)}">코드복사</button>
            <button class="icon-button text-icon" type="button" title="현재 구성을 버전으로 기록 (이후 전적이 이 버전에 집계)" data-action="save-deck-version" data-id="${escapeHTML(deck.id)}">버전</button>
            <button class="icon-button" type="button" title="복사" aria-label="덱 복사" data-action="clone-deck" data-id="${escapeHTML(deck.id)}">⧉</button>
            <button class="icon-button" type="button" title="삭제" aria-label="덱 삭제" data-action="delete-deck" data-id="${escapeHTML(deck.id)}">×</button>
          </div>
        </div>
        <div class="deck-stats">
          <div class="deck-stat"><strong>${stats.total}</strong><span>전적</span></div>
          <div class="deck-stat"><strong>${stats.wins}</strong><span>승</span></div>
          <div class="deck-stat"><strong>${stats.losses}</strong><span>패</span></div>
          <div class="deck-stat"><strong>${stats.rate}%</strong><span>승률</span></div>
        </div>
        ${renderDeckVersionsSection(deck)}
        ${cards.length ? renderDeckCardList(deck, cards) : ""}
      </article>
    `;
  }

  function renderDeckVersionsSection(deck) {
    const versions = deck.versions || [];
    if (!versions.length) return "";
    const deckMatches = getData().matches.filter((match) => match.deckId === deck.id);
    const { records, pre } = deckVersionRecords(versions, deckMatches);
    const ordered = [...records].reverse(); // 최신 버전을 위로
    const dateText = (value) => (value ? formatDate(String(value).slice(0, 10)) : "");
    const recordLine = (s) => `${s.total}전 ${s.wins}승 ${s.losses}패${s.draws ? ` ${s.draws}무` : ""}`;
    return `
      <details class="deck-build-preview deck-version-details">
        <summary class="card-rate-summary">
          <span class="card-rate-title">버전별 성적</span>
          <span class="card-rate-count">${versions.length}버전</span>
        </summary>
        <div class="version-record-list">
          ${ordered
            .map((rec) => {
              const range = rec.isCurrent ? `${dateText(rec.startAt)} ~ 현재` : `${dateText(rec.startAt)} ~ ${dateText(rec.endAt)}`;
              return `
                <div class="version-record-row${rec.isCurrent ? " current" : ""}">
                  <div class="version-record-head">
                    <strong>${escapeHTML(rec.version.label || "버전")}${rec.isCurrent ? " · 현재" : ""}</strong>
                    <span>${rec.cardTotal}장 · ${escapeHTML(range)}</span>
                  </div>
                  <div class="version-record-stat">
                    <span>${escapeHTML(recordLine(rec.stats))}</span>
                    <span class="version-rate">승률 ${rec.stats.rate}%</span>
                  </div>
                </div>
              `;
            })
            .join("")}
          ${
            pre.total
              ? `<div class="version-record-row pre">
                  <div class="version-record-head"><strong>버전 기록 전</strong><span>스냅샷 이전 전적</span></div>
                  <div class="version-record-stat"><span>${escapeHTML(recordLine(pre))}</span><span class="version-rate">승률 ${pre.rate}%</span></div>
                </div>`
              : ""
          }
        </div>
      </details>
    `;
  }

  function renderDeckCardList(deck, cards) {
    return `
      <details class="deck-build-preview deck-rate-details">
        <summary class="card-rate-summary">
          <span class="card-rate-title">카드별 승률</span>
          <span class="card-rate-count">${cards.length}종</span>
        </summary>
        <div class="card-rate-list">
          ${cards
            .map((card) => {
              const stats = statsForDeckCard(deck.id, card);
              const cardNo = normalizeCardNumber(card.cardNumber);
              return `
                <div class="card-rate-row card-rate-row-tap" role="button" tabindex="0" data-action="preview-catalog-card" data-card-no="${escapeHTML(cardNo)}" aria-label="${escapeHTML(cardDisplayName(card))} 효과 보기">
                  <div class="card-rate-main">
                    <strong>${escapeHTML(cardDisplayName(card))}</strong>
                    <span>${escapeHTML(cardMetaText(card))}</span>
                  </div>
                  <div class="card-rate-score">
                    <strong>${stats.total ? `${stats.rate}%` : "-"}</strong>
                    <span>${stats.total}전 ${stats.wins}승</span>
                  </div>
                  <span class="card-rate-chevron" aria-hidden="true">›</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </details>
    `;
  }

    return { renderDecksView, renderDeckCard, renderDeckVersionsSection, renderDeckCardList };
  }

  const api = { createDeckViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsDecks = api;
})(typeof window !== "undefined" ? window : globalThis);
