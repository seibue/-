/**
 * js/calendar.js 순수 엔진 단위 테스트
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const cal = require("../js/calendar.js");

const event = {
  id: "e1",
  title: "테이머 배틀 6월",
  startsAt: "2026-06-10T05:00:00.000Z", // UTC
  endsAt: "2026-06-10T08:00:00.000Z",
  location: "서울 매장",
  description: "스위스 5R + 토너먼트",
};

test("toUtcStamp: ISO → YYYYMMDDTHHMMSSZ", () => {
  assert.equal(cal.toUtcStamp("2026-06-10T05:00:00.000Z"), "20260610T050000Z");
  assert.equal(cal.toUtcStamp("invalid"), "");
});

test("googleCalendarUrl: 템플릿 URL + dates/text/location 포함", () => {
  const url = cal.googleCalendarUrl(event);
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(url, /action=TEMPLATE/);
  assert.match(url, /dates=20260610T050000Z%2F20260610T080000Z/);
  assert.match(url, /text=/);
  assert.match(url, /location=/);
});

test("googleCalendarUrl: 종료시간 없으면 +2시간 기본", () => {
  const url = cal.googleCalendarUrl({ title: "x", startsAt: "2026-06-10T05:00:00.000Z" });
  assert.match(url, /dates=20260610T050000Z%2F20260610T070000Z/);
});

test("buildIcs: VEVENT + VALARM(1일전/30분전) 내장", () => {
  const ics = cal.buildIcs(event);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:테이머 배틀 6월/);
  assert.match(ics, /DTSTART:20260610T050000Z/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.match(ics, /END:VCALENDAR/);
  // CRLF 줄바꿈
  assert.ok(ics.includes("\r\n"));
});

test("buildIcs: 여러 이벤트 + 사용자 알람 오버라이드", () => {
  const ics = cal.buildIcs([event, { ...event, id: "e2", title: "두번째" }], { alarms: ["-PT10M"] });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /TRIGGER:-PT10M/);
  assert.ok(!ics.includes("TRIGGER:-P1D"));
});

test("escapeIcsText: 쉼표/세미콜론/줄바꿈 이스케이프", () => {
  assert.equal(cal.escapeIcsText("a,b;c\nd"), "a\\,b\\;c\\nd");
});

test("monthMatrix: 6주 x 7일, inMonth/isToday 표시", () => {
  const m = cal.monthMatrix(2026, 5, "2026-06-10"); // 6월(0-index 5)
  assert.equal(m.weeks.length, 6);
  assert.equal(m.weeks[0].length, 7);
  // 첫 칸은 일요일
  const flat = m.weeks.flat();
  const jun1 = flat.find((c) => c.iso === "2026-06-01");
  assert.equal(jun1.inMonth, true);
  const today = flat.find((c) => c.isToday);
  assert.equal(today.iso, "2026-06-10");
  // 6월 1일은 월요일이라 첫 주에 5월 말일이 포함됨(inMonth=false)
  assert.equal(flat.some((c) => !c.inMonth), true);
});

test("groupEventsByLocalDate: 날짜별 묶음 + 시간순 정렬", () => {
  const e1 = { id: "a", startsAt: "2026-06-10T08:00:00.000Z" };
  const e2 = { id: "b", startsAt: "2026-06-10T05:00:00.000Z" };
  const e3 = { id: "c", startsAt: "2026-06-11T05:00:00.000Z" };
  const map = cal.groupEventsByLocalDate([e1, e2, e3]);
  const keys = Object.keys(map);
  assert.equal(keys.length, 2);
  // 같은 날 두 건은 시간 오름차순
  const day = map[keys.find((k) => map[k].length === 2)];
  assert.equal(new Date(day[0].startsAt) <= new Date(day[1].startsAt), true);
});
