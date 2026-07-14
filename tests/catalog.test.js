/**
 * js/catalog.js — 카드번호/카탈로그 정규화 순수 헬퍼 단위 테스트 (트랙 B 안전망)
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const catalogModule = require("../js/catalog.js");

const cardTypeLabels = { digimon: "디지몬", option: "옵션", tamer: "테이머", digiEgg: "디지타마", other: "기타" };
const C = catalogModule.createCatalog({ cardTypeLabels });

test("normalizeCardNumber: 세트코드-번호만 추출, 에라타/프로모 접미사 제거", () => {
  assert.equal(C.normalizeCardNumber("bt1-084"), "BT1-084");
  assert.equal(C.normalizeCardNumber(" bt1-084 "), "BT1-084"); // 앞뒤 공백 제거
  assert.equal(C.normalizeCardNumber("bt1 084"), "BT1084"); // 대시 없으면 세트패턴 불일치
  assert.equal(C.normalizeCardNumber("EX3-057-ERRATA"), "EX3-057");
  assert.equal(C.normalizeCardNumber("P-103_P2"), "P-103");
  assert.equal(C.normalizeCardNumber(""), "");
});

test("normalizeCardNumber: 세트코드 패턴 아니면 허용문자만 남김", () => {
  assert.equal(C.normalizeCardNumber("prm 001!"), "PRM001"); // 대시 없음 → 패턴 불일치
});

test("normalizeCatalogQuery: 소문자화 + 영숫자/한글만", () => {
  assert.equal(C.normalizeCatalogQuery("오메가몬 BT1-084!"), "오메가몬bt1084");
  assert.equal(C.normalizeCatalogQuery("  Wave  "), "wave");
});

test("normalizeLevel: 숫자 한 자리만", () => {
  assert.equal(C.normalizeLevel("Lv.3"), "3");
  assert.equal(C.normalizeLevel("레벨6"), "6");
  assert.equal(C.normalizeLevel("없음"), "");
});

test("createDefaultDeckCardFilters: 기본 필터 형태", () => {
  assert.deepEqual(C.createDefaultDeckCardFilters(), { colors: [], levels: [], setPrefix: "all", sort: "catalog" });
  // 매번 새 객체(참조 공유 없음)
  assert.notEqual(C.createDefaultDeckCardFilters(), C.createDefaultDeckCardFilters());
});

test("normalizeCatalogCard: 필드 매핑 + 미지 type은 other + dgchub 이미지 제거", () => {
  const card = C.normalizeCatalogCard(
    { no: "bt1-001", lv: "3", name: " 아구몬 ", type: "digimon", color: "RED", rarity: "R", img: "https://x/y.png" },
    5
  );
  assert.equal(card.index, 5);
  assert.equal(card.no, "BT1-001");
  assert.equal(card.level, "3");
  assert.equal(card.name, "아구몬");
  assert.equal(card.type, "digimon");
  assert.equal(card.color, "red");
  assert.equal(card.img, "https://x/y.png");
  // 미지 type → other, dgchub 이미지 → 빈 값
  const weird = C.normalizeCatalogCard({ no: "BT1-002", name: "x", type: "hero", img: "https://dgchub.com/a.png" });
  assert.equal(weird.type, "other");
  assert.equal(weird.img, "");
});
