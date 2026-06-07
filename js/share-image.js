/**
 * 전적몬 — 공유 이미지(캔버스) 생성/다운로드 모듈 (모듈 분리 A3)
 *
 * 일일 전적 카드 이미지 + 덱 이미지(X/아카이브 레이아웃)를 캔버스로 그려 PNG로 저장하고,
 * X(트위터) 공유를 연다. 캔버스/DOM/네트워크에 의존하므로 의존성 주입으로 연결한다.
 *
 * 노출:
 *  - 브라우저: window.JJM.shareImage.createShareImage(deps) → { downloadDeckImage, downloadDailyShareImage, openDailyShareX }
 *  - Node(테스트): module.exports 동일 (스모크 테스트용)
 *
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function createShareImage(deps) {
    const {
      // 포매팅/공유 텍스트
      todayISO,
      shareDateValue,
      shareDateTitle,
      shareRecordText,
      shareRateText,
      shareScoreText,
      shareGameScoreText,
      hasMatchGameBreakdown,
      dailyShareSummary,
      dailyShareUsedDecks,
      dailyShareText,
      copyDailyShareText,
      // 덱/카드
      sortDeckCards,
      deckCards,
      deckCountSummary,
      normalizeDeck,
      normalizeCardNumber,
      shareCardImageSources,
      cardDisplayName,
      safeFileName,
      // 부가
      recordDiagnostic,
      notifyToast,
      // 상태/상수
      state,
      colorMap,
      DECK_LIMITS,
      CARD_IMAGE_LOAD_TIMEOUT_MS,
    } = deps;

    function drawShareRoundRect(ctx, x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function fillShareText(ctx, text, x, y, options = {}) {
      const {
        size = 28,
        weight = 800,
        color = "#e8f4f8",
        align = "left",
        baseline = "alphabetic",
        maxWidth,
      } = options;
      ctx.font = `${weight} ${size}px "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;
      ctx.fillText(String(text || ""), x, y, maxWidth);
    }

    function wrapShareLines(ctx, text, maxWidth, maxLines = 2) {
      const source = String(text || "").trim();
      if (!source) return [];
      const words = source.split(/\s+/);
      const lines = [];
      let line = "";
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth || !line) {
          line = next;
          return;
        }
        lines.push(line);
        line = word;
      });
      if (line) lines.push(line);
      if (lines.length <= maxLines) return lines;
      const clipped = lines.slice(0, maxLines);
      while (ctx.measureText(`${clipped[maxLines - 1]}...`).width > maxWidth && clipped[maxLines - 1].length > 1) {
        clipped[maxLines - 1] = clipped[maxLines - 1].slice(0, -1);
      }
      clipped[maxLines - 1] = `${clipped[maxLines - 1]}...`;
      return clipped;
    }

    function drawSharePanel(ctx, x, y, width, height, title, rows, rowFormatter, emptyText) {
      drawShareRoundRect(ctx, x, y, width, height, 18);
      ctx.fillStyle = "rgba(4, 10, 20, 0.68)";
      ctx.fill();
      ctx.strokeStyle = "rgba(25, 231, 255, 0.42)";
      ctx.lineWidth = 2;
      ctx.stroke();

      fillShareText(ctx, title, x + 26, y + 42, { size: 26, weight: 900, color: "#ffd21f" });
      ctx.font = '800 24px "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

      const visibleRows = rows.slice(0, 6);
      if (!visibleRows.length) {
        fillShareText(ctx, emptyText, x + 26, y + 94, { size: 24, weight: 700, color: "#8bb9da" });
        return;
      }

      visibleRows.forEach((row, index) => {
        const rowY = y + 91 + index * 43;
        const text = rowFormatter(row);
        const lines = wrapShareLines(ctx, text, width - 52, 1);
        fillShareText(ctx, lines[0], x + 26, rowY, { size: 24, weight: 800, color: "#e8f4f8" });
      });

      if (rows.length > visibleRows.length) {
        fillShareText(ctx, `+${rows.length - visibleRows.length}개 더`, x + 26, y + height - 24, { size: 20, weight: 800, color: "#8bb9da" });
      }
    }

    function drawDailyShareImage(canvas, summary) {
      const ctx = canvas.getContext("2d");
      const width = 1200;
      const height = 675;
      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(25, 231, 255, 0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "rgba(25, 231, 255, 0.26)");
      gradient.addColorStop(0.46, "rgba(255, 210, 31, 0.12)");
      gradient.addColorStop(1, "rgba(255, 59, 107, 0.16)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      drawShareRoundRect(ctx, 36, 32, width - 72, height - 64, 24);
      ctx.fillStyle = "rgba(9, 19, 34, 0.86)";
      ctx.fill();
      ctx.strokeStyle = "#19e7ff";
      ctx.lineWidth = 4;
      ctx.stroke();

      fillShareText(ctx, "전적몬", 72, 93, { size: 44, weight: 900, color: "#19e7ff" });
      fillShareText(ctx, "CARD BATTLE LOG", 74, 126, { size: 18, weight: 900, color: "#ffd21f" });
      fillShareText(ctx, shareDateTitle(summary.date), width - 78, 92, { size: 32, weight: 900, color: "#e8f4f8", align: "right" });

      const stats = summary.stats;
      fillShareText(ctx, shareRecordText(stats), 72, 204, { size: 54, weight: 900, color: "#ffffff" });
      fillShareText(ctx, `승률 ${shareRateText(stats.wins, stats.total)}`, 72, 253, { size: 32, weight: 900, color: "#ffd21f" });
      const ringX = 1000;
      const ringY = 218;
      const radius = 82;
      const rate = stats.total ? stats.wins / stats.total : 0;
      ctx.lineWidth = 26;
      ctx.strokeStyle = "rgba(119, 160, 201, 0.24)";
      ctx.beginPath();
      ctx.arc(ringX, ringY, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#19e7ff";
      ctx.beginPath();
      ctx.arc(ringX, ringY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rate);
      ctx.stroke();
      fillShareText(ctx, shareRateText(stats.wins, stats.total), ringX, ringY + 9, { size: 34, weight: 900, color: "#ffffff", align: "center", baseline: "middle" });

      drawSharePanel(
        ctx,
        72,
        306,
        498,
        244,
        "사용 덱",
        summary.decks,
        (row) => `${row.label} ${shareScoreText(row)}${hasMatchGameBreakdown(row) ? ` / G ${shareGameScoreText(row)}` : ""} (${shareRateText(row.wins, row.total)})`,
        "덱 기록 없음"
      );
      drawSharePanel(
        ctx,
        612,
        306,
        516,
        244,
        "상대별 기록",
        summary.matchups,
        (row) => `vs ${row.opponent} ${shareScoreText(row)}${hasMatchGameBreakdown(row) ? ` / G ${shareGameScoreText(row)}` : ""}`,
        "상대 기록 없음"
      );

      fillShareText(ctx, "#디지몬카드게임 #전적몬", 72, height - 72, { size: 26, weight: 900, color: "#ffd21f" });
      fillShareText(ctx, "jeonjeokmon", width - 72, height - 72, { size: 20, weight: 900, color: "#8bb9da", align: "right" });
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("blob read failed"));
        reader.readAsDataURL(blob);
      });
    }

    function loadImageElement(src) {
      if (!src) return Promise.resolve(null);
      return new Promise((resolve) => {
        const image = new Image();
        let settled = false;
        const done = (result) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(result);
        };
        const timer = window.setTimeout(() => done(null), CARD_IMAGE_LOAD_TIMEOUT_MS);
        image.onload = () => {
          done(image);
        };
        image.onerror = () => {
          done(null);
        };
        if (!String(src).startsWith("data:")) image.crossOrigin = "anonymous";
        image.src = src;
      });
    }

    async function loadShareCardImage(src) {
      if (!src) return null;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeout = controller ? window.setTimeout(() => controller.abort(), CARD_IMAGE_LOAD_TIMEOUT_MS) : null;
      try {
        const response = await fetch(src, { cache: "no-store", signal: controller?.signal });
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return null;
        return await loadImageElement(await blobToDataUrl(blob));
      } catch (error) {
        recordDiagnostic("share-image-fetch-failed", error?.message || "Image fetch failed", { src });
        return loadImageElement(src);
      } finally {
        if (timeout) window.clearTimeout(timeout);
      }
    }

    async function loadFirstShareCardImage(sources) {
      for (const src of sources) {
        const image = await loadShareCardImage(src);
        if (image) return image;
      }
      return null;
    }

    async function inspectDeckImages(deck) {
      const cards = sortDeckCards(deckCards(deck));
      const entries = await Promise.all(
        cards.map(async (card) => {
          const image = await loadFirstShareCardImage(shareCardImageSources(card));
          return [normalizeCardNumber(card.cardNumber), { card, image }];
        })
      );
      const images = new Map(entries.map(([cardNumber, entry]) => [cardNumber, entry.image]));
      const missingCards = entries.filter(([, entry]) => !entry.image).map(([, entry]) => entry.card);
      return { images, missingCards, missingImageCount: missingCards.length };
    }

    function drawShareCardImage(ctx, image, x, y, width, height) {
      const imageWidth = image.naturalWidth || image.width;
      const imageHeight = image.naturalHeight || image.height;
      const sourceRatio = imageWidth / imageHeight;
      const targetRatio = width / height;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = imageWidth;
      let sourceHeight = imageHeight;

      if (sourceRatio > targetRatio) {
        sourceWidth = imageHeight * targetRatio;
        sourceX = (imageWidth - sourceWidth) / 2;
      } else {
        sourceHeight = imageWidth / targetRatio;
        sourceY = (imageHeight - sourceHeight) / 2;
      }

      ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    }

    function drawDeckSharePlaceholder(ctx, card, x, y, width, height) {
      const color = colorMap[card.color] || "#94a3b8";
      ctx.save();
      drawShareRoundRect(ctx, x, y, width, height, 10);
      ctx.clip();
      ctx.fillStyle = "#07101e";
      ctx.fill();
      const placeholderGradient = ctx.createLinearGradient(x, y, x + width, y + height);
      placeholderGradient.addColorStop(0, "rgba(25, 231, 255, 0.34)");
      placeholderGradient.addColorStop(0.52, "rgba(2, 8, 18, 0.82)");
      placeholderGradient.addColorStop(1, "rgba(255, 210, 31, 0.28)");
      ctx.fillStyle = placeholderGradient;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      for (let lineX = x - height; lineX < x + width; lineX += 22) {
        ctx.fillRect(lineX, y, 2, height * 1.8);
      }
      ctx.restore();

      fillShareText(ctx, normalizeCardNumber(card.cardNumber), x + width / 2, y + height * 0.34, {
        size: Math.max(16, Math.round(width * 0.13)),
        weight: 900,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
        maxWidth: width - 18,
      });
      wrapShareLines(ctx, card.name, width - 20, 2).forEach((line, index) => {
        fillShareText(ctx, line, x + width / 2, y + height * 0.52 + index * 24, {
          size: Math.max(13, Math.round(width * 0.09)),
          weight: 800,
          color: "#e8f4f8",
          align: "center",
          baseline: "middle",
          maxWidth: width - 18,
        });
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      drawShareRoundRect(ctx, x + 1.5, y + 1.5, width - 3, height - 3, 8);
      ctx.stroke();
    }

    function drawDeckShareCard(ctx, card, image, x, y, width, height) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.46)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      drawShareRoundRect(ctx, x, y, width, height, 10);
      ctx.clip();
      if (image) drawShareCardImage(ctx, image, x, y, width, height);
      else drawDeckSharePlaceholder(ctx, card, x, y, width, height);
      ctx.restore();

      ctx.strokeStyle = image ? "rgba(232, 244, 248, 0.72)" : "rgba(25, 231, 255, 0.86)";
      ctx.lineWidth = 3;
      drawShareRoundRect(ctx, x, y, width, height, 10);
      ctx.stroke();

      const badgeSize = Math.max(30, Math.round(width * 0.24));
      const badgeX = x + width - badgeSize / 2 - 8;
      const badgeY = y + badgeSize / 2 + 8;
      ctx.fillStyle = "#ffd21f";
      ctx.strokeStyle = "#04101d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      fillShareText(ctx, `x${Number(card.count) || 0}`, badgeX, badgeY + 1, {
        size: Math.max(15, Math.round(width * 0.12)),
        weight: 900,
        color: "#08111f",
        align: "center",
        baseline: "middle",
      });
    }

    function deckShareImageLayoutOptions(layout, cardCount) {
      if (layout === "archive") {
        return { columns: 10, width: 1600, padding: 40, gap: 10, headerHeight: 96, sectionHeader: 40, sectionGap: 24 };
      }
      const columns = cardCount > 42 ? 16 : cardCount > 30 ? 14 : cardCount > 24 ? 12 : 10;
      return { columns, width: 1600, padding: 38, gap: 8, headerHeight: 86, sectionHeader: 34, sectionGap: 18 };
    }

    async function drawDeckShareImage(canvas, deck, date, options = {}) {
      const ctx = canvas.getContext("2d");
      const cards = sortDeckCards(deckCards(deck));
      const mainCards = cards.filter((card) => card.type !== "digiEgg");
      const eggCards = cards.filter((card) => card.type === "digiEgg");
      const selectedLayout = options.layout || state.deckImageLayout || "x";
      const layout = deckShareImageLayoutOptions(selectedLayout, cards.length);
      const { columns, width, padding, gap, headerHeight, sectionHeader, sectionGap } = layout;
      const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
      const cardHeight = cardWidth * 1.4;
      const eggSectionGap = eggCards.length ? sectionGap : 0;
      const mainRows = Math.max(1, Math.ceil(mainCards.length / columns));
      const eggRows = eggCards.length ? Math.ceil(eggCards.length / columns) : 0;
      const summary = deckCountSummary(cards);
      const calculatedHeight = Math.ceil(
        padding +
          headerHeight +
          sectionHeader +
          mainRows * cardHeight +
          Math.max(0, mainRows - 1) * gap +
          eggSectionGap +
          (eggRows ? sectionHeader + eggRows * cardHeight + Math.max(0, eggRows - 1) * gap : 0) +
          padding
      );
      const height = selectedLayout === "x" ? Math.max(900, calculatedHeight) : calculatedHeight;

      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(25, 231, 255, 0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const deckGradient = ctx.createLinearGradient(0, 0, width, height);
      deckGradient.addColorStop(0, "rgba(25, 231, 255, 0.24)");
      deckGradient.addColorStop(0.48, "rgba(255, 210, 31, 0.09)");
      deckGradient.addColorStop(1, "rgba(255, 59, 107, 0.16)");
      ctx.fillStyle = deckGradient;
      ctx.fillRect(0, 0, width, height);

      fillShareText(ctx, deck.name || "이름 없는 덱", padding, selectedLayout === "archive" ? 56 : 52, {
        size: selectedLayout === "archive" ? 40 : 38,
        weight: 900,
        color: "#ffffff",
        maxWidth: width - padding * 2 - 300,
      });
      fillShareText(ctx, `${date} · 메인 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg}`, padding, selectedLayout === "archive" ? 96 : 88, {
        size: selectedLayout === "archive" ? 24 : 22,
        weight: 900,
        color: "#ffd21f",
      });
      fillShareText(ctx, "전적몬", width - padding, selectedLayout === "archive" ? 60 : 56, { size: selectedLayout === "archive" ? 38 : 36, weight: 900, color: "#19e7ff", align: "right" });
      fillShareText(ctx, "DECK IMAGE", width - padding, selectedLayout === "archive" ? 98 : 90, { size: 18, weight: 900, color: "#8bb9da", align: "right" });

      const images =
        options.preloadedImages instanceof Map
          ? options.preloadedImages
          : new Map(
              await Promise.all(cards.map(async (card) => [normalizeCardNumber(card.cardNumber), await loadFirstShareCardImage(shareCardImageSources(card))]))
            );
      const missingImageCount = cards.filter((card) => !images.get(normalizeCardNumber(card.cardNumber))).length;

      let cursorY = padding + headerHeight;
      const drawSection = (title, sectionCards) => {
        fillShareText(ctx, title, padding, cursorY + 28, {
          size: 26,
          weight: 900,
          color: "#ffd21f",
        });
        cursorY += sectionHeader;
        sectionCards.forEach((card, index) => {
          const col = index % columns;
          const row = Math.floor(index / columns);
          const x = padding + col * (cardWidth + gap);
          const y = cursorY + row * (cardHeight + gap);
          drawDeckShareCard(ctx, card, images.get(normalizeCardNumber(card.cardNumber)), x, y, cardWidth, cardHeight);
        });
        const rows = Math.max(1, Math.ceil(sectionCards.length / columns));
        cursorY += rows * cardHeight + Math.max(0, rows - 1) * gap;
      };

      drawSection("메인 덱", mainCards);
      if (eggCards.length) {
        cursorY += eggSectionGap;
        drawSection("디지타마 덱", eggCards);
      }
      if (missingImageCount) {
        fillShareText(ctx, `이미지 대체 표시 ${missingImageCount}종`, width - padding, height - 18, {
          size: 16,
          weight: 900,
          color: "#ffd21f",
          align: "right",
        });
      }
      return { missingImageCount, width, height, layout: selectedLayout };
    }

    function canvasDownloadUrl(canvas) {
      return new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => {
            if (blob) resolve(URL.createObjectURL(blob));
            else resolve(canvas.toDataURL("image/png"));
          }, "image/png");
        } catch (error) {
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch (fallbackError) {
            reject(fallbackError);
          }
        }
      });
    }

    async function downloadCanvasPng(canvas, fileName) {
      const downloadUrl = await canvasDownloadUrl(canvas);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      anchor.click();
      if (String(downloadUrl).startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }

    async function downloadDeckImage(deck, date = todayISO(), options = {}) {
      const { notify = true } = options;
      const printableDeck = normalizeDeck(deck || {});
      const cards = deckCards(printableDeck);
      if (!cards.length) {
        if (notify) notifyToast("저장할 카드 없음", "덱에 카드가 없습니다. 먼저 덱을 구성해 주세요.", "info");
        return false;
      }
      try {
        const inspection = await inspectDeckImages(printableDeck);
        if (notify && inspection.missingImageCount) {
          recordDiagnostic("deck-image-missing", `${inspection.missingImageCount} card images missing`, {
            deckId: printableDeck.id || "",
            deckName: printableDeck.name || "",
            cards: inspection.missingCards.slice(0, 10).map((card) => normalizeCardNumber(card.cardNumber)),
          });
          const examples = inspection.missingCards.slice(0, 5).map(cardDisplayName).join(", ");
          const extra = inspection.missingImageCount > 5 ? ` 외 ${inspection.missingImageCount - 5}종` : "";
          const shouldContinue = confirm(
            `카드 이미지 ${inspection.missingImageCount}종을 불러오지 못했습니다.\n${examples}${extra}\n\n대체 카드로 표시해서 저장할까요?`
          );
          if (!shouldContinue) {
            notifyToast("덱 이미지 저장 취소", "이미지가 준비되지 않은 카드를 확인한 뒤 다시 시도해 주세요.", "info");
            return false;
          }
        } else if (notify) {
          notifyToast("카드 이미지 준비 완료", `${cards.length}종 카드 이미지를 확인했습니다.`, "success", 1600);
        }
        const canvas = document.createElement("canvas");
        const layout = options.layout || state.deckImageLayout || "x";
        const result = await drawDeckShareImage(canvas, printableDeck, date, { layout, preloadedImages: inspection.images });
        const suffix = layout === "archive" ? "large" : "x";
        // 시각 토큰(HHMMSS)을 붙여 같은 덱·같은 날 여러 번 저장해도 파일명이 겹치지 않게 한다.
        // (파일명이 같으면 브라우저가 예전 파일을 그대로 두고 (1)을 붙여, 덱을 수정해도
        //  사용자가 다운로드 폴더에서 옛 버전 이미지를 열게 되는 혼선을 막는다.)
        const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
        const fileName = `jeonjeokmon-${safeFileName(printableDeck.name)}-${date}-${suffix}-${stamp}.png`;
        await downloadCanvasPng(canvas, fileName);
        if (notify) {
          notifyToast(
            "덱 이미지 저장",
            result?.missingImageCount ? `${fileName} · 이미지 ${result.missingImageCount}종은 대체 카드로 표시됨` : fileName,
            result?.missingImageCount ? "warning" : "success"
          );
        }
        return true;
      } catch (error) {
        recordDiagnostic("deck-image-download-failed", error?.message || "Deck image download failed", {
          deckId: printableDeck.id || "",
          deckName: printableDeck.name || "",
        });
        if (notify) notifyToast("이미지 저장 실패", "카드 이미지 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", "warning");
        return false;
      }
    }

    async function downloadDailyShareImage(date = shareDateValue()) {
      const summary = dailyShareSummary(date);
      if (!summary.stats.total) {
        notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
        return;
      }
      const decks = dailyShareUsedDecks(summary);
      if (!decks.length) {
        notifyToast("저장할 덱 없음", "선택한 날짜의 전적에 저장된 덱 정보가 없습니다.", "info");
        return;
      }
      try {
        let savedCount = 0;
        for (const deck of decks) {
          if (await downloadDeckImage(deck, date, { notify: false })) savedCount += 1;
        }
        if (savedCount) {
          notifyToast("사용 덱 이미지 저장", savedCount === 1 ? "덱 이미지 1장을 저장했습니다." : `덱 이미지 ${savedCount}장을 저장했습니다.`, "success");
        } else {
          notifyToast("이미지 저장 실패", "저장할 수 있는 덱 이미지를 만들지 못했습니다.", "warning");
        }
      } catch (error) {
        notifyToast("이미지 저장 실패", "카드 이미지 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", "warning");
      }
    }

    function openDailyShareX() {
      const text = dailyShareText();
      if (!text) {
        notifyToast("공유할 전적 없음", "선택한 날짜에 기록된 전적이 없습니다.", "info");
        return;
      }
      const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
      const opened = window.open(url, "_blank");
      if (opened) {
        opened.opener = null;
        return;
      }
      copyDailyShareText();
      notifyToast("팝업이 차단됨", "공유문을 복사했으니 X에 붙여넣어 주세요.", "info");
    }

    // 공개 API (app.js가 직접 호출하는 진입점) + drawDailyShareImage(향후 사용 대비 노출)
    return { downloadDeckImage, downloadDailyShareImage, openDailyShareX, drawDailyShareImage };
  }

  const api = { createShareImage };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.shareImage = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
