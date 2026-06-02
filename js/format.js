/**
 * 전적몬 — 순수 포매팅/결과 헬퍼 모듈 (모듈 분리 A1)
 *
 * data / state / DOM / IIFE 상수에 의존하지 않는 순수 함수만 모았습니다.
 * - 브라우저: window.JJM.format 으로 노출 (app.js 보다 먼저 로드)
 * - Node(테스트): module.exports 로 require 가능
 *
 * 동작을 바꾸지 말 것. 여기 함수의 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char];
    });
  }

  function todayISO() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "날짜 없음";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function resultLabel(result) {
    return {
      win: "승리",
      loss: "패배",
      draw: "무승부",
    }[result] || "기록";
  }

  function resultShortLabel(result) {
    return {
      win: "승",
      loss: "패",
      draw: "무",
    }[result] || "기록";
  }

  function playOrderLabel(order) {
    return {
      first: "선공",
      second: "후공",
      unknown: "선후공 미상",
    }[order] || "선후공 미상";
  }

  function resultFromGameStats(stats) {
    if ((Number(stats.gameWins) || 0) > (Number(stats.gameLosses) || 0)) return "win";
    if ((Number(stats.gameWins) || 0) < (Number(stats.gameLosses) || 0)) return "loss";
    return "draw";
  }

  function singleGameStats(result) {
    return {
      gameWins: result === "win" ? 1 : 0,
      gameLosses: result === "loss" ? 1 : 0,
      gameDraws: result === "draw" ? 1 : 0,
    };
  }

  function normalizeGameStats(wins, losses, draws, fallbackResult = "win") {
    const gameWins = Math.max(0, Math.min(9, Number(wins) || 0));
    const gameLosses = Math.max(0, Math.min(9, Number(losses) || 0));
    const gameDraws = Math.max(0, Math.min(9, Number(draws) || 0));
    if (gameWins + gameLosses + gameDraws) return { gameWins, gameLosses, gameDraws };
    return singleGameStats(fallbackResult);
  }

  function emptyRecordStats() {
    return { total: 0, wins: 0, losses: 0, draws: 0, gameTotal: 0, gameWins: 0, gameLosses: 0, gameDraws: 0 };
  }

  function finalizeRecordStats(stats) {
    return {
      ...stats,
      rate: stats.total ? Math.round((stats.wins / stats.total) * 100) : 0,
      gameRate: stats.gameTotal ? Math.round((stats.gameWins / stats.gameTotal) * 100) : 0,
    };
  }

  const format = {
    uid,
    escapeHTML,
    todayISO,
    formatDate,
    resultLabel,
    resultShortLabel,
    playOrderLabel,
    resultFromGameStats,
    singleGameStats,
    normalizeGameStats,
    emptyRecordStats,
    finalizeRecordStats,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = format;
  }

  global.JJM = global.JJM || {};
  global.JJM.format = format;
})(typeof globalThis !== "undefined" ? globalThis : this);
