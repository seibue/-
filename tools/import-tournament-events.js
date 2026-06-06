const fs = require("node:fs");
const path = require("node:path");

function usage() {
  return [
    "Usage:",
    "  node tools/import-tournament-events.js tools/event-imports/<event>.json",
    "",
    "JSON format:",
    "  {",
    "    \"slug\": \"short-event-name\",",
    "    \"title\": \"대회명\",",
    "    \"year\": 2026,",
    "    \"defaultMaxPlayers\": 24,",
    "    \"defaultDurationMinutes\": 120,",
    "    \"source\": \"Google Sheets ...\",",
    "    \"rounds\": [{ \"key\": \"round1\", \"label\": \"1회차\" }],",
    "    \"rows\": [{ \"region\": \"서울\", \"store\": \"매장명\", \"round1\": \"6월 1일 월요일 오후 2:00\" }]",
    "  }",
  ].join("\n");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function slugify(value) {
  return String(value || "event")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sqlString(value) {
  if (value == null || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const WEEKDAY_INDEX = {
  일요일: 0,
  월요일: 1,
  화요일: 2,
  수요일: 3,
  목요일: 4,
  금요일: 5,
  토요일: 6,
};

function parseKoreanDateTime(text, options) {
  const match = String(text || "").match(/(\d{1,2})월\s*(\d{1,2})일\s*(\S*)\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, monthRaw, dayRaw, weekdayRaw, meridiem, hourRaw, minuteRaw] = match;
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (meridiem === "오전") {
    if (hour === 12) hour = options.morningTwelveAsNoon ? 12 : 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  const date = new Date(options.year, month - 1, day, hour, minute, 0);
  const expectedWeekday = WEEKDAY_INDEX[weekdayRaw];
  if (options.validateWeekday !== false && expectedWeekday != null && date.getDay() !== expectedWeekday) {
    throw new Error(`weekday mismatch: ${text} is not ${weekdayRaw} in ${options.year}`);
  }
  return date;
}

function isoWithOffset(date, offset = "+09:00") {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${offset}`;
}

function normalizeRows(config) {
  if (!Array.isArray(config.rows)) return [];
  return config.rows.map((row) => {
    if (!Array.isArray(row)) return row;
    const [region, store, ...rest] = row;
    const normalized = { region, store };
    (config.rounds || []).forEach((round, index) => {
      normalized[round.key] = rest[index] || "";
    });
    normalized.maxPlayers = rest[config.rounds?.length || 0] || config.defaultMaxPlayers;
    return normalized;
  });
}

function makeEvents(config) {
  const title = String(config.title || "").trim();
  if (!title) throw new Error("title is required");
  const year = Number(config.year);
  if (!year) throw new Error("year is required");

  const rounds = Array.isArray(config.rounds) && config.rounds.length ? config.rounds : [{ key: "round1", label: "1회차" }];
  const durationMinutes = Math.max(1, Number(config.defaultDurationMinutes) || 120);
  const timezoneOffset = config.timezoneOffset || "+09:00";
  const rows = normalizeRows(config);
  const events = [];

  rows.forEach((row) => {
    const store = String(row.store || "").trim();
    if (!store) return;
    const region = String(row.region || "").trim();
    const maxPlayers = row.maxPlayers || row.max || config.defaultMaxPlayers || "";
    rounds.forEach((round, index) => {
      const start = parseKoreanDateTime(row[round.key], {
        year,
        morningTwelveAsNoon: config.morningTwelveAsNoon !== false,
        validateWeekday: config.validateWeekday !== false,
      });
      if (!start) return;
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
      const roundLabel = round.label || `${index + 1}회차`;
      events.push({
        import_id: `${slugify(config.slug || title)}-${slugify(roundLabel)}-${slugify(store)}`,
        title: `${title} ${roundLabel}`,
        starts_at: isoWithOffset(start, timezoneOffset),
        ends_at: isoWithOffset(end, timezoneOffset),
        location: [region, store].filter(Boolean).join(" · "),
        description: maxPlayers ? `최대인원 ${maxPlayers}명` : "",
      });
    });
  });

  return events;
}

function buildSql(config, events, replace = false) {
  const values = events
    .map(
      (event) =>
        `  (${sqlString(event.title)}, ${sqlString(event.starts_at)}, ${sqlString(event.ends_at)}, ${sqlString(
          event.location
        )}, ${sqlString(event.description)}, now())`
    )
    .join(",\n");

  const header = [
    `-- ${config.title} 대회 일정 ${replace ? "교체 등록" : "일괄 등록"}`,
    config.source ? `-- 출처: ${config.source}` : "",
    `-- 생성 이벤트: ${events.length}건`,
    "-- id는 앱의 일정 추가 기능과 동일하게 DB 기본값을 사용합니다.",
  ]
    .filter(Boolean)
    .join("\n");

  const insertSql = `insert into public.tournament_events\n  (title, starts_at, ends_at, location, description, updated_at)\nvalues\n${values};`;
  if (!replace) return `${header}\n\n${insertSql}\n`;

  return `${header}\n-- 같은 대회명의 기존 일정을 지운 뒤 다시 넣습니다.\n\nbegin;\n\ndelete from public.tournament_events\nwhere title like ${sqlString(`${config.title}%`)};\n\n${insertSql}\n\ncommit;\n`;
}

function writeOutputs(inputPath, config, events) {
  const slug = slugify(config.slug || path.basename(inputPath, path.extname(inputPath)));
  const outDir = path.resolve(path.dirname(inputPath), "..", "generated");
  fs.mkdirSync(outDir, { recursive: true });

  const payload = events.map(({ title, starts_at, ends_at, location, description }) => ({
    title,
    starts_at,
    ends_at,
    location,
    description,
  }));

  const files = {
    events: path.join(outDir, `${slug}-events.json`),
    payload: path.join(outDir, `${slug}-events-rest-payload.json`),
    sql: path.join(outDir, `${slug}-events.sql`),
    replaceSql: path.join(outDir, `${slug}-events-replace.sql`),
  };

  fs.writeFileSync(files.events, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.payload, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(files.sql, buildSql(config, events, false), "utf8");
  fs.writeFileSync(files.replaceSql, buildSql(config, events, true), "utf8");
  return files;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath || inputPath === "-h" || inputPath === "--help") {
    console.log(usage());
    process.exit(inputPath ? 0 : 1);
  }

  const resolved = path.resolve(inputPath);
  const config = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const events = makeEvents(config);
  const files = writeOutputs(resolved, config, events);

  console.log(`events: ${events.length}`);
  console.log(files.replaceSql);
}

if (require.main === module) {
  main();
}

module.exports = {
  makeEvents,
  parseKoreanDateTime,
  buildSql,
};
