/**
 * js/data-io.js — 파일/클립보드/설치 등 브라우저 IO 액션 (트랙 B: 코어 모듈화)
 *
 * app.js에서 "함수 이동 + 동작 보존"으로 분리. 덱 내보내기/가져오기, 백업/복원,
 * 전체 삭제, PWA 설치, 앱 새로고침, 클립보드 복사를 담당한다.
 * 전부 런타임 전용(handleAction/리스너에서 호출) — init 시점 소비자 없음.
 *
 * DI 주의:
 * - restoreBackup/clearAllData 가 data 를 통째로 교체 → getData()/setData() 쌍 주입
 * - copyDailyShareText 는 share-image 팩토리(먼저 생성)에도 주입되므로
 *   app.js 쪽에서 지연 화살표로 감싸 전달한다
 * - catalogCardByNumber 는 deck-import 팩토리 주입 + app.js 내부 사용으로 app.js 잔류
 *
 * - 브라우저: window.JJM.dataIO.createDataIO(deps)
 * - Node(테스트): module.exports 동일
 */
(function () {
  function createDataIO(deps) {
    const {
      APP_VERSION,
      getData,
      setData,
      state,
      saveData,
      cloneDataSnapshot,
      saveRecoveryPoint,
      notifyUndo,
      mergeData,
      createDefaultData,
      normalizeDeck,
      deckCards,
      sortDeckCards,
      deckLimitViolation,
      safeFileName,
      todayISO,
      dataSummary,
      formatSyncTime,
      cardDataSummary,
      cardDataCommandsText,
      dailyShareText,
      parseDeckImportSource,
      enrichImportedDecks,
      normalizeImportedDeck,
      notifyToast,
      closeModal,
      render,
    } = deps;

    function deckExportText(deck) {
      const cards = deckCards(deck);
      const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
      const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
      const cardLine = (card) => `${card.count} ${card.cardNumber} ${card.name}`.trim();
      return [
        `덱 이름: ${deck.name || "이름 없는 덱"}`,
        "",
        "메인 덱",
        ...mainCards.map(cardLine),
        "",
        "디지타마",
        ...eggCards.map(cardLine),
      ].join("\n");
    }

    function deckExportCodeText(deck) {
      const cards = deckCards(deck);
      const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
      const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
      const entries = ["Exported from digimonmeta.com"];
      [...mainCards, ...eggCards].forEach((card) => {
        const cardNumber = String(card.cardNumber || "").trim().toUpperCase();
        if (!cardNumber) return;
        const count = Math.max(0, Math.floor(Number(card.count) || 0));
        for (let index = 0; index < count; index += 1) entries.push(cardNumber);
      });
      return JSON.stringify(entries);
    }

    async function copyDeckExportCode(deck) {
      const printableDeck = normalizeDeck(deck || {});
      if (!deckCards(printableDeck).length) {
        alert("내보낼 카드가 없습니다. 덱을 먼저 구성해 주세요.");
        return;
      }
      const code = deckExportCodeText(printableDeck);
      try {
        await navigator.clipboard.writeText(code);
        notifyToast("덱 코드 복사 완료", "다른 프로그램의 덱 가져오기에 붙여넣을 수 있습니다.", "success");
      } catch (error) {
        window.prompt("아래 덱 코드를 복사해 주세요.", code);
      }
    }

    function createDeckExportPayload(deck) {
      const printableDeck = normalizeDeck(deck || {});
      return {
        format: "jeonjeokmon-deck-v1",
        exportedAt: new Date().toISOString(),
        deck: {
          name: printableDeck.name,
          colors: printableDeck.colors,
          note: printableDeck.note,
          cards: deckCards(printableDeck).map((card) => ({
            cardNumber: card.cardNumber,
            level: card.level,
            name: card.name,
            type: card.type,
            count: card.count,
          })),
        },
        text: deckExportText(printableDeck),
      };
    }

    function downloadDeckExport(deck) {
      const printableDeck = normalizeDeck(deck || {});
      if (!deckCards(printableDeck).length) {
        alert("내보낼 카드가 없습니다. 덱을 먼저 구성해 주세요.");
        return;
      }
      const blob = new Blob([JSON.stringify(createDeckExportPayload(printableDeck), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(printableDeck.name)}_deck_${todayISO()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    async function handleDeckImportSubmit(form) {
      if (state.importingDecks) return;
      const formData = new FormData(form);
      const fallbackName = String(formData.get("name") || "").trim();
      const source = String(formData.get("deckImportText") || "").trim();
      const submitButton = document.querySelector('[form="deck-import-form"]');
      state.importingDecks = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "카드 정보 확인 중";
      }

      let importedDecks = [];
      try {
        const enrichedDecks = await enrichImportedDecks(parseDeckImportSource(source, fallbackName));
        importedDecks = enrichedDecks.map((deck) => normalizeImportedDeck(deck, fallbackName)).filter((deck) => deckCards(deck).length);
      } finally {
        state.importingDecks = false;
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "가져오기";
        }
      }

      if (!importedDecks.length) {
        alert("가져올 덱을 찾지 못했습니다. 카드번호와 매수를 확인해 주세요.");
        return;
      }

      const invalidDeck = importedDecks.find((deck) => deckLimitViolation(deck.cards));
      if (invalidDeck) {
        alert(`${invalidDeck.name}: ${deckLimitViolation(invalidDeck.cards)}`);
        return;
      }

      getData().decks.push(...importedDecks);
      saveData();
      closeModal();
    }

    function readDeckImportFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const modal = document.querySelector(".modal-panel");
        const textarea = modal?.querySelector('textarea[name="deckImportText"]');
        const nameInput = modal?.querySelector('input[name="name"]');
        if (textarea) textarea.value = String(reader.result || "");
        if (nameInput && !nameInput.value) nameInput.value = file.name.replace(/\.[^.]+$/, "");
      };
      reader.readAsText(file);
    }

    function downloadBackup() {
      const data = getData();
      const exportedAt = new Date().toISOString();
      data.settings = { ...(data.settings || {}), lastBackupAt: exportedAt };
      saveData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jeonjeokmon-backup-${todayISO()}-${data.decks.length}decks-${data.matches.length}matches.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifyToast("백업 파일 저장", `${dataSummary()} · ${formatSyncTime(exportedAt)}`, "success");
      if (state.tab === "settings") render();
    }

    function restoreBackup(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const restored = JSON.parse(String(reader.result || ""));
          const next = mergeData(restored);
          next.settings = { ...(next.settings || {}), lastRestoredAt: new Date().toISOString() };
          setData(next);
          saveData();
          state.selected.clear();
          notifyToast("백업 파일 불러오기 완료", dataSummary(), "success");
          render();
        } catch (error) {
          alert("백업 파일을 읽을 수 없습니다.");
          notifyToast("백업 파일 불러오기 실패", "파일 형식을 확인해 주세요.", "danger", 7000);
        }
      };
      reader.readAsText(file);
    }

    function clearAllData() {
      const cloudNote = state.authUser ? "\n\n로그인 중이라 클라우드에도 빈 데이터가 저장됩니다." : "";
      if (!confirm(`모든 데이터를 삭제하고 처음 상태로 되돌릴까요?${cloudNote}`)) return;
      if (state.authUser && !confirm("정말 진행할까요? 다른 기기에서도 빈 데이터로 동기화됩니다.")) return;
      const snapshot = cloneDataSnapshot();
      saveRecoveryPoint(snapshot, "전체 삭제 전");
      setData(createDefaultData());
      state.selected.clear();
      state.filters = { query: "", result: "all", deck: "all", type: "all" };
      state.memoOnly = false;
      state.cloudConflict = null;
      saveData();
      notifyToast("전체 삭제 완료", state.authUser ? "클라우드에도 반영합니다." : "이 기기 데이터를 비웠습니다.", "warning", 6000);
      notifyUndo("전체 삭제됨", snapshot, "삭제 전 데이터로 되돌릴 수 있습니다.");
      render();
    }

    async function refreshAppVersion() {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if (window.caches?.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("jeonjeokmon-shell-")).map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.warn("App refresh cleanup failed", error);
      } finally {
        window.location.reload();
      }
    }

    async function installPwa() {
      if (state.pwaInstalled) {
        notifyToast("이미 설치됨", "전적몬이 앱 모드로 실행 중입니다.", "info");
        return;
      }
      if (!state.installPrompt) {
        alert("브라우저 메뉴에서 '홈 화면에 추가' 또는 '앱 설치'를 선택해 주세요.");
        return;
      }
      const promptEvent = state.installPrompt;
      state.installPrompt = null;
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        state.pwaInstalled = true;
        notifyToast("설치 완료", "홈 화면에서 전적몬을 열 수 있습니다.", "success");
      } else {
        notifyToast("설치 취소됨", "나중에 다시 설치할 수 있습니다.", "info");
      }
      render();
    }

    async function copyCardUpdateCommands() {
      const text = cardDataCommandsText();
      try {
        await navigator.clipboard.writeText(text);
        notifyToast("갱신 명령 복사 완료", "터미널에 붙여넣어 카드 데이터를 갱신할 수 있습니다.", "success");
      } catch (error) {
        window.prompt("아래 명령을 복사해 주세요.", text);
      }
    }

    async function copyDailyShareText() {
      const text = dailyShareText();
      if (!text) {
        notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        notifyToast("전적 공유문 복사 완료", "X에 바로 붙여넣을 수 있습니다.", "success");
      } catch (error) {
        window.prompt("아래 전적 공유문을 복사해 주세요.", text);
      }
    }

    function downloadCardDataStatus() {
      const summary = cardDataSummary();
      const payload = {
        generatedAt: new Date().toISOString(),
        site: "전적몬",
        summary,
        versions: {
          app: document.querySelector('script[src^="app.js"]')?.getAttribute("src") || "",
          styles: document.querySelector('link[href^="styles.css"]')?.getAttribute("href") || "",
          catalog: document.querySelector('script[src^="card-catalog.js"]')?.getAttribute("src") || "",
          effects: document.querySelector('script[src^="korean-card-effects.js"]')?.getAttribute("src") || "",
          serviceWorker: `sw.js?v=${APP_VERSION}`,
        },
        updateCommands: cardDataCommandsText().split("\n"),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jeonjeokmon-card-data-status-${todayISO()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      notifyToast("카드 데이터 상태 저장", `${summary.catalogCount.toLocaleString("ko-KR")}장 카탈로그`, "success");
    }

    return {
      deckExportText,
      deckExportCodeText,
      copyDeckExportCode,
      createDeckExportPayload,
      downloadDeckExport,
      handleDeckImportSubmit,
      readDeckImportFile,
      downloadBackup,
      restoreBackup,
      clearAllData,
      refreshAppVersion,
      installPwa,
      copyCardUpdateCommands,
      copyDailyShareText,
      downloadCardDataStatus,
    };
  }

  const api = { createDataIO };

  if (typeof window !== "undefined") {
    window.JJM = window.JJM || {};
    window.JJM.dataIO = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
