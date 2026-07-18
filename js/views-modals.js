/**
 * js/views-modals.js — 모달/카드 미리보기/덱 빌더 뷰(렌더) 함수군 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리한 순수 렌더(HTML 문자열 생성) 계층.
 * renderModal 이 분기 진입점이고, 이벤트 처리(handleAction/handleEventSubmit)와
 * DOM 갱신(updateDeckCatalogResults/commitDeckCardSearch — deckSearchTimer 재할당)은 app.js 잔류.
 *
 * DI: data 는 재할당 → getData() 게터. state/previewParallelCache/effectLoadingCards 는
 * 재할당 없는 컨테이너라 참조 주입. deckReadiness(deck)·matchupOpponentKey(stats)·
 * staticKoreanOfficialEffect(card-effects)·lookups 계열이 팩토리 산출물이므로
 * app.js에서 해당 팩토리들보다 뒤에 생성해야 한다.
 *
 * - 브라우저: window.JJM.viewsModals.createModalViews(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createModalViews(deps) {
    const {
      getData,
      state,
      previewParallelCache,
      effectLoadingCards,
      colorMap,
      colorLabels,
      cardTypeLabels,
      CARD_BROWSER_LIMIT,
      CARD_CATALOG,
      DECK_LIMITS,
      KOREAN_CARD_PREVIEWS,
      MATCH_SCORE_OPTIONS,
      ROUND_STAGE_OPTIONS,
      TEAM3_MATCH_TYPE,
      BUILTIN_MATCH_TYPES,
      TEAM_POSITION_OPTIONS,
      TOURNAMENT_CUT_OPTIONS,
      TOURNAMENT_FORMAT_OPTIONS,
      escapeHTML,
      todayISO,
      resultLabel,
      normalizeCardNumber,
      normalizeCards,
      matchupOpponentKey,
      staticKoreanOfficialEffect,
      getTournament,
      sortedTournaments,
      suggestedRoundLabel,
      suggestedTeamPosition,
      suggestedTournamentStage,
      tournamentRoundProgress,
      deckReadiness,
      activeDeckAdvancedFilterCount,
      availableCopiesForCard,
      cacheDeckDraftForm,
      cardDisplayName,
      cardMetaText,
      cardPreviewData,
      cardTypeLabel,
      catalogCardToDraft,
      catalogImageSource,
      catalogMetaText,
      catalogSetPrefixes,
      checkedAttr,
      colorLabel,
      deckCardFilters,
      deckCardImageSource,
      deckCountSummary,
      deckLevelCounts,
      deckLimitViolation,
      filteredCatalogCardPool,
      filteredCatalogCards,
      findCalendarEvent,
      localDateStr,
      localTimeStr,
      matchScoreValue,
      recentDeckOptions,
      recentMatchDefaults,
      recentOpponentOptions,
      remoteCardImageUrl,
      selectedAttr,
      sortDeckCardsBy,
    } = deps;

      function renderEventModal() {
        const ev = state.editingEventId ? findCalendarEvent(state.editingEventId) : null;
        const isPersonal = ev ? !!ev.personal : state.eventModalKind !== "official";
        const start = ev ? new Date(ev.startsAt) : null;
        const dateVal = start && !Number.isNaN(start.getTime()) ? localDateStr(start) : state.selectedCalendarDate || todayISO();
        const timeVal = start && !Number.isNaN(start.getTime()) ? localTimeStr(start) : "10:00";
        const end = ev?.endsAt ? new Date(ev.endsAt) : null;
        const endVal = end && !Number.isNaN(end.getTime()) ? localTimeStr(end) : "";
        const body = `
          <form class="form-grid" id="event-form">
            ${isPersonal ? `<p class="mini-text">🔒 나만 보이는 개인 일정입니다.</p>` : ""}
            <label class="field">
              <span>${isPersonal ? "일정 이름" : "대회 이름"}</span>
              <input class="input" name="title" value="${escapeHTML(ev?.title || "")}" placeholder="${isPersonal ? "예: 친구와 듀얼, 대회 신청 마감" : "예: 6월 매장 대표전"}" autocomplete="off" required />
            </label>
            <div class="form-row">
              <label class="field">
                <span>날짜</span>
                <input class="input" type="date" name="date" value="${escapeHTML(dateVal)}" required />
              </label>
              <label class="field">
                <span>시작 시간</span>
                <input class="input" type="time" name="time" value="${escapeHTML(timeVal)}" required />
              </label>
              <label class="field">
                <span>종료(선택)</span>
                <input class="input" type="time" name="endTime" value="${escapeHTML(endVal)}" />
              </label>
            </div>
            <label class="field">
              <span>장소</span>
              <input class="input" name="location" value="${escapeHTML(ev?.location || "")}" placeholder="매장명 또는 지역" autocomplete="off" />
            </label>
            <label class="field">
              <span>설명/링크</span>
              <textarea class="textarea" name="description" placeholder="참가 방법, 신청 링크, 진행 방식 등">${escapeHTML(ev?.description || "")}</textarea>
            </label>
          </form>
        `;
        const actions = `
          <button class="control-button" type="button" data-action="close-modal">취소</button>
          <button class="primary-action" type="submit" form="event-form">${ev ? "저장" : "추가"}</button>
        `;
        const titleText = isPersonal ? (ev ? "내 일정 수정" : "내 일정 추가") : ev ? "대회 일정 수정" : "대회 일정 추가";
        return modalFrame(titleText, body, actions);
      }

      function renderModal() {
        if (!state.modal) return "";
        if (state.modal === "match") return renderMatchModal();
        if (state.modal === "tournament") return renderTournamentModal();
        if (state.modal === "deck") return renderDeckModal();
        if (state.modal === "deck-import") return renderDeckImportModal();
        if (state.modal === "event") return renderEventModal();
        return "";
      }

      function renderCardPreview() {
        if (!state.previewCardNo) return "";
        const card = cardPreviewData(state.previewCardNo);
        if (!card) return "";
        const baseImage = card.img || remoteCardImageUrl(card.no);
        // 기본 일러(현행 소스) + 일본 공식 패럴렐(있으면) 을 합쳐 갤러리 구성
        const parallels = previewParallelCache[card.no] || [];
        const images = [baseImage, ...parallels].filter(Boolean);
        const activeIndex = Math.min(Math.max(state.previewActiveImage || 0, 0), Math.max(images.length - 1, 0));
        const mainSrc = images[activeIndex] || baseImage;
        const hasGallery = images.length > 1;
        // 덱 수정 중이고 이 카드가 덱에 들어있으면, 일러를 골라 덱 카드에 저장할 수 있게 한다.
        const draftCard = state.modal === "deck" ? (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === card.no) : null;
        const activeIsSaved = imageIndexToArt(activeIndex) === (draftCard?.art || "");
        // 현재 보고 있는 일러가 덱 저장본과 다를 때만 저장 버튼을 노출(저장본일 땐 버튼/문구 없음).
        const showArtSave = !!draftCard && hasGallery && !activeIsSaved;
        return `
          <div class="card-preview-backdrop">
            <section class="card-preview-panel" role="dialog" aria-modal="true" tabindex="-1" aria-label="${escapeHTML(card.name)} 미리보기">
              <button class="icon-button card-preview-close" type="button" title="닫기" aria-label="미리보기 닫기" data-action="close-card-preview">×</button>
              <div class="card-preview-image${hasGallery ? " has-gallery" : ""}" data-img-count="${images.length}">
                ${
                  mainSrc
                    ? `<img src="${escapeHTML(mainSrc)}" alt="${escapeHTML(card.name)}" loading="eager" />`
                    : `<span class="catalog-image-empty">${escapeHTML(card.no)}</span>`
                }
                ${
                  hasGallery
                    ? `<button class="card-preview-nav prev" type="button" data-action="preview-set-image" data-img-index="${activeIndex - 1}" aria-label="이전 일러스트"${activeIndex === 0 ? " hidden" : ""}>‹</button>
                      <button class="card-preview-nav next" type="button" data-action="preview-set-image" data-img-index="${activeIndex + 1}" aria-label="다음 일러스트"${activeIndex === images.length - 1 ? " hidden" : ""}>›</button>
                      <span class="card-preview-counter">${activeIndex + 1} / ${images.length}</span>`
                    : ""
                }
              </div>
              ${
                showArtSave
                  ? `<button class="primary-action compact card-preview-art-save" type="button" data-action="save-deck-card-art">이 일러로 덱에 저장</button>`
                  : ""
              }
              ${renderKoreanCardPreview(card)}
            </section>
          </div>
        `;
      }

      // 일러 갤러리 인덱스 ↔ 저장 접미사 변환 (0 = 기본, n = "_Pn")
      function imageIndexToArt(index) {
        return index > 0 ? `_P${index}` : "";
      }
      function imageIndexFromArt(art) {
        const match = /^_P(\d+)$/.exec(String(art || ""));
        return match ? Number(match[1]) : 0;
      }

      function renderKoreanCardPreview(card) {
        const preview = KOREAN_CARD_PREVIEWS[card.no] || {};
        const remoteEffect = staticKoreanOfficialEffect(card.no) || state.cardEffectCache[card.no];
        const isLoadingEffect = effectLoadingCards.has(card.no);
        const effectBlocks = renderCardEffectBlocks(card, preview, remoteEffect, isLoadingEffect);
        return `
          <div class="card-preview-korean">
            <div class="card-preview-korean-head">
              <span>${escapeHTML(preview.label || "한글 카드 정보")}</span>
              <strong>${escapeHTML(card.name)}</strong>
            </div>
            ${effectBlocks}
            <dl>
              <div>
                <dt>카드번호</dt>
                <dd>${escapeHTML(card.no)}</dd>
              </div>
              <div>
                <dt>종류</dt>
                <dd>${escapeHTML(cardTypeLabel(card.type))}</dd>
              </div>
              <div>
                <dt>Lv</dt>
                <dd>${escapeHTML(card.level || "-")}</dd>
              </div>
              <div>
                <dt>색상</dt>
                <dd>${escapeHTML(colorLabel(card.color) || "-")}</dd>
              </div>
            </dl>
          </div>
        `;
      }

      function renderCardEffectBlocks(card, preview, remoteEffect, isLoadingEffect) {
        if (preview.effect) {
          return renderCardEffectBlock(preview.effectTitle || "효과", preview.effect);
        }
        if (isLoadingEffect) {
          return `<div class="card-preview-effect loading"><span>효과</span><p>카드 효과를 불러오는 중입니다.</p></div>`;
        }
        if (!remoteEffect) {
          return "";
        }
        const isKoreanOfficial = remoteEffect.source === "kr";
        if (!isKoreanOfficial) return "";
        // 공식 사이트 관례 용어(상단/하단 텍스트) 대신 직관적 라벨 + 종류별 색 톤
        const blocks = [
          ["효과", remoteEffect.mainEffect, "main"],
          ["진화원 효과", remoteEffect.sourceEffect, "source"],
          ["시큐리티", remoteEffect.securityEffect, "security"],
          ["추가 효과", remoteEffect.altEffect, "alt"],
        ]
          .filter(([, text]) => text)
          .map(([title, text, tone]) => renderCardEffectBlock(title, text, "", "", tone));
        if (blocks.length) return blocks.join("");
        return "";
      }

      // 효과문 안의 키워드(≪블로커≫)와 타이밍(【등장 시】)을 자동 강조.
      // escapeHTML 을 먼저 적용한 뒤 치환하므로 원문 HTML 이 끼어들 여지가 없다.
      function highlightEffectText(text) {
        return escapeHTML(text)
          .replace(/([≪《][^≫》]{1,30}[≫》])/g, '<b class="fx-kw">$1</b>')
          .replace(/(【[^】]{1,20}】)/g, '<b class="fx-timing">$1</b>');
      }

      function renderCardEffectBlock(title, koreanText, originalText = "", badge = "", tone = "") {
        return `
          <div class="card-preview-effect${tone ? ` tone-${escapeHTML(tone)}` : ""}">
            <span>${escapeHTML(title)}${badge ? `<em>${escapeHTML(badge)}</em>` : ""}</span>
            <p>${highlightEffectText(koreanText)}</p>
            ${
              originalText
                ? `
                  <details>
                    <summary>영문 원문</summary>
                    <p lang="en">${escapeHTML(originalText)}</p>
                  </details>
                `
                : ""
            }
          </div>
        `;
      }

      function modalFrame(title, body, actions, className = "") {
        const backdropClass = className.includes("deck-modal-panel") ? " deck-modal-backdrop" : "";
        return `
          <div class="modal-backdrop${backdropClass}">
            <section class="modal-panel ${escapeHTML(className)}" role="dialog" aria-modal="true" tabindex="-1" aria-label="${escapeHTML(title)}">
              <div class="modal-head">
                <h2 class="modal-title">${escapeHTML(title)}</h2>
                <button class="icon-button" type="button" title="닫기" aria-label="닫기" data-action="close-modal">×</button>
              </div>
              <div class="modal-body">${body}</div>
              ${actions ? `<div class="modal-actions">${actions}</div>` : ""}
            </section>
          </div>
        `;
      }

      function renderDeckImportModal() {
        const body = `
          <form class="form-grid" id="deck-import-form">
            <label class="field">
              <span>덱 이름</span>
              <input class="input" name="name" placeholder="비워두면 파일/텍스트 이름을 사용합니다" />
            </label>
            <label class="field">
              <span>덱 리스트</span>
              <textarea class="textarea import-textarea" name="deckImportText" placeholder="예시&#10;4 (BT13-007)&#10;2 (BT12-021)&#10;4 ST1-03 아구몬&#10;4 Koromon BT12-003&#10;4 Agumon EX4-005&#10;&#10;디지타마&#10;1 (ST1-01)"></textarea>
            </label>
            <label class="field">
              <span>파일 가져오기</span>
              <input class="input" type="file" accept=".json,.txt,application/json,text/plain" data-deck-import-file />
            </label>
            <div class="import-hint">
              전적몬 JSON, <strong>매수 (카드번호)</strong>, <strong>매수 카드번호 이름</strong>, 디프로의 <strong>매수 영어카드명 카드번호</strong> 형식을 가져올 수 있습니다.
              내장 DB에 없는 카드번호는 공개 카드 API로 이름, Lv, 종류를 자동 확인합니다.
            </div>
          </form>
        `;
        const actions = `
          <button class="control-button" type="button" data-action="close-modal">취소</button>
          <button class="primary-action" type="submit" form="deck-import-form">${state.importingDecks ? "가져오는 중" : "가져오기"}</button>
        `;
        return modalFrame("덱 가져오기", body, actions);
      }

      function renderTournamentModal() {
        const tournament = state.editingTournamentId ? getTournament(state.editingTournamentId) : null;
        const selectedFormat = tournament?.format || "mixed";
        const selectedCut = tournament?.topCut || 4;
        const body = `
          <form class="form-grid" id="tournament-form">
            <label class="field">
              <span>대회 이름</span>
              <input class="input" name="name" value="${escapeHTML(tournament?.name || "")}" placeholder="예: 매장 대표전" autocomplete="off" required />
            </label>
            <div class="form-row">
              <label class="field">
                <span>날짜</span>
                <input class="input" type="date" name="date" value="${escapeHTML(tournament?.date || todayISO())}" />
              </label>
              <label class="field">
                <span>진행 방식</span>
                <select class="select" name="format">
                  ${TOURNAMENT_FORMAT_OPTIONS.map(
                    ([value, label]) => `<option value="${escapeHTML(value)}"${selectedAttr(selectedFormat, value)}>${escapeHTML(label)}</option>`
                  ).join("")}
                </select>
              </label>
              <label class="field">
                <span>토너먼트 컷</span>
                <select class="select" name="topCut">
                  ${TOURNAMENT_CUT_OPTIONS.map(
                    ([value, label]) => `<option value="${value}"${selectedAttr(String(selectedCut), String(value))}>${escapeHTML(label)}</option>`
                  ).join("")}
                </select>
              </label>
            </div>
            <p class="mini-text">스위스 종료 후 토너먼트 라운드가 선택한 컷부터 자동 진행됩니다 (예: 8강 → 4강 → 결승).</p>
            <label class="field">
              <span>장소</span>
              <input class="input" name="location" value="${escapeHTML(tournament?.location || "")}" placeholder="매장명 또는 지역" autocomplete="off" />
            </label>
            <label class="field">
              <span>메모</span>
              <textarea class="textarea" name="memo" placeholder="대회 진행 방식, 참가 인원, 특이사항">${escapeHTML(tournament?.memo || "")}</textarea>
            </label>
          </form>
        `;
        const actions = `
          <button class="control-button" type="button" data-action="close-modal">취소</button>
          <button class="primary-action" type="submit" form="tournament-form">${tournament ? "저장" : "추가"}</button>
        `;
        return modalFrame(tournament ? "대회 수정" : "대회 추가", body, actions);
      }

      function renderMatchModal() {
        const match = state.editingMatchId ? getData().matches.find((item) => item.id === state.editingMatchId) : null;
        const defaults = match ? {} : recentMatchDefaults();
        const selectedDeckId = match?.deckId || defaults.deckId || "";
        const selectedMatchType = match?.matchType || defaults.matchType || getData().matchTypes[0] || "대전";
        const defaultOpponent = match ? match.opponent || "" : defaults.opponent || "";
        const selectedPlayOrder = match?.playOrder || defaults.playOrder || "unknown";
        const selectedTournamentId = match?.tournamentId || state.prefillMatchTournamentId || "";
        const selectedTournament = getTournament(selectedTournamentId);
        const selectedRoundStage =
          match?.roundStage || state.prefillMatchRoundStage || (selectedTournamentId ? suggestedTournamentStage(selectedTournamentId) : "none");
        const selectedMatchFormat =
          selectedRoundStage === "swiss" ? "single" : match?.matchFormat === "match" || selectedRoundStage === "top" ? "match" : "single";
        const selectedMatchScore = selectedMatchFormat === "match" ? matchScoreValue(match) : "2-0";
        const selectedResult = selectedRoundStage === "swiss" && match?.result === "draw" ? "win" : match?.result || "win";
        const selectedRoundLabel =
          match?.roundLabel || state.prefillMatchRoundLabel || (selectedTournamentId ? suggestedRoundLabel(selectedTournamentId, selectedRoundStage) : "");
        const selectedDate = match?.date || selectedTournament?.date || todayISO();
        const selectedTournamentProgress = selectedTournament ? tournamentRoundProgress(selectedTournament) : null;
        // 3대3 팀전: 유형이 3대3이면 폼에 자리·팀 결과 노출. 자리는 같은 대회 직전 라운드에서 이어받음.
        const isTeam3 = selectedMatchType === TEAM3_MATCH_TYPE;
        // 사용자 목록 + 내장 유형(얼티미트컵·3대3) 합류 — 중복 없이 뒤에 붙인다
        const matchTypeOptions = [...getData().matchTypes];
        BUILTIN_MATCH_TYPES.forEach((type) => {
          if (!matchTypeOptions.includes(type)) matchTypeOptions.push(type);
        });
        const selectedTeamResult = match?.teamResult || "win";
        const selectedTeamPosition = match?.teamPosition || suggestedTeamPosition(selectedTournamentId) || "A";
        const hasQuickDefaults = !match && Boolean(getData().settings?.quickMatchDefaults || getData().matches[0]);
        const recentDecks = match ? [] : recentDeckOptions(4);
        const recentOpponents = match ? [] : recentOpponentOptions(6);
        const body = `
          <form class="form-grid match-form ${selectedMatchFormat === "match" ? "match-mode" : "single-mode"}${
            selectedRoundStage === "swiss" ? " swiss-mode" : ""
          }${isTeam3 ? " team3-mode" : ""}" id="match-form">
            ${hasQuickDefaults ? `<div class="mini-text">최근 입력한 덱, 상대, 대전 유형을 기본값으로 불러왔습니다.</div>` : ""}
            <label class="field">
              <span>내 덱</span>
              <select class="select" name="deckId" data-match-deck-select>
                <option value="">덱 선택</option>
                ${getData().decks
                  .map((deck) => `<option value="${escapeHTML(deck.id)}"${selectedAttr(selectedDeckId, deck.id)}>${escapeHTML(deck.name)}</option>`)
                  .join("")}
              </select>
            </label>
            ${
              recentDecks.length
                ? `<div class="quick-chip-row" aria-label="최근 사용 덱">
                    ${recentDecks
                      .map(
                        (deck) => `
                          <button class="quick-fill-chip ${deck.id === selectedDeckId ? "active" : ""}" type="button" data-action="select-match-deck" data-id="${escapeHTML(deck.id)}">
                            ${escapeHTML(deck.name)}
                          </button>
                        `
                      )
                      .join("")}
                  </div>`
                : ""
            }
            <div class="form-row">
              <label class="field">
                <span>날짜</span>
                <input class="input" type="date" name="date" value="${escapeHTML(selectedDate)}" />
              </label>
              <label class="field">
                <span>대전 유형</span>
                <select class="select" name="matchType">
                  ${matchTypeOptions
                    .map((type) => `<option value="${escapeHTML(type)}"${selectedAttr(selectedMatchType, type)}>${escapeHTML(type)}</option>`)
                    .join("")}
                </select>
              </label>
            </div>
            <div class="form-row tournament-match-fields">
              <label class="field">
                <span>대회</span>
                <select class="select" name="tournamentId" data-match-tournament-select>
                  <option value="">대회 없음</option>
                  ${sortedTournaments()
                    .map(
                      (tournament) =>
                        `<option value="${escapeHTML(tournament.id)}"${selectedAttr(selectedTournamentId, tournament.id)}>${escapeHTML(
                          `${tournament.name} · ${tournament.date}`
                        )}</option>`
                    )
                    .join("")}
                </select>
              </label>
              <label class="field">
                <span>라운드</span>
                <input class="input" name="roundLabel" value="${escapeHTML(selectedRoundLabel)}" data-suggested-round="${escapeHTML(selectedRoundLabel)}" placeholder="예: R1, 4강, 결승" autocomplete="off" />
              </label>
            </div>
            <div class="field tournament-round-stage">
              <span>라운드 구분</span>
              <div class="segmented-control round-stage-control">
                ${ROUND_STAGE_OPTIONS.map(
                  ([value, label]) => `
                    <label class="segmented-option">
                      <input type="radio" name="roundStage" value="${value}"${checkedAttr(selectedRoundStage, value)} />
                      <span>${label}</span>
                    </label>
                  `
                ).join("")}
              </div>
            </div>
            ${
              selectedTournament
                ? `<div class="match-helper-card">
                    <strong>${escapeHTML(selectedTournament.name)}</strong>
                    <span>
                      현재 ${selectedTournamentProgress?.swissCount || 0}스위스 / ${selectedTournamentProgress?.topCount || 0}토너먼트 ·
                      추천 ${escapeHTML(selectedRoundLabel || "직접 입력")}
                    </span>
                    <span>스위스는 승/패만, 토너먼트는 세트 스코어로 기록하면 공유문이 깔끔해집니다.</span>
                  </div>`
                : ""
            }
            <label class="field">
              <span>상대</span>
              <input class="input" name="opponent" value="${escapeHTML(defaultOpponent)}" placeholder="상대 이름 또는 덱" autocomplete="off" />
            </label>
            ${
              recentOpponents.length
                ? `<div class="quick-chip-row" aria-label="최근 상대">
                    ${recentOpponents
                      .map(
                        (opponent) => `
                          <button class="quick-fill-chip ${matchupOpponentKey(opponent) === matchupOpponentKey(defaultOpponent) ? "active" : ""}" type="button" data-action="fill-match-opponent" data-value="${escapeHTML(opponent)}">
                            vs ${escapeHTML(opponent)}
                          </button>
                        `
                      )
                      .join("")}
                  </div>`
                : ""
            }
            <div class="form-row">
              <div class="field match-format-field">
                <span>기록 방식</span>
                <div class="segmented-control match-format-control">
                  ${[
                    ["single", "단판"],
                    ["match", "매치전"],
                  ]
                    .map(
                      ([value, label]) => `
                        <label class="segmented-option">
                          <input type="radio" name="matchFormat" value="${value}"${checkedAttr(selectedMatchFormat, value)} />
                          <span>${label}</span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
              </div>
              <div class="field match-score-field">
                <span>세트 스코어</span>
                <div class="segmented-control match-score-control">
                  ${MATCH_SCORE_OPTIONS.map(
                    ([score]) => `
                      <label class="segmented-option">
                        <input type="radio" name="matchScore" value="${score}"${checkedAttr(selectedMatchScore, score)} />
                        <span>${score}</span>
                      </label>
                    `
                  ).join("")}
                </div>
              </div>
              <div class="field single-result-field">
                <span>결과</span>
                <div class="segmented-control">
                  ${["win", "loss", "draw"]
                    .map(
                      (result) => `
                        <label class="segmented-option result-option ${result === "draw" ? "draw-result-option" : ""}">
                          <input type="radio" name="result" value="${result}"${checkedAttr(selectedResult, result)} />
                          <span>${resultLabel(result)}</span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
              </div>
              <div class="field">
                <span>선후공</span>
                <div class="segmented-control play-order-control">
                  ${[
                    ["unknown", "미상"],
                    ["first", "선공"],
                    ["second", "후공"],
                  ]
                    .map(
                      ([value, label]) => `
                        <label class="segmented-option">
                          <input type="radio" name="playOrder" value="${value}"${checkedAttr(selectedPlayOrder, value)} />
                          <span>${label}</span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
              </div>
            </div>
            <div class="form-row team3-fields">
              <div class="field">
                <span>내 자리 <small class="mini-note">대회당 고정·자동 채움</small></span>
                <div class="segmented-control team3-position-control">
                  ${TEAM_POSITION_OPTIONS.map(
                    (pos) => `
                      <label class="segmented-option">
                        <input type="radio" name="teamPosition" value="${pos}"${checkedAttr(selectedTeamPosition, pos)} />
                        <span>${pos}</span>
                      </label>
                    `
                  ).join("")}
                </div>
              </div>
              <div class="field">
                <span>팀 결과 <small class="mini-note">내 결과와 별개</small></span>
                <div class="segmented-control">
                  ${["win", "loss", "draw"]
                    .map(
                      (result) => `
                        <label class="segmented-option result-option ${result === "draw" ? "draw-result-option" : ""}">
                          <input type="radio" name="teamResult" value="${result}"${checkedAttr(selectedTeamResult, result)} />
                          <span>${resultLabel(result)}</span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
              </div>
            </div>
            <label class="field">
              <span>메모</span>
              <textarea class="textarea" name="memo" placeholder="핵심 플레이, 실수, 사이드 계획 등을 적어두세요">${escapeHTML(match?.memo || "")}</textarea>
            </label>
          </form>
        `;
        const actions = `
          <button class="control-button" type="button" data-action="close-modal">취소</button>
          ${
            match
              ? `<button class="primary-action" type="submit" form="match-form">저장</button>`
              : `
                <button class="control-button active" type="submit" form="match-form" name="afterSave" value="continue">추가 후 계속</button>
                <button class="primary-action" type="submit" form="match-form">추가</button>
              `
          }
        `;
        return modalFrame(match ? "기록 수정" : "기록 추가", body, actions);
      }

      function renderDeckModal() {
        const deck = state.editingDeckId ? getData().decks.find((item) => item.id === state.editingDeckId) : null;
        const draft = state.deckDraftForm || {
          name: deck?.name || "",
          note: deck?.note || "",
          colors: deck?.colors?.length ? deck.colors : ["blue"],
        };
        const selectedColors = new Set(draft.colors?.length ? draft.colors : ["blue"]);
        const levelLabels = ["2", "3", "4", "5", "6", "7", "T", "O"];
        const levelDisplayLabels = { "2": "LV.2", "3": "LV.3", "4": "LV.4", "5": "LV.5", "6": "LV.6", "7": "LV.7", "T": "테이머", "O": "옵션" };
        const levelCounts = deckLevelCounts(normalizeCards(state.deckDraftCards || []));
        const body = `
          <form class="form-grid" id="deck-form">
            <label class="field">
              <span>덱 이름</span>
              <input class="input" name="name" value="${escapeHTML(draft.name || "")}" placeholder="예: 워그레이몬" autocomplete="off" required />
            </label>
            <div class="field">
              <span>색상</span>
              <div class="color-level-row">
                <div class="swatch-row">
                  ${Object.entries(colorMap)
                    .map(
                      ([color, hex]) => `
                        <label class="swatch-option" title="${color}">
                          <input type="checkbox" name="colors" value="${color}"${selectedColors.has(color) ? " checked" : ""} />
                          <span style="--dot-color: ${hex}"></span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
                <div class="level-counter-strip">
                  ${levelLabels.map((label) => { const cnt = levelCounts[label] || 0; return `<span data-lv="${label.toLowerCase()}"${cnt === 0 ? ' class="zero"' : ""}><small>${escapeHTML(levelDisplayLabels[label])}</small><strong>${cnt}</strong></span>`; }).join("")}
                </div>
              </div>
            </div>
            ${renderDeckBuilder()}
            <label class="field">
              <span>메모</span>
              <textarea class="textarea" name="note" placeholder="덱 버전, 주요 카드, 조정 포인트">${escapeHTML(draft.note || "")}</textarea>
            </label>
          </form>
        `;
        const actions = `
          <button class="control-button" type="button" data-action="close-modal">취소</button>
          <button class="primary-action" type="submit" form="deck-form">${deck ? "저장" : "추가"}</button>
        `;
        return modalFrame(deck ? "덱 수정" : "덱 추가", body, actions, "deck-modal-panel");
      }

      function renderCatalogCard(card) {
        const existing = state.deckDraftCards.find((item) => normalizeCardNumber(item.cardNumber) === card.no);
        const count = Number(existing?.count) || 0;
        const canAdd = availableCopiesForCard(state.deckDraftCards, catalogCardToDraft(card, 1)) > 0;
        const imageSrc = catalogImageSource(card);
        const no = escapeHTML(card.no);
        const stepper = count
          ? `
            <div class="catalog-stepper" aria-label="${no} 수량 조절">
              <button class="catalog-step-btn" type="button" data-action="decrement-deck-card" data-card-id="${escapeHTML(existing.id)}" aria-label="${no} 1장 빼기">-</button>
              <span class="catalog-step-count">${count}<small>/4</small></span>
              <button class="catalog-step-btn" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"} aria-label="${no} 1장 추가">+</button>
            </div>
          `
          : `
            <div class="catalog-stepper">
              <button class="catalog-step-btn add-only" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"}>+ 추가</button>
            </div>
          `;
        return `
          <article class="catalog-card${count ? " in-deck" : ""}${canAdd || count ? "" : " disabled"}" title="${escapeHTML(card.no)} ${escapeHTML(card.name)}">
            <button class="catalog-image" type="button" data-action="preview-catalog-card" data-card-no="${no}" aria-label="${no} 카드 미리보기">
              ${
                imageSrc
                  ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" data-card-no="${no}" loading="lazy" />`
                  : `<span class="catalog-image-empty">${no}</span>`
              }
            </button>
            ${count ? `<span class="catalog-count">${count}</span>` : ""}
            <button class="catalog-info" type="button" data-action="add-catalog-card" data-card-no="${no}"${canAdd ? "" : " disabled"} aria-label="${no} 1장 추가">
              <strong>${escapeHTML(card.name)}</strong>
              <small>${no} · ${escapeHTML(catalogMetaText(card))}</small>
            </button>
            ${stepper}
          </article>
        `;
      }

      function renderCatalogGridContent() {
        if (!CARD_CATALOG.length) {
          return `<div class="builder-empty">카드 카탈로그를 불러오지 못했습니다. 직접 입력으로 카드를 추가해 주세요.</div>`;
        }
        const catalogCards = filteredCatalogCards();
        if (!catalogCards.length) {
          return `
            <div class="builder-empty">
              <strong>검색 결과가 없습니다.</strong>
              <span>카드 번호는 BT13-111, bt13 111처럼 입력해도 찾을 수 있습니다.</span>
              <button class="control-button" type="button" data-action="clear-deck-search">검색 초기화</button>
            </div>
          `;
        }
        return catalogCards.map(renderCatalogCard).join("");
      }


      function renderDeckListRow(card) {
        const imageSrc = deckCardImageSource(card);
        return `
          <div class="deck-list-row">
            <div class="deck-row-card">
              <span class="deck-row-thumb" data-action="preview-catalog-card" data-card-no="${escapeHTML(normalizeCardNumber(card.cardNumber))}">
                ${
                  imageSrc
                    ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" data-card-no="${escapeHTML(normalizeCardNumber(card.cardNumber))}" loading="lazy" />`
                    : `<span class="deck-row-thumb-empty">${escapeHTML(normalizeCardNumber(card.cardNumber).slice(0, 2) || "?")}</span>`
                }
              </span>
              <div class="deck-row-main">
                <strong>${escapeHTML(cardDisplayName(card))}</strong>
                <span>${escapeHTML(cardMetaText(card))}</span>
              </div>
            </div>
            <div class="deck-count-stepper">
              <button class="step-button" type="button" aria-label="1장 빼기" data-action="decrement-deck-card" data-card-id="${escapeHTML(card.id)}">-</button>
              <input class="input count-input" data-card-field="count" data-card-id="${escapeHTML(card.id)}" type="number" min="1" max="4" value="${
                card.count
              }" aria-label="매수" />
              <button class="step-button" type="button" aria-label="1장 추가" data-action="increment-deck-card" data-card-id="${escapeHTML(card.id)}">+</button>
            </div>
            <button class="icon-button" type="button" title="카드 삭제" aria-label="카드 삭제" data-action="remove-deck-card" data-card-id="${escapeHTML(card.id)}">×</button>
          </div>
        `;
      }

      function renderDeckThumb(card) {
        const imageSrc = deckCardImageSource(card);
        const cardNo = normalizeCardNumber(card.cardNumber);
        return `
          <div class="deck-thumb-item">
            <span class="deck-thumb-img" data-action="preview-catalog-card" data-card-no="${escapeHTML(cardNo)}">
              ${imageSrc
                ? `<img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(card.name)}" loading="lazy" />`
                : `<span class="deck-thumb-empty">${escapeHTML(cardNo.slice(0, 4) || "?")}</span>`}
            </span>
            <span class="deck-thumb-count">${card.count}</span>
            <div class="deck-thumb-overlay">
              <button class="deck-thumb-btn minus" type="button" data-action="decrement-deck-card" data-card-id="${escapeHTML(card.id)}" title="1장 빼기">−</button>
              <button class="deck-thumb-btn remove" type="button" data-action="remove-deck-card" data-card-id="${escapeHTML(card.id)}" title="삭제">×</button>
              <button class="deck-thumb-btn plus" type="button" data-action="increment-deck-card" data-card-id="${escapeHTML(card.id)}" title="1장 추가">+</button>
            </div>
          </div>
        `;
      }

      function renderDeckThumbSections(cards) {
        const mode = state.deckTraySort || "level";
        const mainCards = sortDeckCardsBy(cards.filter((c) => c.type !== "digiEgg"), mode);
        const eggCards = sortDeckCardsBy(cards.filter((c) => c.type === "digiEgg"), mode);
        const parts = [];
        if (mainCards.length) {
          parts.push(`
            <div class="deck-thumb-section">
              <div class="deck-thumb-section-label">메인 덱 (${mainCards.reduce((s,c)=>s+Number(c.count||0),0)}장)</div>
              <div class="deck-thumb-grid">${mainCards.map(renderDeckThumb).join("")}</div>
            </div>
          `);
        }
        if (eggCards.length) {
          parts.push(`
            <div class="deck-thumb-section">
              <div class="deck-thumb-section-label">디지타마 (${eggCards.reduce((s,c)=>s+Number(c.count||0),0)}장)</div>
              <div class="deck-thumb-grid">${eggCards.map(renderDeckThumb).join("")}</div>
            </div>
          `);
        }
        return parts.join("");
      }

      function renderManualCardInput() {
        return `
          <details class="manual-card-panel">
            <summary>직접 입력</summary>
            <div class="builder-add">
              <input class="input" data-new-card-number placeholder="카드 넘버" autocomplete="off" inputmode="text" pattern="[A-Za-z0-9-]*" />
              <input class="input" data-new-card-level placeholder="Lv" autocomplete="off" inputmode="numeric" pattern="[0-9]" maxlength="1" />
              <input class="input wide-field" data-new-card-name placeholder="카드 이름" autocomplete="off" />
              <select class="select" data-new-card-type aria-label="카드 종류">
                ${Object.entries(cardTypeLabels)
                  .map(([type, label]) => `<option value="${type}">${label}</option>`)
                  .join("")}
              </select>
              <input class="input" data-new-card-count type="number" min="1" max="4" value="4" aria-label="매수" />
              <button class="control-button active" type="button" data-action="add-deck-card">추가</button>
            </div>
          </details>
        `;
      }

      function renderDeckFilterChip(group, value, label, options = {}) {
        const filters = deckCardFilters();
        const active = Array.isArray(filters[group]) && filters[group].includes(value);
        return `
          <button class="deck-filter-chip ${active ? "active" : ""} ${options.color ? "color-chip" : ""}" type="button"
            data-action="toggle-deck-filter-value" data-filter-group="${escapeHTML(group)}" data-filter-value="${escapeHTML(value)}">
            ${options.color ? `<span class="color-dot" style="--dot-color: ${escapeHTML(colorMap[value] || colorMap.blue)}"></span>` : ""}
            ${escapeHTML(label)}
          </button>
        `;
      }

      function renderDeckAdvancedSearch(resultCount, forceOpen = false) {
        if (!forceOpen && !state.deckAdvancedOpen) return "";
        const filters = deckCardFilters();
        const setPrefixes = catalogSetPrefixes();
        const levelOptions = ["2", "3", "4", "5", "6", "7"];
        return `
          <div class="deck-advanced-search">
            <div class="deck-advanced-head">
              <div>
                <strong>상세 검색</strong>
                <span class="deck-advanced-result-count">${resultCount}종 검색됨 · 최대 ${CARD_BROWSER_LIMIT}종 표시</span>
              </div>
              <button class="quiet-button" type="button" data-action="clear-deck-advanced-search" ${
                activeDeckAdvancedFilterCount() ? "" : "disabled"
              }>초기화</button>
            </div>

            <div class="deck-filter-section">
              <span>색상</span>
              <div class="deck-filter-chips">
                ${Object.entries(colorLabels)
                  .map(([color, label]) => renderDeckFilterChip("colors", color, label, { color: true }))
                  .join("")}
              </div>
            </div>

            <div class="deck-filter-section">
              <span>Lv</span>
              <div class="deck-filter-chips compact">
                ${levelOptions.map((level) => renderDeckFilterChip("levels", level, `Lv.${level}`)).join("")}
              </div>
            </div>

            <div class="deck-filter-grid">
              <label class="field">
                <span>수록 코드</span>
                <select class="select" data-deck-filter-select="setPrefix">
                  <option value="all"${selectedAttr(filters.setPrefix, "all")}>전체</option>
                  ${setPrefixes.map((prefix) => `<option value="${escapeHTML(prefix)}"${selectedAttr(filters.setPrefix, prefix)}>${escapeHTML(prefix)}</option>`).join("")}
                </select>
              </label>
              <label class="field">
                <span>정렬</span>
                <select class="select" data-deck-filter-select="sort">
                  <option value="catalog"${selectedAttr(filters.sort, "catalog")}>기본 순서</option>
                  <option value="number"${selectedAttr(filters.sort, "number")}>카드번호순</option>
                  <option value="latest"${selectedAttr(filters.sort, "latest")}>최신 번호 우선</option>
                  <option value="level"${selectedAttr(filters.sort, "level")}>Lv 낮은순</option>
                  <option value="name"${selectedAttr(filters.sort, "name")}>이름순</option>
                </select>
              </label>
            </div>
          </div>
        `;
      }

      function renderDeckBuilder() {
        const cards = normalizeCards(state.deckDraftCards);
        const summary = deckCountSummary(cards);
        const limitMessage = deckLimitViolation(cards);
        const readiness = deckReadiness(cards);
        const activeFilterCount = activeDeckAdvancedFilterCount();
        const catalogResultCount = filteredCatalogCardPool().length;
        const builderStatusTone = limitMessage ? "danger" : readiness.level;
        const builderView = ["catalog", "advanced", "tray"].includes(state.deckBuilderView) ? state.deckBuilderView : "catalog";
        const builderStatusLabel = limitMessage ? "제한 초과" : readiness.label;
        return `
          <div class="deck-builder hub-builder">
            <div class="builder-sticky-header">
              <div class="hub-search-row">
                <label class="hub-search">
                  <span aria-hidden="true">⌕</span>
                  <input class="input" type="search" value="${escapeHTML(state.deckCardSearch)}" placeholder="카드명/효과/번호" data-deck-card-search autocomplete="off" />
                </label>
                <select class="select hub-type-select" data-deck-card-type aria-label="카드 종류 필터">
                  <option value="all"${selectedAttr(state.deckCardType, "all")}>전체</option>
                  ${Object.entries(cardTypeLabels)
                    .filter(([type]) => type !== "other")
                    .map(([type, label]) => `<option value="${type}"${selectedAttr(state.deckCardType, type)}>${label}</option>`)
                    .join("")}
                </select>
                <button class="control-button hub-detail-button ${state.deckAdvancedOpen || activeFilterCount ? "active" : ""}" type="button" data-action="toggle-deck-advanced-search" aria-expanded="${state.deckAdvancedOpen ? "true" : "false"}">
                  상세${activeFilterCount ? ` ${activeFilterCount}` : ""}
                </button>
                <div class="mobile-builder-summary ${escapeHTML(builderStatusTone)}">
                  <span class="mobile-builder-status">${escapeHTML(builderStatusLabel)}</span>
                  <span>메인 <strong>${summary.main}/${DECK_LIMITS.main}</strong></span>
                  <span>디지타마 <strong>${summary.digiEgg}/${DECK_LIMITS.digiEgg}</strong></span>
                  <span>총 <strong>${summary.total}/${DECK_LIMITS.total}</strong></span>
                </div>
              </div>
              <div class="builder-flow-strip" aria-label="덱 구축 진행 상태">
                <span data-builder-result-count>${catalogResultCount.toLocaleString("ko-KR")}종 검색됨</span>
                <span>카드에서 바로 수량 조절</span>
                <span class="${escapeHTML(builderStatusTone)}">현재 ${summary.total}/${DECK_LIMITS.total}장</span>
                <span>같은 카드 번호 최대 4장</span>
              </div>
              <div class="deck-builder-tabs">
                <button class="deck-tab-btn${builderView === "catalog" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="catalog">검색</button>
                <button class="deck-tab-btn${builderView === "advanced" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="advanced">상세${activeFilterCount ? ` ${activeFilterCount}` : ""}</button>
                <button class="deck-tab-btn${builderView === "tray" ? " active" : ""}" type="button" data-action="deck-builder-tab" data-view="tray">덱 목록 (${summary.total}장)</button>
              </div>
            </div>
            <div class="desktop-advanced-panel">${renderDeckAdvancedSearch(catalogResultCount)}</div>

            <div class="hub-layout">
              <section class="mobile-advanced-panel${builderView === "advanced" ? "" : " mobile-hidden"}" aria-label="상세 검색">
                ${renderDeckAdvancedSearch(catalogResultCount, true)}
              </section>

              <section class="catalog-panel${builderView === "catalog" ? "" : " mobile-hidden"}" aria-label="카드 카탈로그">
                <div class="catalog-grid">
                  ${renderCatalogGridContent()}
                </div>
              </section>

              <section class="deck-tray${builderView === "tray" ? "" : " mobile-hidden"}" aria-label="구축 중인 덱">
                <div class="deck-count-pills">
                  <span class="deck-pill main">메인 <strong>${summary.main}/${DECK_LIMITS.main}</strong></span>
                  <span class="deck-pill egg">디지타마 <strong>${summary.digiEgg}/${DECK_LIMITS.digiEgg}</strong></span>
                  <span class="deck-pill total">총 <strong>${summary.total}/${DECK_LIMITS.total}</strong></span>
                </div>
                <div class="deck-readiness builder ${escapeHTML(readiness.level)}">
                  <strong>${escapeHTML(readiness.label)}</strong>
                  <span>${escapeHTML(readiness.detail)}</span>
                </div>
                ${limitMessage ? `<div class="builder-rule danger">${escapeHTML(limitMessage)}</div>` : ""}
                <div class="deck-list-toolbar">
                  <strong>덱 목록</strong>
                  <span>${cards.length}종 · ${summary.total}장</span>
                  ${
                    cards.length
                      ? `
                        <div class="deck-list-tools">
                          <select class="select deck-sort-select" data-deck-tray-sort aria-label="덱 목록 정렬">
                            <option value="level"${selectedAttr(state.deckTraySort, "level")}>레벨순</option>
                            <option value="number"${selectedAttr(state.deckTraySort, "number")}>번호순</option>
                            <option value="type"${selectedAttr(state.deckTraySort, "type")}>종류순</option>
                          </select>
                          <button class="deck-tool-button danger" type="button" data-action="clear-deck-draft-cards">모든 카드 비우기</button>
                        </div>
                      `
                      : ""
                  }
                </div>
                ${
                  cards.length
                    ? `<div class="hub-deck-list">${renderDeckThumbSections(cards)}</div>`
                    : `<div class="builder-empty">카드를 누르면 이곳에 덱 리스트가 쌓입니다.</div>`
                }
                ${renderManualCardInput()}
              </section>
            </div>
          </div>
        `;
      }


    return {
      renderModal,
      renderCardPreview,
      renderCatalogGridContent,
      imageIndexToArt,
      imageIndexFromArt,
      renderEventModal,
      renderKoreanCardPreview,
      renderCardEffectBlocks,
      renderCardEffectBlock,
      modalFrame,
      renderDeckImportModal,
      renderTournamentModal,
      renderMatchModal,
      renderDeckModal,
      renderCatalogCard,
      renderDeckListRow,
      renderDeckThumb,
      renderDeckThumbSections,
      renderManualCardInput,
      renderDeckFilterChip,
      renderDeckAdvancedSearch,
      renderDeckBuilder,
    };
  }

  const api = { createModalViews };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.viewsModals = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
