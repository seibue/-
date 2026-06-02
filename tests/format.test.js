/**
 * js/format.js 순수 함수 단위 테스트 (모듈 분리 안전망 Phase 0)
 * 실행: npm test  (= node --test)
 * 의존성 0 — Node 내장 node:test / node:assert 사용
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const format = require("../js/format.js");

test("escapeHTML: 특수문자 5종을 모두 이스케이프한다", () => {
  assert.equal(format.escapeHTML(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("escapeHTML: null/undefined는 빈 문자열로 처리한다", () => {
  assert.equal(format.escapeHTML(null), "");
  assert.equal(format.escapeHTML(undefined), "");
});

test("todayISO: YYYY-MM-DD 형식을 반환한다", () => {
  assert.match(format.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test("formatDate: 값이 없으면 '날짜 없음'", () => {
  assert.equal(format.formatDate(""), "날짜 없음");
  assert.equal(format.formatDate(null), "날짜 없음");
});

test("resultLabel / resultShortLabel: 승패무 매핑", () => {
  assert.equal(format.resultLabel("win"), "승리");
  assert.equal(format.resultLabel("loss"), "패배");
  assert.equal(format.resultLabel("draw"), "무승부");
  assert.equal(format.resultLabel("???"), "기록");
  assert.equal(format.resultShortLabel("win"), "승");
  assert.equal(format.resultShortLabel("draw"), "무");
});

test("playOrderLabel: 선후공 매핑 및 기본값", () => {
  assert.equal(format.playOrderLabel("first"), "선공");
  assert.equal(format.playOrderLabel("second"), "후공");
  assert.equal(format.playOrderLabel("unknown"), "선후공 미상");
  assert.equal(format.playOrderLabel(""), "선후공 미상");
});

test("resultFromGameStats: 게임 승수 비교로 승패무 판정", () => {
  assert.equal(format.resultFromGameStats({ gameWins: 2, gameLosses: 0 }), "win");
  assert.equal(format.resultFromGameStats({ gameWins: 0, gameLosses: 2 }), "loss");
  assert.equal(format.resultFromGameStats({ gameWins: 1, gameLosses: 1 }), "draw");
});

test("singleGameStats: 단판 결과를 게임 통계로 변환", () => {
  assert.deepEqual(format.singleGameStats("win"), { gameWins: 1, gameLosses: 0, gameDraws: 0 });
  assert.deepEqual(format.singleGameStats("loss"), { gameWins: 0, gameLosses: 1, gameDraws: 0 });
});

test("normalizeGameStats: 0~9 범위로 클램프", () => {
  assert.deepEqual(format.normalizeGameStats(2, 1, 0), { gameWins: 2, gameLosses: 1, gameDraws: 0 });
  assert.deepEqual(format.normalizeGameStats(99, -5, 3), { gameWins: 9, gameLosses: 0, gameDraws: 3 });
});

test("normalizeGameStats: 전부 0이면 fallback 결과 사용", () => {
  assert.deepEqual(format.normalizeGameStats(0, 0, 0, "loss"), { gameWins: 0, gameLosses: 1, gameDraws: 0 });
});

test("emptyRecordStats: 모든 카운터가 0", () => {
  assert.deepEqual(format.emptyRecordStats(), {
    total: 0, wins: 0, losses: 0, draws: 0, gameTotal: 0, gameWins: 0, gameLosses: 0, gameDraws: 0,
  });
});

test("finalizeRecordStats: 승률·게임승률 계산(반올림)", () => {
  const result = format.finalizeRecordStats({ total: 3, wins: 2, gameTotal: 5, gameWins: 3 });
  assert.equal(result.rate, 67);
  assert.equal(result.gameRate, 60);
});

test("finalizeRecordStats: 분모 0이면 0%", () => {
  const result = format.finalizeRecordStats({ total: 0, wins: 0, gameTotal: 0, gameWins: 0 });
  assert.equal(result.rate, 0);
  assert.equal(result.gameRate, 0);
});

test("uid: prefix로 시작하고 매번 다른 값", () => {
  const a = format.uid("match");
  const b = format.uid("match");
  assert.match(a, /^match-/);
  assert.notEqual(a, b);
});
