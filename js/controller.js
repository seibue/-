/**
 * js/controller.js — 액션 컨트롤러 (트랙 B: 코어 모듈화 최종)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리한 이벤트 액션 계층.
 * handleAction 이 모든 버튼 액션의 중앙 분기이고, handle*Submit 이 폼 저장을 담당한다.
 * 이벤트 리스너 등록(document/window.addEventListener)은 let 타이머(searchTimer 등)
 * 재할당 때문에 app.js 잔류 — 여기서 내보낸 함수들을 구조분해로 받아 그대로 사용.
 *
 * DI: data 는 재할당 → getData() 게터(재할당은 없음 — restore 계열은 persistence 모듈 몫).
 * state 는 참조 주입. render↔handleAction 상호 호출은 render(호이스팅 함수)를 값으로
 * 주입해 해결(호출 시점에 이미 정의됨).
 *
 * - 브라우저: window.JJM.controller.createController(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createController(deps) {
    const {
      getData,
      state,
      CARD_CATALOG,
      cardTypeLabels,
      ROUND_STAGE_OPTIONS,
      TEAM3_MATCH_TYPE,
      TOURNAMENT_CUT_OPTIONS,
      TOURNAMENT_FORMAT_OPTIONS,
      uid,
      todayISO,
      resultFromGameStats,
      singleGameStats,
      normalizeCards,
      normalizeMatchTypeName,
      normalizeCardNumber,
      normalizeLevel,
      createDefaultDeckCardFilters,
      isAdminUser,
      saveData,
      cloneDataSnapshot,
      saveRecoveryPoint,
      restoreRecoveryPoint,
      notifyUndo,
      restoreUndo,
      clearAllData,
      copyCardUpdateCommands,
      copyDailyShareText,
      copyDeckExportCode,
      downloadBackup,
      downloadCardDataStatus,
      downloadDeckExport,
      installPwa,
      refreshAppVersion,
      clearDiagnostics,
      downloadDiagnostics,
      downloadDailyShareImage,
      downloadDeckImage,
      openDailyShareX,
      printDeckRecipe,
      downloadDeckRecipeDocx,
      addDraftCard,
      changeDraftCardCount,
      cloneDeck,
      deckReadiness,
      catalogCardToDraft,
      cardNumberOverLimit,
      applyCloudConflictVersion,
      keepLocalConflictVersion,
      loadCloudNow,
      loginWithGoogle,
      logoutGoogle,
      saveCloudData,
      getDeck,
      getTournament,
      tournamentName,
      roundText,
      suggestedRoundLabel,
      suggestedTournamentStage,
      icsFileName,
      imageIndexToArt,
      cacheDeckDraftForm,
      cardDisplayName,
      closeCardPreview,
      closeModal,
      deckCards,
      deckLimitViolation,
      deletePersonalEventById,
      deleteTournamentEventById,
      dismissToast,
      downloadDraftDeckRecipeDocx,
      downloadIcs,
      filteredTournamentEvents,
      findCalendarEvent,
      gameStatsFromScore,
      loadTournamentEvents,
      notifyToast,
      openCardPreview,
      openDailySharePanel,
      printDraftDeckRecipe,
      rememberMatchDefaults,
      render,
      renderKeepingDeckScroll,
      renderKeepingRegionScroll,
      savePersonalEvent,
      startDeckDraft,
      statsPeriodFromValue,
      toggleDeckFilterValue,
      upsertTournamentEvent,
    } = deps;

      async function handleEventSubmit(form) {
        const editing = state.editingEventId ? findCalendarEvent(state.editingEventId) : null;
        const isPersonal = editing ? !!editing.personal : state.eventModalKind !== "official";
        if (!isPersonal && !isAdminUser()) {
          alert("관리자만 공식 일정을 추가할 수 있습니다.");
          return;
        }
        const formData = new FormData(form);
        const title = String(formData.get("title") || "").trim();
        const date = String(formData.get("date") || "");
        const time = String(formData.get("time") || "");
        const endTime = String(formData.get("endTime") || "");
        if (!title || !date || !time) {
          alert("이름, 날짜, 시작 시간을 입력해 주세요.");
          return;
        }
        const start = new Date(`${date}T${time}:00`);
        if (Number.isNaN(start.getTime())) {
          alert("날짜/시간 형식을 확인해 주세요.");
          return;
        }
        const end = endTime ? new Date(`${date}T${endTime}:00`) : null;
        const payload = {
          id: state.editingEventId || undefined,
          title,
          startsAt: start.toISOString(),
          endsAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : "",
          location: String(formData.get("location") || "").trim(),
          description: String(formData.get("description") || "").trim(),
        };
        const finishUi = () => {
          state.selectedCalendarDate = date;
          state.calendarYear = start.getFullYear();
          state.calendarMonth = start.getMonth();
          closeModal();
          notifyToast(isPersonal ? "내 일정 저장됨" : "일정 저장됨", title, "success");
        };
        // 개인 일정: 로컬 데이터에 저장(네트워크 불필요)
        if (isPersonal) {
          savePersonalEvent(payload);
          finishUi();
          return;
        }
        // 공식 일정: 클라우드 테이블에 저장(관리자)
        const submitter = document.querySelector('[form="event-form"][type="submit"]');
        if (submitter) {
          submitter.disabled = true;
          submitter.textContent = "저장 중";
        }
        try {
          await upsertTournamentEvent(payload);
          await loadTournamentEvents(true);
          finishUi();
        } catch (error) {
          if (submitter) {
            submitter.disabled = false;
            submitter.textContent = state.editingEventId ? "저장" : "추가";
          }
          alert(`일정 저장 실패: ${error?.message || "잠시 후 다시 시도해 주세요."}`);
        }
      }

      function handleAction(action, target) {
        if (action === "preview-catalog-card") {
          openCardPreview(target.dataset.cardNo);
          return;
        }
        if (action === "close-card-preview") {
          closeCardPreview();
          return;
        }
        if (action === "preview-set-image") {
          const index = parseInt(target.dataset.imgIndex, 10);
          state.previewActiveImage = Number.isFinite(index) ? index : 0;
          if (state.modal === "deck") renderKeepingDeckScroll();
          else render();
          return;
        }
        if (action === "save-deck-card-art") {
          const draftCard = (state.deckDraftCards || []).find((c) => normalizeCardNumber(c.cardNumber) === state.previewCardNo);
          if (draftCard) {
            draftCard.art = imageIndexToArt(state.previewActiveImage || 0);
            notifyToast("일러 저장", `${cardDisplayName(draftCard)} 일러를 덱에 저장했습니다.`, "success", 1600);
            renderKeepingDeckScroll();
          }
          return;
        }
        if (action === "login-google") {
          loginWithGoogle();
          return;
        }
        if (action === "logout-google") {
          logoutGoogle();
          return;
        }
        if (action === "sync-cloud-now") {
          if (!state.authUser) loginWithGoogle();
          else saveCloudData({ notify: true });
          return;
        }
        if (action === "load-cloud-now") {
          loadCloudNow();
          return;
        }
        if (action === "use-cloud-version") {
          applyCloudConflictVersion();
          return;
        }
        if (action === "keep-local-version") {
          keepLocalConflictVersion();
          return;
        }
        if (action === "dismiss-toast") {
          dismissToast(target.dataset.id);
          return;
        }
        if (action === "restore-undo") {
          restoreUndo(target.dataset.undoId);
          return;
        }
        if (action === "retry-cloud-save") {
          saveCloudData({ notify: true });
          return;
        }
        if (action === "restore-recovery-point") {
          restoreRecoveryPoint();
          return;
        }
        if (action === "reload-app") {
          refreshAppVersion();
          return;
        }
        if (action === "install-pwa") {
          installPwa();
          return;
        }
        if (action === "dismiss-starter-guide") {
          getData().settings = { ...(getData().settings || {}), dismissedStarterGuide: true };
          saveData();
          render();
          return;
        }
        if (action === "copy-card-update-commands") {
          if (isAdminUser()) copyCardUpdateCommands();
          else notifyToast("관리자 전용 기능", "카드 데이터 관리는 관리자 계정에서만 사용할 수 있습니다.", "warning");
          return;
        }
        if (action === "copy-daily-share") {
          copyDailyShareText();
          return;
        }
        if (action === "save-daily-share-image") {
          downloadDailyShareImage();
          return;
        }
        if (action === "open-daily-share-x") {
          openDailyShareX();
          return;
        }
        if (action === "open-daily-share-panel") {
          openDailySharePanel();
          return;
        }
        if (action === "download-card-data-status") {
          if (isAdminUser()) downloadCardDataStatus();
          else notifyToast("관리자 전용 기능", "카드 데이터 관리는 관리자 계정에서만 사용할 수 있습니다.", "warning");
          return;
        }
        if (action === "download-diagnostics") {
          downloadDiagnostics();
          return;
        }
        if (action === "clear-diagnostics") {
          clearDiagnostics();
          return;
        }
        if (action === "open-match") {
          state.modal = "match";
          state.editingMatchId = null;
          state.prefillMatchTournamentId = "";
          state.prefillMatchRoundStage = "";
          state.prefillMatchRoundLabel = "";
          render();
          return;
        }
        if (action === "open-match-for-tournament") {
          state.modal = "match";
          state.editingMatchId = null;
          state.prefillMatchTournamentId = target.dataset.id || "";
          state.prefillMatchRoundStage = "";
          state.prefillMatchRoundLabel = "";
          render();
          return;
        }
        if (action === "open-match-for-tournament-stage") {
          const tournamentId = target.dataset.id || "";
          const stage = ROUND_STAGE_OPTIONS.some(([value]) => value === target.dataset.stage) ? target.dataset.stage : "swiss";
          state.modal = "match";
          state.editingMatchId = null;
          state.prefillMatchTournamentId = tournamentId;
          state.prefillMatchRoundStage = stage;
          state.prefillMatchRoundLabel = target.dataset.roundLabel || (tournamentId ? suggestedRoundLabel(tournamentId, stage) : "");
          render();
          return;
        }
        if (action === "open-tournament") {
          state.modal = "tournament";
          state.editingTournamentId = null;
          render();
          return;
        }
        if (action === "edit-tournament") {
          state.modal = "tournament";
          state.editingTournamentId = target.dataset.id;
          render();
          return;
        }
        if (action === "delete-tournament") {
          const tournament = getTournament(target.dataset.id);
          if (tournament && confirm(`「${tournament.name}」 대회를 삭제할까요? 연결된 전적은 유지하고 대회 연결만 해제됩니다.`)) {
            const snapshot = cloneDataSnapshot();
            saveRecoveryPoint(snapshot, "대회 삭제 전");
            getData().tournaments = getData().tournaments.filter((item) => item.id !== tournament.id);
            getData().matches = getData().matches.map((match) =>
              match.tournamentId === tournament.id ? { ...match, tournamentId: "", roundStage: "none", roundLabel: "" } : match
            );
            saveData();
            notifyUndo("대회 삭제됨", snapshot, `"${tournament.name}" 대회를 되돌릴 수 있습니다.`);
            render();
          }
          return;
        }
        if (action === "select-match-tournament") {
          const panel = target.closest(".modal-panel");
          const select = panel?.querySelector('[name="tournamentId"]');
          if (select) {
            select.value = target.dataset.id || "";
            select.focus();
          }
          render();
          return;
        }
        if (action === "select-match-deck") {
          const panel = target.closest(".modal-panel");
          const select = panel?.querySelector('[name="deckId"]');
          if (select) {
            select.value = target.dataset.id || "";
            select.focus();
          }
          panel?.querySelectorAll(".quick-fill-chip[data-action='select-match-deck']").forEach((button) => {
            button.classList.toggle("active", button.dataset.id === select?.value);
          });
          return;
        }
        if (action === "fill-match-opponent") {
          const panel = target.closest(".modal-panel");
          const input = panel?.querySelector('[name="opponent"]');
          if (input) {
            input.value = target.dataset.value || "";
            input.focus();
          }
          panel?.querySelectorAll(".quick-fill-chip[data-action='fill-match-opponent']").forEach((button) => {
            button.classList.toggle("active", button.dataset.value === input?.value);
          });
          return;
        }
        if (action === "edit-match") {
          state.modal = "match";
          state.editingMatchId = target.dataset.id;
          render();
          return;
        }
        if (action === "set-stats-period") {
          state.statsPeriod = statsPeriodFromValue(target.dataset.period);
          render();
          return;
        }
        if (action === "calendar-prev-month" || action === "calendar-next-month") {
          let month = state.calendarMonth + (action === "calendar-next-month" ? 1 : -1);
          let year = state.calendarYear;
          if (month < 0) {
            month = 11;
            year -= 1;
          } else if (month > 11) {
            month = 0;
            year += 1;
          }
          state.calendarMonth = month;
          state.calendarYear = year;
          render();
          return;
        }
        if (action === "select-calendar-day") {
          state.selectedCalendarDate = state.selectedCalendarDate === target.dataset.date ? "" : target.dataset.date;
          render();
          // 선택한 날짜의 일정 패널이 캘린더 아래(모바일은 하단 네비에 가림)에 생기므로 보이게 스크롤한다.
          // 대회가 많아 패널이 길어도 항상 패널 '상단'(제목·첫 대회)부터 보이도록 block:start 로.
          if (state.selectedCalendarDate) {
            requestAnimationFrame(() => {
              document.getElementById("calendar-day-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
          return;
        }
        if (action === "event-region-toggle") {
          const region = target.dataset.region || "";
          if (state.eventRegionFilters.has(region)) state.eventRegionFilters.delete(region);
          else state.eventRegionFilters.add(region);
          renderKeepingRegionScroll();
          return;
        }
        if (action === "event-region-clear") {
          state.eventRegionFilters.clear();
          renderKeepingRegionScroll();
          return;
        }
        if (action === "add-personal-event") {
          state.modal = "event";
          state.eventModalKind = "personal";
          state.editingEventId = null;
          render();
          return;
        }
        if (action === "add-event") {
          if (!isAdminUser()) return;
          state.modal = "event";
          state.eventModalKind = "official";
          state.editingEventId = null;
          render();
          return;
        }
        if (action === "edit-event") {
          const ev = findCalendarEvent(target.dataset.eventId);
          if (!ev) return;
          if (!ev.personal && !isAdminUser()) return; // 공식 일정 수정은 관리자만
          state.modal = "event";
          state.eventModalKind = ev.personal ? "personal" : "official";
          state.editingEventId = target.dataset.eventId;
          render();
          return;
        }
        if (action === "delete-event") {
          const ev = findCalendarEvent(target.dataset.eventId);
          if (!ev) return;
          if (ev.personal) {
            if (!confirm("이 개인 일정을 삭제할까요?")) return;
            deletePersonalEventById(ev.id);
            notifyToast("내 일정 삭제됨", "", "success");
            render();
            return;
          }
          if (!isAdminUser()) return;
          if (!confirm("이 대회 일정을 삭제할까요?")) return;
          deleteTournamentEventById(target.dataset.eventId)
            .then(() => loadTournamentEvents(true))
            .then(() => notifyToast("일정 삭제됨", "", "success"))
            .catch((error) => alert(`삭제 실패: ${error?.message || ""}`));
          return;
        }
        if (action === "ics-download") {
          const ev = findCalendarEvent(target.dataset.eventId);
          if (ev) downloadIcs([ev], `jeonjeokmon-${ev.title}`);
          return;
        }
        if (action === "ics-download-all") {
          downloadIcs(filteredTournamentEvents(), icsFileName());
          return;
        }
        if (action === "delete-match") {
          if (confirm("이 전적을 삭제할까요?")) {
            const snapshot = cloneDataSnapshot();
            saveRecoveryPoint(snapshot, "전적 삭제 전");
            getData().matches = getData().matches.filter((match) => match.id !== target.dataset.id);
            state.selected.delete(target.dataset.id);
            saveData();
            notifyUndo("전적 삭제됨", snapshot, "삭제한 전적을 되돌릴 수 있습니다.");
            render();
          }
          return;
        }
        if (action === "open-deck") {
          state.modal = "deck";
          state.editingDeckId = null;
          startDeckDraft(null);
          render();
          return;
        }
        if (action === "open-deck-import") {
          state.modal = "deck-import";
          render();
          return;
        }
        if (action === "edit-deck") {
          state.modal = "deck";
          state.editingDeckId = target.dataset.id;
          startDeckDraft(getDeck(target.dataset.id));
          render();
          return;
        }
        if (action === "delete-deck") {
          const deck = getDeck(target.dataset.id);
          if (deck && confirm(`「${deck.name}」 덱을 삭제할까요? 관련 전적은 '삭제된 덱'으로 표시됩니다.`)) {
            const snapshot = cloneDataSnapshot();
            saveRecoveryPoint(snapshot, "덱 삭제 전");
            getData().decks = getData().decks.filter((item) => item.id !== deck.id);
            saveData();
            notifyUndo("덱 삭제됨", snapshot, `"${deck.name}" 덱을 되돌릴 수 있습니다.`);
            render();
          }
          return;
        }
        if (action === "clone-deck") {
          const deck = getDeck(target.dataset.id);
          if (!deck) return;
          getData().decks.push(cloneDeck(deck));
          saveData();
          render();
          return;
        }
        if (action === "export-deck") {
          const deck = getDeck(target.dataset.id);
          if (deck) downloadDeckExport(deck);
          return;
        }
        if (action === "copy-deck-code") {
          const deck = getDeck(target.dataset.id);
          if (deck) copyDeckExportCode(deck);
          return;
        }
        if (action === "save-deck-version") {
          const deck = getDeck(target.dataset.id);
          if (!deck) return;
          const currentCards = deckCards(deck);
          if (!currentCards.length) {
            alert("카드가 없는 덱은 버전으로 기록할 수 없습니다. 먼저 덱을 구성해 주세요.");
            return;
          }
          const versionCount = (deck.versions?.length || 0) + 1;
          const snapshot = {
            id: uid("dver"),
            label: `v${versionCount}`,
            cards: currentCards.map((card) => ({ ...card })),
            createdAt: new Date().toISOString(),
          };
          deck.versions = [...(deck.versions || []), snapshot];
          deck.updatedAt = new Date().toISOString();
          saveData();
          notifyToast("버전 기록됨", `${deck.name} ${snapshot.label} · 지금부터의 전적이 이 버전으로 집계됩니다.`, "success");
          render();
          return;
        }
        if (action === "print-deck") {
          const deck = getDeck(target.dataset.id);
          if (deck) printDeckRecipe(deck);
          return;
        }
        if (action === "download-deck-docx") {
          const deck = getDeck(target.dataset.id);
          if (deck) downloadDeckRecipeDocx(deck);
          return;
        }
        if (action === "download-deck-image") {
          const deck = getDeck(target.dataset.id);
          if (deck) downloadDeckImage(deck);
          return;
        }
        if (action === "print-deck-draft") {
          printDraftDeckRecipe();
          return;
        }
        if (action === "download-deck-draft-docx") {
          downloadDraftDeckRecipeDocx();
          return;
        }
        if (action === "deck-builder-tab") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckBuilderView = ["catalog", "advanced", "tray"].includes(target.dataset.view) ? target.dataset.view : "catalog";
          if (state.deckBuilderView === "advanced") state.deckAdvancedOpen = false;
          renderKeepingDeckScroll();
          return;
        }
        if (action === "toggle-deck-advanced-search") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckAdvancedOpen = !state.deckAdvancedOpen;
          renderKeepingDeckScroll();
          return;
        }
        if (action === "clear-deck-advanced-search") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckCardFilters = createDefaultDeckCardFilters();
          renderKeepingDeckScroll();
          return;
        }
        if (action === "clear-deck-search") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckCardSearch = "";
          state.deckCardType = "all";
          state.deckCardFilters = createDefaultDeckCardFilters();
          renderKeepingDeckScroll();
          return;
        }
        if (action === "toggle-deck-filter-value") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          toggleDeckFilterValue(target.dataset.filterGroup, target.dataset.filterValue);
          renderKeepingDeckScroll();
          return;
        }
        if (action === "add-deck-card") {
          const panel = target.closest(".modal-panel");
          cacheDeckDraftForm(panel?.querySelector("#deck-form"));
          const numberInput = panel?.querySelector("[data-new-card-number]");
          const levelInput = panel?.querySelector("[data-new-card-level]");
          const nameInput = panel?.querySelector("[data-new-card-name]");
          const countInput = panel?.querySelector("[data-new-card-count]");
          const typeInput = panel?.querySelector("[data-new-card-type]");
          const requestedCount = Math.max(1, Math.min(4, Number(countInput?.value) || 1));
          if (
            addDraftCard(
              {
                cardNumber: numberInput?.value,
                level: levelInput?.value,
                name: nameInput?.value,
                type: typeInput?.value,
              },
              requestedCount
            )
          ) {
            renderKeepingDeckScroll();
          }
          return;
        }
        if (action === "add-catalog-card") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          const card = CARD_CATALOG.find((item) => item.no === normalizeCardNumber(target.dataset.cardNo));
          if (card) {
            // 카탈로그 카드는 정식 데이터이므로 레벨이 없는 특수 카드(위그드라실_7D6·대죄의 문 등)도 추가 허용
            if (addDraftCard(catalogCardToDraft(card, 1), 1, { allowMissingLevel: true })) renderKeepingDeckScroll();
          }
          return;
        }
        if (action === "increment-deck-card" || action === "decrement-deck-card") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          changeDraftCardCount(target.dataset.cardId, action === "increment-deck-card" ? 1 : -1);
          renderKeepingDeckScroll();
          return;
        }
        if (action === "remove-deck-card") {
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckDraftCards = state.deckDraftCards.filter((card) => card.id !== target.dataset.cardId);
          renderKeepingDeckScroll();
          return;
        }
        if (action === "clear-deck-draft-cards") {
          if (!state.deckDraftCards.length) return;
          if (!confirm("현재 덱에 담긴 모든 카드를 비울까요?")) return;
          cacheDeckDraftForm(target.closest(".modal-panel")?.querySelector("#deck-form"));
          state.deckDraftCards = [];
          renderKeepingDeckScroll();
          return;
        }
        if (action === "toggle-filters") {
          state.filtersOpen = !state.filtersOpen;
          render();
          return;
        }
        if (action === "clear-filters") {
          state.filters = { query: "", result: "all", deck: "all", type: "all" };
          state.memoOnly = false;
          render();
          return;
        }
        if (action === "show-more-matches") {
          state.matchesVisible = (Number(state.matchesVisible) || 50) + 50;
          render();
          return;
        }
        if (action === "toggle-memo") {
          state.memoOnly = !state.memoOnly;
          render();
          return;
        }
        if (action === "toggle-bulk") {
          state.bulkMode = !state.bulkMode;
          state.selected.clear();
          render();
          return;
        }
        if (action === "delete-selected") {
          if (state.selected.size && confirm(`${state.selected.size}개의 전적을 삭제할까요?`)) {
            const snapshot = cloneDataSnapshot();
            saveRecoveryPoint(snapshot, "전적 일괄 삭제 전");
            const count = state.selected.size;
            getData().matches = getData().matches.filter((match) => !state.selected.has(match.id));
            state.selected.clear();
            saveData();
            notifyUndo("전적 삭제됨", snapshot, `${count}개의 전적을 되돌릴 수 있습니다.`);
            render();
          }
          return;
        }
        if (action === "delete-type") {
          if (getData().matchTypes.length <= 1) {
            alert("대전 유형은 최소 1개가 필요합니다.");
            return;
          }
          const type = target.dataset.type;
          if (confirm(`「${type}」 유형을 삭제할까요? 기존 전적의 유형명은 유지됩니다.`)) {
            const snapshot = cloneDataSnapshot();
            saveRecoveryPoint(snapshot, "대전 유형 삭제 전");
            getData().matchTypes = getData().matchTypes.filter((item) => item !== type);
            saveData();
            notifyUndo("대전 유형 삭제됨", snapshot, `"${type}" 유형을 되돌릴 수 있습니다.`);
            render();
          }
          return;
        }
        if (action === "download-backup") {
          downloadBackup();
          return;
        }
        if (action === "clear-all") {
          clearAllData();
          return;
        }
        if (action === "close-modal") {
          closeModal();
        }
      }

      function handleMatchSubmit(form, submitter = null) {
        const formData = new FormData(form);
        const deckId = String(formData.get("deckId") || "");
        if (!deckId) {
          alert("덱을 선택해 주세요.");
          return;
        }
        const tournamentId = String(formData.get("tournamentId") || "");
        const roundStageValue = String(formData.get("roundStage") || "none");
        const roundStage = tournamentId && ROUND_STAGE_OPTIONS.some(([value]) => value === roundStageValue) ? roundStageValue : "none";
        const matchFormat = roundStage === "swiss" ? "single" : formData.get("matchFormat") === "match" ? "match" : "single";
        const rawResult = String(formData.get("result") || "win");
        const selectedResult = roundStage === "swiss" && rawResult === "draw" ? "win" : rawResult;
        const gameStats = matchFormat === "match" ? gameStatsFromScore(String(formData.get("matchScore") || "2-0")) : singleGameStats(selectedResult);
        const result = matchFormat === "match" ? resultFromGameStats(gameStats) : selectedResult;
        const matchType = normalizeMatchTypeName(formData.get("matchType") || getData().matchTypes[0] || "대전") || "대전";
        const isTeam3Type = matchType === TEAM3_MATCH_TYPE;
        const match = {
          id: state.editingMatchId || uid("match"),
          deckId,
          date: String(formData.get("date") || todayISO()),
          matchType,
          opponent: String(formData.get("opponent") || "").trim(),
          result,
          matchFormat,
          gameWins: gameStats.gameWins,
          gameLosses: gameStats.gameLosses,
          gameDraws: gameStats.gameDraws,
          tournamentId,
          roundStage,
          roundLabel: tournamentId ? String(formData.get("roundLabel") || "").trim() : "",
          playOrder: String(formData.get("playOrder") || "unknown"),
          // 3대3 팀전일 때만 팀 결과·자리 저장(다른 유형이면 빈 값)
          teamResult: isTeam3Type ? String(formData.get("teamResult") || "") : "",
          teamPosition: isTeam3Type ? String(formData.get("teamPosition") || "") : "",
          memo: String(formData.get("memo") || "").trim(),
          cardIds: [],
          cardNames: [],
          cardNumbers: [],
          createdAt: state.editingMatchId
            ? getData().matches.find((item) => item.id === state.editingMatchId)?.createdAt || new Date().toISOString()
            : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (!validateMatchBeforeSave(match)) return;

        if (state.editingMatchId) {
          getData().matches = getData().matches.map((item) => (item.id === state.editingMatchId ? match : item));
        } else {
          getData().matches.unshift(match);
        }
        rememberMatchDefaults(match);
        saveData();
        if (!state.editingMatchId && submitter?.value === "continue") {
          state.modal = "match";
          state.editingMatchId = null;
          state.prefillMatchTournamentId = match.tournamentId;
          state.prefillMatchRoundStage = match.roundStage || (match.tournamentId ? suggestedTournamentStage(match.tournamentId) : "");
          state.prefillMatchRoundLabel = match.tournamentId ? suggestedRoundLabel(match.tournamentId, state.prefillMatchRoundStage || "swiss") : "";
          notifyToast("전적 저장 완료", "다음 경기를 바로 입력할 수 있습니다.", "success", 1800);
          render();
          return;
        }
        closeModal();
      }

      function validateMatchBeforeSave(match) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date)) {
          alert("날짜를 확인해 주세요.");
          return false;
        }
        if (!match.opponent && !confirm("상대 덱 이름이 비어 있으면 매치업 통계가 쌓이지 않습니다. 그래도 저장할까요?")) return false;
        const deck = getDeck(match.deckId);
        if (deck) {
          const cards = deckCards(deck);
          const readiness = deckReadiness(cards);
          if (readiness.level !== "ready") {
            const message = cards.length
              ? `${deck.name} 덱은 아직 제출 기준이 아닙니다.\n${readiness.detail}\n\n그래도 이 덱으로 전적을 저장할까요?`
              : `${deck.name} 덱에 카드가 없습니다.\n카드별 승률과 덱 이미지 품질이 제한될 수 있습니다.\n\n그래도 저장할까요?`;
            if (!confirm(message)) return false;
          }
        }
        const duplicate = duplicateTournamentRound(match);
        if (duplicate) {
          const round = roundText(match) || match.roundLabel || "같은 라운드";
          if (!confirm(`${tournamentName(match.tournamentId)}의 ${round} 기록이 이미 있습니다.\n중복 라운드로 저장할까요?`)) return false;
        }
        return true;
      }

      function duplicateTournamentRound(match) {
        if (!match.tournamentId || !match.roundLabel) return null;
        const targetStage = match.roundStage || "none";
        const targetLabel = String(match.roundLabel || "").trim().toLowerCase();
        return getData().matches.find((item) => {
          if (item.id === match.id) return false;
          if (item.tournamentId !== match.tournamentId) return false;
          if ((item.roundStage || "none") !== targetStage) return false;
          return String(item.roundLabel || "").trim().toLowerCase() === targetLabel;
        });
      }

      function handleTournamentSubmit(form) {
        const formData = new FormData(form);
        const name = String(formData.get("name") || "").trim();
        if (!name) {
          alert("대회 이름을 입력해 주세요.");
          return;
        }
        const formatValue = String(formData.get("format") || "mixed");
        const cutValue = Number(formData.get("topCut"));
        const tournament = {
          id: state.editingTournamentId || uid("tournament"),
          name,
          date: String(formData.get("date") || todayISO()),
          format: TOURNAMENT_FORMAT_OPTIONS.some(([value]) => value === formatValue) ? formatValue : "mixed",
          topCut: TOURNAMENT_CUT_OPTIONS.some(([value]) => value === cutValue) ? cutValue : 4,
          location: String(formData.get("location") || "").trim(),
          memo: String(formData.get("memo") || "").trim(),
          createdAt: state.editingTournamentId
            ? getData().tournaments.find((item) => item.id === state.editingTournamentId)?.createdAt || new Date().toISOString()
            : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (state.editingTournamentId) {
          getData().tournaments = getData().tournaments.map((item) => (item.id === state.editingTournamentId ? tournament : item));
        } else {
          getData().tournaments.unshift(tournament);
        }
        saveData();
        closeModal();
      }

      function handleDeckSubmit(form) {
        cacheDeckDraftForm(form);
        const formData = new FormData(form);
        const name = String(formData.get("name") || "").trim();
        const colors = formData.getAll("colors").map(String);
        if (!name) {
          alert("덱 이름을 입력해 주세요.");
          return;
        }
        const hasIncompleteCard = state.deckDraftCards.some((card) => {
          const type = cardTypeLabels[card.type] ? card.type : "digimon";
          const needsLevel = type === "digimon" || type === "digiEgg";
          return !normalizeCardNumber(card.cardNumber) || !String(card.name || "").trim() || (needsLevel && !normalizeLevel(card.level));
        });
        if (hasIncompleteCard) {
          alert("카드 필수 정보가 비어 있는 카드가 있습니다. 디지몬/디지타마는 Lv까지 입력해 주세요.");
          return;
        }
        const overLimit = cardNumberOverLimit(state.deckDraftCards);
        if (overLimit) {
          alert(`${overLimit} 카드는 최대 4장까지만 투입할 수 있습니다.`);
          return;
        }
        const limitMessage = deckLimitViolation(state.deckDraftCards);
        if (limitMessage) {
          alert(limitMessage);
          return;
        }
        const payload = {
          name,
          colors: colors.length ? colors : ["blue"],
          note: String(formData.get("note") || "").trim(),
          cards: normalizeCards(state.deckDraftCards),
          updatedAt: new Date().toISOString(),
        };
        if (state.editingDeckId) {
          getData().decks = getData().decks.map((deck) => (deck.id === state.editingDeckId ? { ...deck, ...payload } : deck));
        } else {
          getData().decks.push({
            id: uid("deck"),
            ...payload,
            createdAt: new Date().toISOString(),
          });
        }
        saveData();
        closeModal();
      }

      function handleTypeSubmit(form) {
        const formData = new FormData(form);
        const typeName = normalizeMatchTypeName(formData.get("typeName") || "");
        if (!typeName) return;
        if (!getData().matchTypes.includes(typeName)) getData().matchTypes.push(typeName);
        saveData();
        render();
      }


    return {
      handleAction,
      handleEventSubmit,
      handleMatchSubmit,
      handleTournamentSubmit,
      handleDeckSubmit,
      handleTypeSubmit,
    };
  }

  const api = { createController };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.controller = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
