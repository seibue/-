const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const importer = require("../tools/import-tournament-events.js");

const config = JSON.parse(fs.readFileSync("tools/event-imports/world-convergence-btk21.json", "utf8"));
const eventConfigs = [
  ["tools/event-imports/world-convergence-btk21.json", 72],
  ["tools/event-imports/2606-tamer-battle.json", 158],
  ["tools/event-imports/welcome-tamers-exchange.json", 60],
  ["tools/event-imports/worlds-26-27-season1-shop-qualifier.json", 82],
  ["tools/event-imports/evolution-cup-2026-season3.json", 82],
];

test("makeEvents: WORLD CONVERGENCE 일정 72건 생성", () => {
  const events = importer.makeEvents(config);
  assert.equal(events.length, 72);
  assert.equal(events[0].title, "WORLD CONVERGENCE【BTK-21】발매기념대회 1회차");
  assert.equal(events[0].location, "서울 · 카드냥 당산");
  assert.equal(events[0].description, "최대인원 24명");
});

test("parseKoreanDateTime: 오전 12:00은 매장 일정 관례에 맞춰 낮 12시로 처리", () => {
  const date = importer.parseKoreanDateTime("5월 31일 일요일 오전 12:00", {
    year: 2026,
    morningTwelveAsNoon: true,
  });
  assert.equal(date.getHours(), 12);
});

test("buildSql: replace SQL은 같은 대회명 일정만 지운 뒤 다시 넣는다", () => {
  const events = importer.makeEvents(config);
  const sql = importer.buildSql(config, events, true);
  assert.match(sql, /delete from public\.tournament_events/);
  assert.match(sql, /where title like 'WORLD CONVERGENCE【BTK-21】발매기념대회%'/);
  assert.match(sql, /insert into public\.tournament_events/);
});

test("makeEvents: event import fixtures produce the expected schedule counts", () => {
  eventConfigs.forEach(([filePath, expectedCount]) => {
    const fixture = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const events = importer.makeEvents(fixture);
    assert.equal(events.length, expectedCount, filePath);
    assert.ok(events.every((event) => event.starts_at.endsWith("+09:00")), filePath);
  });
});

test("parseKoreanDateTime: sheet weekday text is validated against the 2026 calendar", () => {
  assert.throws(
    () =>
      importer.parseKoreanDateTime("6월 3일 월요일 오후 3:00", {
        year: 2026,
        morningTwelveAsNoon: true,
        validateWeekday: true,
      }),
    /weekday mismatch/
  );
});
