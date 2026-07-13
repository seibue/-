/**
 * api/korean-card.js 파서 단위 테스트
 * 한국 공식(digimoncard.co.kr) HTML 크롤 결과 파싱의 정합성 검증.
 * 네트워크는 타지 않고 parseKoreanCard(순수 함수)만 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const koreanCard = require("../api/korean-card.js");

// 실제 목록 페이지 구조를 축약한 샘플(카드 2장)
const SAMPLE_HTML = `
<div class="image_lists">
  <li class="image_lists_item first">
    <span class="cardno">BT1-001</span>
    <div class="card_name">BT1-001 R 아구몬</div>
    <dl>
      <dt>상단 텍스트</dt><dd>＜디지크로스＞ 효과</dd>
      <dt>하단 텍스트</dt><dd>-</dd>
      <dt>시큐리티 효과</dt><dd>이 디지몬을 등장시킨다.</dd>
    </dl>
  </li>
  <li class="image_lists_item">
    <span class="cardno">BT1-002</span>
    <div class="card_name">BT1-002 U 가부몬</div>
    <dl>
      <dt>상단 텍스트</dt><dd>메인 효과 텍스트</dd>
      <dt>하단 텍스트</dt><dd>진화원 효과</dd>
      <dt>시큐리티 효과</dt><dd>-</dd>
    </dl>
  </li>
  </ul>
</div>
`;

test("parseKoreanCard: 카드번호 매칭 + 이름에서 번호/레어도 접두 제거", () => {
  const card = koreanCard.parseKoreanCard(SAMPLE_HTML, "bt1-001");
  assert.ok(card, "매칭된 카드가 있어야 함");
  assert.equal(card.cardNumber, "BT1-001");
  assert.equal(card.name, "아구몬"); // "BT1-001 R " 접두 제거
  assert.equal(card.source, "kr");
});

test("parseKoreanCard: 상단/하단/시큐리티 효과 추출, '-'는 빈 값", () => {
  const card = koreanCard.parseKoreanCard(SAMPLE_HTML, "BT1-001");
  assert.equal(card.mainEffect, "＜디지크로스＞ 효과");
  assert.equal(card.sourceEffect, ""); // "-" → 무의미 → 빈 값
  assert.equal(card.securityEffect, "이 디지몬을 등장시킨다.");
  assert.equal(card.hasEffect, true);
});

test("parseKoreanCard: 두 번째 카드도 개별 아이템으로 분리 파싱", () => {
  const card = koreanCard.parseKoreanCard(SAMPLE_HTML, "BT1-002");
  assert.equal(card.name, "가부몬");
  assert.equal(card.mainEffect, "메인 효과 텍스트");
  assert.equal(card.sourceEffect, "진화원 효과");
  assert.equal(card.securityEffect, "");
});

test("parseKoreanCard: 매칭 없으면 null, 번호 정규화(소문자/기호 무시)", () => {
  assert.equal(koreanCard.parseKoreanCard(SAMPLE_HTML, "BT9-999"), null);
  // 앞뒤 공백/소문자 변형도 정규화되어 매칭(대시는 유지되어야 하므로 대시 없는 변형은 매칭 안 됨)
  assert.ok(koreanCard.parseKoreanCard(SAMPLE_HTML, "  bt1-001 "));
  assert.equal(koreanCard.parseKoreanCard(SAMPLE_HTML, "bt1 001"), null);
});
