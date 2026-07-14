/**
 * js/lookups.js — 덱/대회 조회·라운드 라벨 헬퍼 단위 테스트 (트랙 B 안전망)
 * app.js에서 분리한 순수 조회 로직의 동작 보존을 검증한다.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const lookupsModule = require("../js/lookups.js");
const format = require("../js/format.js");

const TOURNAMENT_FORMAT_OPTIONS = [
  ["mixed", "스위스+토너먼트"],
  ["swiss", "스위스"],
  ["top", "토너먼트"],
];
const ROUND_STAGE_OPTIONS = [
  ["none", "일반"],
  ["swiss", "스위스"],
  ["top", "토너먼트"],
];

function makeLookups(data) {
  return lookupsModule.createLookups({
    getData: () => data,
    TOURNAMENT_FORMAT_OPTIONS,
    ROUND_STAGE_OPTIONS,
    TEAM3_MATCH_TYPE: "3대3 팀전",
    topCutLabels: format.topCutLabels,
  });
}

const baseData = () => ({
  decks: [{ id: "d1", name: "블루 덱" }],
  tournaments: [
    { id: "t1", name: "매장 대표전", date: "2026-07-10", createdAt: "2026-07-10T00:00:00Z", format: "mixed", topCut: 8 },
    { id: "t2", name: "지역 예선", date: "2026-07-12", createdAt: "2026-07-12T00:00:00Z", format: "swiss", topCut: 3 },
  ],
  matches: [
    { id: "m1", tournamentId: "t1", roundStage: "swiss", roundLabel: "R1", date: "2026-07-10", createdAt: "2026-07-10T01:00:00Z", matchType: "3대3 팀전", teamPosition: "B" },
    { id: "m2", tournamentId: "t1", roundStage: "swiss", roundLabel: "R2", date: "2026-07-10", createdAt: "2026-07-10T02:00:00Z" },
    { id: "m3", tournamentId: "t1", roundStage: "top", roundLabel: "8강", date: "2026-07-10", createdAt: "2026-07-10T03:00:00Z" },
  ],
});

test("getDeck/deckName: 존재/삭제 처리", () => {
  const L = makeLookups(baseData());
  assert.equal(L.getDeck("d1").name, "블루 덱");
  assert.equal(L.deckName("d1"), "블루 덱");
  assert.equal(L.deckName("nope"), "삭제된 덱");
});

test("getTournament/tournamentName: 존재/미존재", () => {
  const L = makeLookups(baseData());
  assert.equal(L.tournamentName("t1"), "매장 대표전");
  assert.equal(L.tournamentName("nope"), "");
});

test("tournamentFormatLabel/roundStageLabel: 매핑 + 기본값", () => {
  const L = makeLookups(baseData());
  assert.equal(L.tournamentFormatLabel("swiss"), "스위스");
  assert.equal(L.tournamentFormatLabel("garbage"), "스위스+토너먼트");
  assert.equal(L.roundStageLabel("top"), "토너먼트");
  assert.equal(L.roundStageLabel("garbage"), "일반");
});

test("roundText/tournamentMatchText: 스테이지+라벨 조합", () => {
  const L = makeLookups(baseData());
  assert.equal(L.roundText({ tournamentId: "t1", roundStage: "swiss", roundLabel: "R1" }), "스위스 R1");
  assert.equal(L.roundText({ tournamentId: "t1", roundStage: "none", roundLabel: "" }), "");
  assert.equal(L.roundText({}), "");
  assert.equal(L.tournamentMatchText({ tournamentId: "t1", roundStage: "top", roundLabel: "8강" }), "매장 대표전 · 토너먼트 8강");
  assert.equal(L.tournamentMatchText({ tournamentId: "nope" }), "");
});

test("sortedTournaments: 날짜 내림차순", () => {
  const L = makeLookups(baseData());
  assert.deepEqual(L.sortedTournaments().map((t) => t.id), ["t2", "t1"]);
});

test("tournamentMatches: 대회별 필터 + 시간 오름차순", () => {
  const L = makeLookups(baseData());
  assert.deepEqual(L.tournamentMatches("t1").map((m) => m.id), ["m1", "m2", "m3"]);
  assert.deepEqual(L.tournamentMatches("t2"), []);
});

test("suggestedTournamentStage: 스위스 4판 미만이면 swiss, top 있으면 top", () => {
  const L = makeLookups(baseData());
  assert.equal(L.suggestedTournamentStage("t1"), "top"); // top 매치 있음
  assert.equal(L.suggestedTournamentStage("t2"), "swiss"); // 매치 없음
});

test("tournamentTopCut: 유효값 유지, 그 외 4", () => {
  const L = makeLookups(baseData());
  assert.equal(L.tournamentTopCut("t1"), 8);
  assert.equal(L.tournamentTopCut("t2"), 4); // topCut 3(무효) → 4
});

test("suggestedTeamPosition: 같은 대회 직전 3대3 자리 승계", () => {
  const L = makeLookups(baseData());
  assert.equal(L.suggestedTeamPosition("t1"), "B");
  assert.equal(L.suggestedTeamPosition("t2"), "");
  assert.equal(L.suggestedTeamPosition(""), "");
});

test("suggestedRoundLabel: 스위스는 R{n+1}, top은 컷 라벨 진행", () => {
  const L = makeLookups(baseData());
  // t1은 스위스 2판 → 다음 R3
  assert.equal(L.suggestedRoundLabel("t1", "swiss"), "R3");
  // t1 topCut=8 → ["8강","4강","결승"], top 매치 1개 → index 1 = "4강"
  assert.equal(L.suggestedRoundLabel("t1", "top"), "4강");
});

test("tournamentNextActionText: 진행 상태별 문구", () => {
  const L = makeLookups(baseData());
  assert.equal(L.tournamentNextActionText({ id: "t2" }), "스위스 R1 입력"); // 매치 없음
  assert.equal(L.tournamentNextActionText({ id: "t1" }), "다음 토너먼트 4강"); // top 있음
});

test("getData 게터: data 재할당 후에도 최신값 반영", () => {
  let data = baseData();
  const L = lookupsModule.createLookups({
    getData: () => data,
    TOURNAMENT_FORMAT_OPTIONS,
    ROUND_STAGE_OPTIONS,
    TEAM3_MATCH_TYPE: "3대3 팀전",
    topCutLabels: format.topCutLabels,
  });
  assert.equal(L.deckName("d1"), "블루 덱");
  data = { decks: [{ id: "d1", name: "레드 덱" }], tournaments: [], matches: [] }; // 재할당
  assert.equal(L.deckName("d1"), "레드 덱"); // 스냅샷이 아니라 최신값
});
