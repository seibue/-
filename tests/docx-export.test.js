/**
 * js/docx-export.js 순수 헬퍼 단위 테스트 (모듈 분리 안전망)
 * ZIP/바이트 저수준 헬퍼(_internals)와 DI 팩토리 형태를 검증한다.
 * DOM(DOCX) 조작은 jsdom 없이 검증 불가하므로 여기서는 다루지 않는다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const docx = require("../js/docx-export.js");

const { base64ToBytes, crc32, parseZipEntries, buildZip } = docx._internals;

test("crc32: 표준 검증값 '123456789' = 0xCBF43926", () => {
  const bytes = new TextEncoder().encode("123456789");
  assert.equal(crc32(bytes), 0xcbf43926);
});

test("crc32: 빈 입력은 0", () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("base64ToBytes: base64를 정확한 바이트로 디코드", () => {
  // "Hi!" => SGkh
  const bytes = base64ToBytes("SGkh");
  assert.deepEqual(Array.from(bytes), [72, 105, 33]);
});

test("buildZip → parseZipEntries 라운드트립: 이름/내용/CRC 보존", async () => {
  const rawData = new TextEncoder().encode("hello-docx");
  const entry = {
    name: "word/document.xml",
    method: 0, // STORED (비압축)
    crc: crc32(rawData),
    compressedSize: rawData.length,
    uncompressedSize: rawData.length,
    rawData,
  };
  const blob = buildZip([entry]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parsed = parseZipEntries(bytes);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "word/document.xml");
  assert.equal(parsed[0].crc, crc32(rawData));
  assert.equal(new TextDecoder().decode(parsed[0].rawData), "hello-docx");
});

test("createDeckRecipeExport: 공개 API 3종을 반환한다", () => {
  const api = docx.createDeckRecipeExport({
    escapeHTML: (v) => String(v),
    todayISO: () => "2026-06-02",
    cardTypeLabel: (t) => t,
    deckCards: () => [],
    sortDeckCards: (c) => c,
    deckCountSummary: () => ({ main: 0, digiEgg: 0, total: 0 }),
    normalizeDeck: (d) => d,
    deckLimitViolation: () => "",
    safeFileName: (n) => n,
    DECK_LIMITS: { total: 55, main: 50, digiEgg: 5 },
  });
  assert.equal(typeof api.renderDeckRecipe, "function");
  assert.equal(typeof api.printDeckRecipe, "function");
  assert.equal(typeof api.downloadDeckRecipeDocx, "function");
});

test("renderDeckRecipe: 주입된 deps로 레시피 HTML을 생성한다", () => {
  const api = docx.createDeckRecipeExport({
    escapeHTML: (v) => String(v ?? ""),
    todayISO: () => "2026-06-02",
    cardTypeLabel: (t) => (t === "digiEgg" ? "디지타마" : "디지몬"),
    deckCards: (deck) => deck.cards,
    sortDeckCards: (c) => c,
    deckCountSummary: () => ({ main: 1, digiEgg: 0, total: 1 }),
    normalizeDeck: (d) => d,
    deckLimitViolation: () => "",
    safeFileName: (n) => n,
    DECK_LIMITS: { total: 55, main: 50, digiEgg: 5 },
  });
  const html = api.renderDeckRecipe({ cards: [{ cardNumber: "BT1-001", level: "3", name: "아구몬", type: "digimon", count: 4 }] });
  assert.match(html, /BT1-001/);
  assert.match(html, /아구몬/);
  assert.match(html, /메인 덱 1\/50/);
  assert.match(html, /2026-06-02/);
});
