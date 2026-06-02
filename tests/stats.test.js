/**
 * js/stats.js 단위 테스트 (트랙 B 안전망)
 * 집계/매치업 계산을 목 의존성으로 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const statsModule = require("../js/stats.js");
const format = require("../js/format.js");

function makeApi(data = { matches: [], decks: [] }, state = { matchupDeckId: "", matchupOpponent: "" }) {
  return statsModule.createStats({
    getData: () => data,
    state,
    deckName: (id) => `덱-${id}`,
    matchDateTime: (m) => new Date(`${m.date || ""}T00:00:00`).getTime() || 0,
    shareRecordText: (s) => `${s.total}전 ${s.wins}승 ${s.losses}패${s.draws ? ` ${s.draws}무` : ""}`,
    emptyRecordStats: format.emptyRecordStats,
    addMatchToStats: (stats, match) => {
      // 테스트용 단판 집계 (실제 addMatchToStats 는 app.js; 여기선 result만 사용)
      stats.total += 1;
      if (match.result === "win") stats.wins += 1;
      if (match.result === "loss") stats.losses += 1;
      if (match.result === "draw") stats.draws += 1;
      return stats;
    },
    finalizeRecordStats: format.finalizeRecordStats,
  });
}

test("statsFromMatches: 승패무 집계 및 승률 계산", () => {
  const api = makeApi();
  const stats = api.statsFromMatches([{ result: "win" }, { result: "win" }, { result: "loss" }, { result: "draw" }]);
  assert.equal(stats.total, 4);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.draws, 1);
  assert.equal(stats.rate, 50); // 2/4
});

test("statsForDeck: 해당 덱 매치만 집계", () => {
  const data = {
    matches: [
      { deckId: "a", result: "win" },
      { deckId: "a", result: "loss" },
      { deckId: "b", result: "win" },
    ],
    decks: [],
  };
  const api = makeApi(data);
  assert.equal(api.statsForDeck("a").total, 2);
  assert.equal(api.summaryStats().total, 3);
});

test("normalizeOpponentDeckName / matchupOpponentKey: 공백 정리 + 소문자 키", () => {
  const api = makeApi();
  assert.equal(api.normalizeOpponentDeckName("  레드   하이브리드 "), "레드 하이브리드");
  assert.equal(api.matchupOpponentKey("Red Hybrid"), "red hybrid");
});

test("deckMatchupRows: 덱x상대 조합별 행, total 내림차순 정렬", () => {
  const data = {
    matches: [
      { deckId: "a", opponent: "블루", result: "win" },
      { deckId: "a", opponent: "블루", result: "loss" },
      { deckId: "a", opponent: "레드", result: "win" },
      { deckId: "a", opponent: "", result: "win" }, // 상대 미기록 → 제외
    ],
    decks: [],
  };
  const api = makeApi(data);
  const rows = api.deckMatchupRows("a");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].opponent, "블루"); // total 2가 먼저
  assert.equal(rows[0].total, 2);
});

test("stageStatsFromMatches / tournamentStageSummary: 스테이지별 집계", () => {
  const api = makeApi();
  const matches = [
    { roundStage: "swiss", result: "win" },
    { roundStage: "swiss", result: "loss" },
    { roundStage: "top", result: "win" },
  ];
  assert.equal(api.stageStatsFromMatches(matches, "swiss").total, 2);
  const summary = api.tournamentStageSummary(matches, "mixed");
  assert.match(summary, /스위스 2전/);
  assert.match(summary, /토너먼트 1전/);
});

test("matchesForMatchup: 덱+상대 키로 필터", () => {
  const data = {
    matches: [
      { deckId: "a", opponent: "Blue", result: "win", date: "2026-06-01" },
      { deckId: "a", opponent: "BLUE", result: "loss", date: "2026-06-02" },
      { deckId: "a", opponent: "레드", result: "win", date: "2026-06-03" },
    ],
    decks: [],
  };
  const api = makeApi(data);
  const matches = api.matchesForMatchup("a", "blue");
  assert.equal(matches.length, 2); // 대소문자 무시 매칭 (Blue/BLUE)
  assert.equal(matches[0].date, "2026-06-02"); // 최신순 정렬
});

test("deckMatchupRows: sourceMatches 인자로 기간 범위 매치만 집계", () => {
  const all = {
    matches: [
      { deckId: "a", opponent: "블루", result: "win" },
      { deckId: "a", opponent: "블루", result: "loss" },
    ],
    decks: [],
  };
  const api = makeApi(all);
  const scoped = [all.matches[0]]; // 기간 필터로 1건만 남았다고 가정
  const rows = api.deckMatchupRows("a", 0, scoped);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 1);
  assert.equal(rows[0].wins, 1);
});

test("opponentMetaRows: 상대 덱 기준 묶음 + total 내림차순 (덱 구분 없음)", () => {
  const api = makeApi();
  const matches = [
    { deckId: "a", opponent: "블루", result: "win" },
    { deckId: "b", opponent: "블루", result: "loss" }, // 다른 덱이어도 상대가 같으면 합산
    { deckId: "a", opponent: "레드", result: "win" },
    { deckId: "a", opponent: "", result: "win" }, // 상대 미기록 제외
  ];
  const rows = api.opponentMetaRows(matches);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].opponent, "블루");
  assert.equal(rows[0].total, 2);
  assert.equal(rows[0].wins, 1);
});

test("opponentMetaRows: limit 적용", () => {
  const api = makeApi();
  const matches = [
    { deckId: "a", opponent: "블루", result: "win" },
    { deckId: "a", opponent: "레드", result: "win" },
    { deckId: "a", opponent: "옐로", result: "win" },
  ];
  assert.equal(api.opponentMetaRows(matches, 2).length, 2);
});

test("validMatchupDeckId / validMatchupOpponent: 선택값 유효성 폴백", () => {
  const api = makeApi({ matches: [], decks: [] }, { matchupDeckId: "x", matchupOpponent: "블루" });
  const deckRows = [{ deck: { id: "a" } }, { deck: { id: "b" } }];
  assert.equal(api.validMatchupDeckId(deckRows), "a"); // x 없음 → 첫 행
  const matchupRows = [{ opponent: "레드" }, { opponent: "블루" }];
  assert.equal(api.validMatchupOpponent(matchupRows), "블루"); // 선택값 존재
});
