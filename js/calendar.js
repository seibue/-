/**
 * 전적몬 — 캘린더 엔진 모듈 (대회 일정: 구글 캘린더 링크 / .ics / 월간 격자)
 *
 * 순수 함수만 모았다(외부 의존 없음) — 데이터/상태/DOM 미접근.
 * event 객체 형태: { id, title, startsAt(ISO), endsAt(ISO|""), location, description }
 *
 * 노출:
 *  - 브라우저: window.JJM.calendar.*
 *  - Node(테스트): module.exports.*
 */
(function (global) {
  "use strict";

  // 기본 알람: 1일 전 + 30분 전 (.ics VALARM)
  const DEFAULT_ALARMS = ["-P1D", "-PT30M"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  // ISO 문자열 → UTC 기준 ICS/Google 형식 "YYYYMMDDTHHMMSSZ"
  function toUtcStamp(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return (
      `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
      `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
    );
  }

  // 종료시간 없으면 시작 + 기본(분) 후로
  function resolveEnd(startsAt, endsAt, fallbackMinutes = 120) {
    if (endsAt) return endsAt;
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return startsAt;
    return new Date(d.getTime() + fallbackMinutes * 60 * 1000).toISOString();
  }

  // RFC5545 텍스트 이스케이프
  function escapeIcsText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function googleCalendarUrl(event) {
    const start = toUtcStamp(event.startsAt);
    const end = toUtcStamp(resolveEnd(event.startsAt, event.endsAt));
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title || "대회",
      dates: `${start}/${end}`,
      details: event.description || "",
      location: event.location || "",
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  // 단일/복수 이벤트 → .ics 문자열 (각 이벤트에 알람 내장)
  function buildIcs(events, options = {}) {
    const list = Array.isArray(events) ? events : [events];
    const alarms = options.alarms || DEFAULT_ALARMS;
    const dtstamp = toUtcStamp(new Date().toISOString());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Jeonjeokmon//Tournament Calendar//KO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
    list.forEach((event) => {
      if (!event || !event.startsAt) return;
      const start = toUtcStamp(event.startsAt);
      const end = toUtcStamp(resolveEnd(event.startsAt, event.endsAt));
      const uid = `${event.id || start}-jeonjeokmon@jeonjeokmon.vercel.app`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcsText(event.title || "대회")}`
      );
      if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
      if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
      alarms.forEach((trigger, index) => {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeIcsText(event.title || "대회")} 알림`,
          `TRIGGER:${trigger}`,
          `X-WR-ALARMUID:${uid}-${index}`,
          "END:VALARM"
        );
      });
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function icsFileName(prefix = "jeonjeokmon-대회일정") {
    const d = new Date();
    return `${prefix}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.ics`;
  }

  // 월간 캘린더 격자 (일요일 시작, 항상 6주 = 42칸).
  // 반환: { year, month, weeks: [[{ iso, day, inMonth, isToday }, ...7], ...] }
  function monthMatrix(year, month, todayIso = "") {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay(); // 0=일
    const gridStart = new Date(year, month, 1 - startOffset);
    const weeks = [];
    for (let w = 0; w < 6; w += 1) {
      const week = [];
      for (let d = 0; d < 7; d += 1) {
        const cur = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + (w * 7 + d));
        const iso = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
        week.push({
          iso,
          day: cur.getDate(),
          inMonth: cur.getMonth() === month,
          isToday: !!todayIso && iso === todayIso,
        });
      }
      weeks.push(week);
    }
    return { year, month, weeks };
  }

  // events 를 날짜(YYYY-MM-DD, 로컬)별로 묶기 — 캘린더 칸에 표시용
  function groupEventsByLocalDate(events) {
    const map = {};
    (events || []).forEach((event) => {
      if (!event || !event.startsAt) return;
      const d = new Date(event.startsAt);
      if (Number.isNaN(d.getTime())) return;
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      (map[iso] = map[iso] || []).push(event);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
    return map;
  }

  const api = {
    DEFAULT_ALARMS,
    toUtcStamp,
    escapeIcsText,
    googleCalendarUrl,
    buildIcs,
    icsFileName,
    monthMatrix,
    groupEventsByLocalDate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.calendar = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
