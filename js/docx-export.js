/**
 * 전적몬 — 덱 레시피 인쇄 / DOCX 내보내기 모듈 (모듈 분리 A2)
 *
 * 구성:
 *  - 모듈 레벨: 순수 ZIP/바이트 헬퍼 + 범용 DOCX(OOXML) DOM 헬퍼 (외부 의존 없음)
 *  - createDeckRecipeExport(deps): 덱 데이터에 의존하는 기능을 의존성 주입으로 생성
 *
 * 노출:
 *  - 브라우저: window.JJM.docx = { createDeckRecipeExport, _internals }
 *  - Node(테스트): module.exports 동일
 *
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  // 레시피 레이아웃 상수 (DOCX/인쇄 전용)
  const DECK_RECIPE_MAIN_MIN_ROWS = 31;
  const DECK_RECIPE_EGG_MIN_ROWS = 3;
  const DECK_RECIPE_ROW_HEIGHT_MM = 6.4;
  const DECK_RECIPE_ROW_HEIGHT_TWIPS = 363;
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  // ---------------------------------------------------------------------------
  // 순수 ZIP / 바이트 헬퍼
  // ---------------------------------------------------------------------------
  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function readUint16(view, offset) {
    return view.getUint16(offset, true);
  }

  function readUint32(view, offset) {
    return view.getUint32(offset, true);
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value, true);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function parseZipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocdOffset = -1;
    for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
      if (readUint32(view, offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("DOCX 템플릿 구조를 읽을 수 없습니다.");

    const totalEntries = readUint16(view, eocdOffset + 10);
    let centralOffset = readUint32(view, eocdOffset + 16);
    const decoder = new TextDecoder();
    const entries = [];

    for (let index = 0; index < totalEntries; index += 1) {
      if (readUint32(view, centralOffset) !== 0x02014b50) throw new Error("DOCX 중앙 디렉터리를 읽을 수 없습니다.");
      const versionMade = readUint16(view, centralOffset + 4);
      const versionNeeded = readUint16(view, centralOffset + 6);
      const flags = readUint16(view, centralOffset + 8) & ~0x08;
      const method = readUint16(view, centralOffset + 10);
      const modTime = readUint16(view, centralOffset + 12);
      const modDate = readUint16(view, centralOffset + 14);
      const crc = readUint32(view, centralOffset + 16);
      const compressedSize = readUint32(view, centralOffset + 20);
      const uncompressedSize = readUint32(view, centralOffset + 24);
      const nameLength = readUint16(view, centralOffset + 28);
      const extraLength = readUint16(view, centralOffset + 30);
      const commentLength = readUint16(view, centralOffset + 32);
      const internalAttrs = readUint16(view, centralOffset + 36);
      const externalAttrs = readUint32(view, centralOffset + 38);
      const localHeaderOffset = readUint32(view, centralOffset + 42);
      const nameBytes = bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength);
      const name = decoder.decode(nameBytes);

      if (readUint32(view, localHeaderOffset) !== 0x04034b50) throw new Error("DOCX 로컬 헤더를 읽을 수 없습니다.");
      const localNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

      entries.push({
        name,
        versionMade,
        versionNeeded,
        flags,
        method,
        modTime,
        modDate,
        crc,
        compressedSize,
        uncompressedSize,
        internalAttrs,
        externalAttrs,
        rawData: bytes.slice(dataOffset, dataOffset + compressedSize),
      });
      centralOffset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function buildZip(entries) {
    const encoder = new TextEncoder();
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, entry.versionNeeded || 20);
      writeUint16(localView, 6, entry.flags || 0);
      writeUint16(localView, 8, entry.method);
      writeUint16(localView, 10, entry.modTime || 0);
      writeUint16(localView, 12, entry.modDate || 0);
      writeUint32(localView, 14, entry.crc);
      writeUint32(localView, 18, entry.compressedSize);
      writeUint32(localView, 22, entry.uncompressedSize);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      local.set(nameBytes, 30);
      fileParts.push(local, entry.rawData);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, entry.versionMade || 20);
      writeUint16(centralView, 6, entry.versionNeeded || 20);
      writeUint16(centralView, 8, entry.flags || 0);
      writeUint16(centralView, 10, entry.method);
      writeUint16(centralView, 12, entry.modTime || 0);
      writeUint16(centralView, 14, entry.modDate || 0);
      writeUint32(centralView, 16, entry.crc);
      writeUint32(centralView, 20, entry.compressedSize);
      writeUint32(centralView, 24, entry.uncompressedSize);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, entry.internalAttrs || 0);
      writeUint32(centralView, 38, entry.externalAttrs || 0);
      writeUint32(centralView, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + entry.rawData.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    writeUint32(eocdView, 0, 0x06054b50);
    writeUint16(eocdView, 8, entries.length);
    writeUint16(eocdView, 10, entries.length);
    writeUint32(eocdView, 12, centralSize);
    writeUint32(eocdView, 16, centralOffset);
    return new Blob([...fileParts, ...centralParts, eocd], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  // ---------------------------------------------------------------------------
  // 범용 OOXML(DOCX) DOM 헬퍼
  // ---------------------------------------------------------------------------
  function wordChildElements(node, localName) {
    return Array.from(node.childNodes).filter((child) => child.nodeType === 1 && child.localName === localName && child.namespaceURI === W_NS);
  }

  function wordDescendantElements(node, localName) {
    return Array.from(node.getElementsByTagNameNS(W_NS, localName));
  }

  function descendantElements(node, localName) {
    return Array.from(node.getElementsByTagName("*")).filter((child) => child.localName === localName);
  }

  function closestElement(node, localName) {
    let current = node;
    while (current && current.nodeType === 1) {
      if (current.localName === localName) return current;
      current = current.parentNode;
    }
    return null;
  }

  function removeNode(node) {
    if (node?.parentNode) node.parentNode.removeChild(node);
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function removeDocxRecipeDecorations(doc) {
    descendantElements(doc, "AlternateContent").forEach((content) => {
      if (!compactText(content.textContent).includes("덱레시피제출양식")) return;
      removeNode(closestElement(content, "p") || content);
    });

    descendantElements(doc, "wsp").forEach((shape) => {
      if (descendantElements(shape, "txbx").length) return;
      removeNode(shape);
    });

    descendantElements(doc, "Fallback").forEach(removeNode);
    descendantElements(doc, "pict").forEach(removeNode);
  }

  function ensureWordChild(parent, localName, insertFirst = false) {
    let child = wordChildElements(parent, localName)[0];
    if (!child) {
      child = parent.ownerDocument.createElementNS(W_NS, `w:${localName}`);
      if (insertFirst && parent.firstChild) parent.insertBefore(child, parent.firstChild);
      else parent.appendChild(child);
    }
    return child;
  }

  function removeWordChildren(parent, localName) {
    wordChildElements(parent, localName).forEach((child) => child.remove());
  }

  function setWordAttribute(node, name, value) {
    node.setAttributeNS(W_NS, `w:${name}`, String(value));
  }

  function setDocxPageSetup(doc) {
    const body = wordChildElements(doc.documentElement, "body")[0];
    const sectionProps = wordDescendantElements(doc, "sectPr");
    const sectPr = sectionProps[sectionProps.length - 1] || ensureWordChild(body, "sectPr");
    const pgSz = ensureWordChild(sectPr, "pgSz", true);
    setWordAttribute(pgSz, "w", 11906);
    setWordAttribute(pgSz, "h", 16838);
    pgSz.removeAttribute("w:orient");

    const pgMar = ensureWordChild(sectPr, "pgMar");
    setWordAttribute(pgMar, "top", 260);
    setWordAttribute(pgMar, "right", 260);
    setWordAttribute(pgMar, "bottom", 260);
    setWordAttribute(pgMar, "left", 260);
    setWordAttribute(pgMar, "header", 0);
    setWordAttribute(pgMar, "footer", 0);
    setWordAttribute(pgMar, "gutter", 0);
  }

  function setDocxRunFontSize(root, sizeHalfPoints) {
    wordDescendantElements(root, "r").forEach((run) => {
      const runProps = ensureWordChild(run, "rPr", true);
      removeWordChildren(runProps, "sz");
      removeWordChildren(runProps, "szCs");
      const size = run.ownerDocument.createElementNS(W_NS, "w:sz");
      const sizeCs = run.ownerDocument.createElementNS(W_NS, "w:szCs");
      setWordAttribute(size, "val", sizeHalfPoints);
      setWordAttribute(sizeCs, "val", sizeHalfPoints);
      runProps.append(size, sizeCs);
    });
  }

  function compactDocxParagraphs(root) {
    wordDescendantElements(root, "p").forEach((paragraph) => {
      const paragraphProps = ensureWordChild(paragraph, "pPr", true);
      removeWordChildren(paragraphProps, "spacing");
      const spacing = paragraph.ownerDocument.createElementNS(W_NS, "w:spacing");
      setWordAttribute(spacing, "before", 0);
      setWordAttribute(spacing, "after", 0);
      setWordAttribute(spacing, "line", 240);
      setWordAttribute(spacing, "lineRule", "auto");
      paragraphProps.appendChild(spacing);
    });
  }

  function setDocxTableMargins(table) {
    const tableProps = ensureWordChild(table, "tblPr", true);
    removeWordChildren(tableProps, "tblCellMar");
    const margins = table.ownerDocument.createElementNS(W_NS, "w:tblCellMar");
    ["top", "left", "bottom", "right"].forEach((name) => {
      const margin = table.ownerDocument.createElementNS(W_NS, `w:${name}`);
      setWordAttribute(margin, "w", name === "left" || name === "right" ? 45 : 0);
      setWordAttribute(margin, "type", "dxa");
      margins.appendChild(margin);
    });
    tableProps.appendChild(margins);
  }

  function setDocxTableLayout(table, targetWidthTwips) {
    const tableProps = ensureWordChild(table, "tblPr", true);
    const tableWidth = ensureWordChild(tableProps, "tblW");
    setWordAttribute(tableWidth, "w", targetWidthTwips);
    setWordAttribute(tableWidth, "type", "dxa");

    removeWordChildren(tableProps, "tblLayout");
    const layout = table.ownerDocument.createElementNS(W_NS, "w:tblLayout");
    setWordAttribute(layout, "type", "fixed");
    tableProps.appendChild(layout);

    const grid = wordChildElements(table, "tblGrid")[0];
    const gridColumns = grid ? wordChildElements(grid, "gridCol") : [];
    const currentWidths = gridColumns
      .map((column) => parseInt(column.getAttributeNS(W_NS, "w") || column.getAttribute("w:w") || "0", 10))
      .filter((width) => width > 0);
    if (!currentWidths.length) return;

    const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0);
    const scaledWidths = currentWidths.map((width) => Math.max(1, Math.round((width / currentTotal) * targetWidthTwips)));
    scaledWidths[scaledWidths.length - 1] += targetWidthTwips - scaledWidths.reduce((sum, width) => sum + width, 0);

    gridColumns.forEach((column, index) => {
      setWordAttribute(column, "w", scaledWidths[index] || 1);
    });

    wordChildElements(table, "tr").forEach((row) => {
      const cells = wordChildElements(row, "tc");
      if (cells.length === scaledWidths.length) {
        cells.forEach((cell, index) => setDocxCellWidth(cell, scaledWidths[index]));
      } else if (cells.length === 1) {
        setDocxCellWidth(cells[0], targetWidthTwips);
      }
    });
  }

  function setDocxCellWidth(cell, widthTwips) {
    const cellProps = ensureWordChild(cell, "tcPr", true);
    removeWordChildren(cellProps, "tcW");
    const cellWidth = cell.ownerDocument.createElementNS(W_NS, "w:tcW");
    setWordAttribute(cellWidth, "w", widthTwips);
    setWordAttribute(cellWidth, "type", "dxa");
    cellProps.appendChild(cellWidth);
  }

  function setDocxRowHeight(row, heightTwips) {
    const rowProps = ensureWordChild(row, "trPr", true);
    removeWordChildren(rowProps, "trHeight");
    const height = row.ownerDocument.createElementNS(W_NS, "w:trHeight");
    setWordAttribute(height, "val", heightTwips);
    setWordAttribute(height, "hRule", "exact");
    rowProps.appendChild(height);
  }

  function compactDocxCardTable(table, dataRowHeight = DECK_RECIPE_ROW_HEIGHT_TWIPS) {
    setDocxTableMargins(table);
    const rows = wordChildElements(table, "tr");
    rows.forEach((row, index) => {
      const isHeader = index <= 1;
      setDocxRowHeight(row, dataRowHeight);
      compactDocxParagraphs(row, isHeader ? 170 : Math.max(145, dataRowHeight - 95));
      setDocxRunFontSize(row, 20);
    });
  }

  function compactDocxInfoTable(table) {
    setDocxTableMargins(table);
    wordChildElements(table, "tr").forEach((row) => {
      setDocxRowHeight(row, 360);
      compactDocxParagraphs(row, 220);
      setDocxRunFontSize(row, 20);
    });
  }

  function compactDocxTemplate(doc, tables) {
    const fullPageWidth = 10982;
    const dataRowHeight = DECK_RECIPE_ROW_HEIGHT_TWIPS;

    setDocxPageSetup(doc);
    compactDocxParagraphs(doc.documentElement, 150);
    if (tables[0]) {
      setDocxTableLayout(tables[0], 6800);
      compactDocxInfoTable(tables[0]);
    }
    if (tables[1]) {
      removeNode(tables[1]);
    }
    if (tables[2]) {
      setDocxTableLayout(tables[2], fullPageWidth);
      compactDocxCardTable(tables[2], dataRowHeight);
    }
    if (tables[3]) {
      setDocxTableLayout(tables[3], fullPageWidth);
      compactDocxCardTable(tables[3], dataRowHeight);
    }
  }

  function setDocxCellText(cell, value) {
    const XML_NS = "http://www.w3.org/XML/1998/namespace";
    const doc = cell.ownerDocument;
    let paragraph = wordChildElements(cell, "p")[0];
    if (!paragraph) {
      paragraph = doc.createElementNS(W_NS, "w:p");
      cell.appendChild(paragraph);
    }
    wordChildElements(cell, "p")
      .slice(1)
      .forEach((node) => node.remove());
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "pPr" && node.namespaceURI === W_NS)) node.remove();
    });
    const text = String(value ?? "");
    if (!text) return;
    const run = doc.createElementNS(W_NS, "w:r");
    const textNode = doc.createElementNS(W_NS, "w:t");
    textNode.setAttributeNS(XML_NS, "xml:space", "preserve");
    textNode.textContent = text;
    run.appendChild(textNode);
    paragraph.appendChild(run);
  }

  function setDocxRowValues(row, values) {
    const cells = wordChildElements(row, "tc");
    values.forEach((value, index) => {
      if (cells[index]) setDocxCellText(cells[index], value);
    });
  }

  // ---------------------------------------------------------------------------
  // 덱 데이터 의존 기능 (의존성 주입)
  // ---------------------------------------------------------------------------
  function createDeckRecipeExport(deps) {
    const {
      escapeHTML,
      todayISO,
      cardTypeLabel,
      deckCards,
      sortDeckCards,
      deckCountSummary,
      normalizeDeck,
      deckLimitViolation,
      safeFileName,
      DECK_LIMITS,
    } = deps;

    function recipeCardRows(cards, minRows) {
      const rows = [...cards];
      while (rows.length < minRows) rows.push(null);
      return rows
        .map((card) => {
          if (!card) {
            return `
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          `;
          }
          return `
          <tr>
            <td>${escapeHTML(card.cardNumber)}</td>
            <td>${escapeHTML(card.level || "")}</td>
            <td class="recipe-card-name">${escapeHTML(card.name)}</td>
            <td>${escapeHTML(cardTypeLabel(card.type))}</td>
            <td>${escapeHTML(card.count)}</td>
          </tr>
        `;
        })
        .join("");
    }

    function renderRecipeTable(title, cards, minRows, typeHint) {
      return `
      <table class="recipe-card-table">
        <thead>
          <tr class="recipe-section-row">
            <th colspan="5">${escapeHTML(title)}</th>
          </tr>
          <tr>
            <th>카드 넘버</th>
            <th>Lv</th>
            <th>카드 이름</th>
            <th>카드의 종류${typeHint ? `<br />${escapeHTML(typeHint)}` : ""}</th>
            <th>매수</th>
          </tr>
        </thead>
        <tbody>${recipeCardRows(cards, minRows)}</tbody>
      </table>
    `;
    }

    function renderDeckRecipe(deck) {
      const cards = deckCards(deck);
      const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
      const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
      const summary = deckCountSummary(cards);
      return `
      <div class="recipe-page" style="--recipe-row-height: ${DECK_RECIPE_ROW_HEIGHT_MM}mm;">
        <table class="recipe-info-table">
          <tbody>
            <tr>
              <th>Name</th>
              <td></td>
            </tr>
            <tr>
              <th>Date.</th>
              <td>${escapeHTML(todayISO())}</td>
            </tr>
          </tbody>
        </table>
        <div class="recipe-summary">
          메인 덱 ${summary.main}/${DECK_LIMITS.main} · 디지타마 ${summary.digiEgg}/${DECK_LIMITS.digiEgg} · 총 ${summary.total}/${DECK_LIMITS.total}
        </div>
        ${renderRecipeTable("메인 덱", mainCards, DECK_RECIPE_MAIN_MIN_ROWS, "(디지몬, 테이머, 옵션)")}
        ${renderRecipeTable("디지타마 덱", eggCards, DECK_RECIPE_EGG_MIN_ROWS, "(디지타마)")}
      </div>
    `;
    }

    function printDeckRecipe(deck) {
      const printableDeck = normalizeDeck(deck || {});
      if (!deckCards(printableDeck).length) {
        alert("인쇄할 카드가 없습니다. 덱을 먼저 구성해 주세요.");
        return;
      }
      const limitMessage = deckLimitViolation(printableDeck.cards);
      if (limitMessage && !confirm(`${limitMessage}\n그래도 인쇄할까요?`)) return;
      let printRoot = document.getElementById("print-root");
      if (!printRoot) {
        printRoot = document.createElement("section");
        printRoot.id = "print-root";
        printRoot.className = "print-root";
        document.body.appendChild(printRoot);
      }
      printRoot.innerHTML = renderDeckRecipe(printableDeck);
      window.requestAnimationFrame(() => window.print());
    }

    function fillDocxCardTable(table, cards, minRows) {
      const rows = wordChildElements(table, "tr");
      const startRow = 2;
      const targetRows = Math.max(minRows, cards.length, 1);
      const rowTemplate = rows[startRow]?.cloneNode(true) || rows[rows.length - 1]?.cloneNode(true);
      while (wordChildElements(table, "tr").length < startRow + targetRows && rowTemplate) {
        table.appendChild(rowTemplate.cloneNode(true));
      }
      while (wordChildElements(table, "tr").length > startRow + targetRows) {
        wordChildElements(table, "tr").pop()?.remove();
      }
      const nextRows = wordChildElements(table, "tr");
      for (let index = 0; index < targetRows; index += 1) {
        const card = cards[index];
        setDocxRowValues(
          nextRows[startRow + index],
          card ? [card.cardNumber, card.level || "", card.name, cardTypeLabel(card.type), String(card.count)] : ["", "", "", "", ""]
        );
      }
    }

    function buildDeckRecipeDocumentXml(deck) {
      const template = window.DECK_RECIPE_DOCX_TEMPLATE;
      if (!template?.documentXml) throw new Error("DOCX 양식을 찾을 수 없습니다.");
      const parser = new DOMParser();
      const doc = parser.parseFromString(template.documentXml, "application/xml");
      removeDocxRecipeDecorations(doc);
      const tables = Array.from(doc.getElementsByTagNameNS(W_NS, "tbl"));
      const infoRows = wordChildElements(tables[0], "tr");
      setDocxCellText(wordChildElements(infoRows[0], "tc")[1], "");
      setDocxCellText(wordChildElements(infoRows[1], "tc")[1], todayISO());

      const cards = deckCards(deck);
      const mainCards = sortDeckCards(cards.filter((card) => card.type !== "digiEgg"));
      const eggCards = sortDeckCards(cards.filter((card) => card.type === "digiEgg"));
      fillDocxCardTable(tables[2], mainCards, DECK_RECIPE_MAIN_MIN_ROWS);
      fillDocxCardTable(tables[3], eggCards, DECK_RECIPE_EGG_MIN_ROWS);
      compactDocxTemplate(doc, tables);
      return new XMLSerializer().serializeToString(doc);
    }

    function downloadDeckRecipeDocx(deck) {
      const template = window.DECK_RECIPE_DOCX_TEMPLATE;
      if (!template?.base64 || !template?.documentXml) {
        alert("DOCX 양식을 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
        return;
      }
      const printableDeck = normalizeDeck(deck || {});
      if (!deckCards(printableDeck).length) {
        alert("DOCX로 저장할 카드가 없습니다. 덱을 먼저 구성해 주세요.");
        return;
      }
      const templateBytes = base64ToBytes(template.base64);
      const documentXmlBytes = new TextEncoder().encode(buildDeckRecipeDocumentXml(printableDeck));
      const entries = parseZipEntries(templateBytes).map((entry) => {
        if (entry.name !== "word/document.xml") return entry;
        return {
          ...entry,
          flags: 0,
          method: 0,
          crc: crc32(documentXmlBytes),
          compressedSize: documentXmlBytes.length,
          uncompressedSize: documentXmlBytes.length,
          rawData: documentXmlBytes,
        };
      });
      const blob = buildZip(entries);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(printableDeck.name)}_덱_레시피_${todayISO()}.docx`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    return { renderDeckRecipe, printDeckRecipe, downloadDeckRecipeDocx };
  }

  const api = {
    createDeckRecipeExport,
    _internals: { base64ToBytes, crc32, parseZipEntries, buildZip },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.docx = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
