/**
 * js/deck-import.js 단위 테스트 (트랙 B 안전망)
 * 순수 apiCardType + 팩토리 파싱(parseDeckTextImport/parseDeckImportSource/decksFromJsonImport)을 검증한다.
 * uid/카탈로그/정규화는 목으로 주입한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const deckImport = require("../js/deck-import.js");

const { apiCardType, createDeckImport } = deckImport;

test("apiCardType: 원격 타입 문자열을 내부 타입으로 매핑", () => {
  assert.equal(apiCardType("Digi-Egg"), "digiEgg");
  assert.equal(apiCardType("Option"), "option");
  assert.equal(apiCardType("Tamer"), "tamer");
  assert.equal(apiCardType("Digimon"), "digimon");
  assert.equal(apiCardType("뭔가 이상"), "digimon");
});

function makeApi(catalog = {}) {
  let counter = 0;
  return createDeckImport({
    normalizeCardNumber: (v) => String(v || "").trim().toUpperCase(),
    normalizeLevel: (v) => String(v || ""),
    remoteCardImageUrl: (n) => `img:${n}`,
    uid: (prefix) => `${prefix}-${(counter += 1)}`,
    normalizeDeck: (d) => ({ ...d, cards: d.cards || [] }),
    catalogCardByNumber: (n) => catalog[n] || null,
    getData: () => ({ decks: [] }),
    cardTypeLabels: { digimon: "디지몬", option: "옵션", tamer: "테이머", digiEgg: "디지타마", other: "기타" },
    REMOTE_CARD_API_URL: "https://example.com",
  });
}

test("parseDeckTextLine: '4 EX5-001 이름' 형태를 카드로 파싱", () => {
  const api = makeApi();
  const card = api.parseDeckTextLine("4 EX5-001 그레이몬", "main");
  assert.equal(card.cardNumber, "EX5-001");
  assert.equal(card.count, 4);
  assert.equal(card.type, "digimon");
});

test("parseDeckTextLine: 매수는 1~4로 클램프", () => {
  const api = makeApi();
  assert.equal(api.parseDeckTextLine("9 BT1-010 x", "main").count, 4);
  assert.equal(api.parseDeckTextLine("BT1-010", "main").count, 1);
});

test("parseDeckTextImport: 이름 헤더 처리 + 카탈로그 기반 타입 판정", () => {
  // 카탈로그에 BT1-001 을 디지타마로 등록 → 타입이 카탈로그에서 결정됨
  const api = makeApi({ "BT1-001": { type: "digiEgg", name: "코로몬", level: "2" } });
  const source = ["덱 이름: 내 덱", "4 EX5-001 그레이몬", "4 BT1-001 코로몬"].join("\n");
  const decks = api.parseDeckTextImport(source, "fallback");
  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "내 덱");
  const egg = decks[0].cards.find((c) => c.cardNumber === "BT1-001");
  assert.equal(egg.type, "digiEgg");
  assert.equal(egg.name, "코로몬");
});

test("parseDeckTextLine: 명시적 digiEgg 섹션이면 카탈로그 없어도 digiEgg", () => {
  const api = makeApi();
  const card = api.parseDeckTextLine("4 BT1-001 코로몬", "digiEgg");
  assert.equal(card.type, "digiEgg");
  assert.equal(card.level, "2");
});

test("parseDeckTextImport: 한국어 섹션 헤더('메인'/'디지타마')도 인식한다", () => {
  // 카탈로그 없이도 '디지타마' 헤더로 섹션 전환되어 digiEgg 로 분류돼야 함
  const api = makeApi();
  const source = ["메인", "4 EX5-001 그레이몬", "디지타마", "4 BT1-001 코로몬"].join("\n");
  const decks = api.parseDeckTextImport(source, "내 덱");
  const main = decks[0].cards.find((c) => c.cardNumber === "EX5-001");
  const egg = decks[0].cards.find((c) => c.cardNumber === "BT1-001");
  assert.equal(main.type, "digimon");
  assert.equal(egg.type, "digiEgg");
});

test("parseDeckTextImport: 영어 섹션 헤더(Main/Digi-Egg)도 인식한다", () => {
  const api = makeApi();
  const source = ["Main", "4 EX5-001 그레이몬", "Digi-Egg", "4 BT1-001 코로몬"].join("\n");
  const decks = api.parseDeckTextImport(source, "내 덱");
  assert.equal(decks[0].cards.find((c) => c.cardNumber === "BT1-001").type, "digiEgg");
});

test("decksFromJsonImport: 카드 배열만 있으면 단일 덱으로 감싼다", () => {
  const api = makeApi();
  const decks = api.decksFromJsonImport([{ cardNumber: "EX5-001" }], "내 덱");
  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "내 덱");
  assert.equal(decks[0].cards.length, 1);
});

test("parseDeckImportSource: JSON 파싱 실패 시 텍스트 파서로 폴백", () => {
  const api = makeApi();
  const decks = api.parseDeckImportSource("{깨진 JSON\n4 EX5-001 그레이몬", "내 덱");
  assert.equal(decks.length, 1);
  assert.ok(decks[0].cards.some((c) => c.cardNumber === "EX5-001"));
});

test("decksFromJsonImport: digimonmeta 형식(번호 문자열 반복)을 매수로 집계", () => {
  const api = makeApi();
  const decks = api.decksFromJsonImport(
    ["Exported from digimonmeta.com", "EX5-001", "EX5-001", "EX5-001", "EX5-001", "EX5-007", "EX5-007", "P-186"],
    "내 덱"
  );
  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "내 덱");
  assert.equal(decks[0].cards.length, 3); // 헤더 제외, 번호 3종
  assert.equal(decks[0].cards.find((c) => c.cardNumber === "EX5-001").count, 4);
  assert.equal(decks[0].cards.find((c) => c.cardNumber === "EX5-007").count, 2);
  assert.equal(decks[0].cards.find((c) => c.cardNumber === "P-186").count, 1);
});

test("parseDeckImportSource: digimonmeta JSON 문자열도 파싱", () => {
  const api = makeApi();
  const code = JSON.stringify(["Exported from digimonmeta.com", "bt16-020", "bt16-020"]);
  const decks = api.parseDeckImportSource(code, "코드 덱");
  assert.equal(decks.length, 1);
  assert.equal(decks[0].cards[0].cardNumber, "BT16-020"); // 대문자 정규화
  assert.equal(decks[0].cards[0].count, 2);
});

test("uniqueImportedDeckName: 중복 이름에 번호를 붙인다", () => {
  const api = createDeckImport({
    normalizeCardNumber: (v) => v,
    normalizeLevel: (v) => v,
    remoteCardImageUrl: (n) => n,
    uid: (p) => p,
    normalizeDeck: (d) => d,
    catalogCardByNumber: () => null,
    getData: () => ({ decks: [{ name: "내 덱" }, { name: "내 덱 2" }] }),
    cardTypeLabels: {},
    REMOTE_CARD_API_URL: "https://example.com",
  });
  assert.equal(api.uniqueImportedDeckName("새 덱"), "새 덱");
  assert.equal(api.uniqueImportedDeckName("내 덱"), "내 덱 3");
});
