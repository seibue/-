const https = require("https");
const { rateLimit, clientKey, tooMany, reportError } = require("./_ops.js");

const API_VERSION = "20260518-debug-parse";
const KOREAN_CARDLIST_URL = "https://digimoncard.co.kr/";
// 크롤러는 카드별 1회 조회 후 클라이언트가 캐시하므로 호출 빈도가 낮다.
const RATE_LIMIT_PER_MIN = 60;

function normalizeCardNumber(value) {
  return String(value || "")
    .replace(/[^a-z0-9-]/gi, "")
    .toUpperCase();
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    rtri: "▹",
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key[0] === "#") {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
  });
}

function cleanText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
  ).trim();
}

function meaningfulText(value) {
  const text = cleanText(value);
  return text && text !== "-" ? text : "";
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.4",
            Referer: KOREAN_CARDLIST_URL,
            "User-Agent": "Mozilla/5.0 (compatible; Jeonjeokmon/1.0; +https://jeonjeokmon.vercel.app/)",
          },
        },
        (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(fetchText(new URL(response.headers.location, url).toString()));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }
          resolve(body);
        });
      }
      )
      .on("error", reject);
  });
}

function findDlValue(section, label) {
  const pattern = new RegExp(`<dt>\\s*${label}\\s*<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>`, "i");
  const match = String(section || "").match(pattern);
  return match ? meaningfulText(match[1]) : "";
}

function extractCardItems(html) {
  const source = String(html || "");
  const items = source
    .split(/(?=<li\b[^>]*class=["'][^"']*image_lists_item)/gi)
    .filter((chunk) => /^<li\b[^>]*class=["'][^"']*image_lists_item/i.test(chunk));
  if (items.length) return items.map((item) => item.replace(/<\/ul>\s*<\/div>[\s\S]*$/i, ""));
  return source.split(/<li class="image_lists_item[^"]*">/i).slice(1);
}

function parseKoreanCard(html, requestedCardNumber) {
  const requested = normalizeCardNumber(requestedCardNumber);
  const items = extractCardItems(html);
  for (const item of items) {
    const cardNumber = normalizeCardNumber((item.match(/class=["']cardno["'][^>]*>\s*([^<]+)/i) || [])[1]);
    if (cardNumber !== requested) continue;
    const nameRaw = cleanText((item.match(/<div\b[^>]*class=["']card_name["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "");
    const name = nameRaw.replace(new RegExp(`^${cardNumber}\\s*[A-Z]*\\s*`, "i"), "").trim();
    const topText = findDlValue(item, "상단 텍스트");
    const bottomText = findDlValue(item, "하단 텍스트");
    const securityText = findDlValue(item, "시큐리티 효과");
    const sourceUrl = `${KOREAN_CARDLIST_URL}?mid=cardlist&title=${encodeURIComponent(cardNumber)}&multi_extra_search=Y`;
    return {
      cardNumber,
      name,
      source: "kr",
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      mainEffect: topText,
      sourceEffect: bottomText,
      securityEffect: securityText,
      altEffect: "",
      hasEffect: Boolean(topText || bottomText || securityText),
      apiVersion: API_VERSION,
    };
  }
  return null;
}

async function lookupKoreanCard(cardNumber, includeDebug = false) {
  const normalized = normalizeCardNumber(cardNumber);
  if (!normalized) return null;
  const url = `${KOREAN_CARDLIST_URL}?mid=cardlist&title=${encodeURIComponent(normalized)}&multi_extra_search=Y`;
  const html = await fetchText(url);
  const result = parseKoreanCard(html, normalized);
  if (result || !includeDebug) return result;
  return {
    cardNumber: normalized,
    found: false,
    apiVersion: API_VERSION,
    debug: {
      itemCount: extractCardItems(html).length,
      hasRequestedText: html.includes(normalized),
      htmlLength: html.length,
    },
  };
}

function sendJson(response, statusCode, payload) {
  if (typeof response.status === "function" && typeof response.json === "function") {
    response.status(statusCode).json(payload);
    return;
  }
  response.writeHead(statusCode, {
    "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function handler(request, response) {
  try {
    const rl = rateLimit(`korean-card:${clientKey(request)}`, RATE_LIMIT_PER_MIN);
    if (!rl.ok) {
      tooMany(response, rl, API_VERSION);
      return;
    }
    const url = new URL(request.url || "", "http://localhost");
    const card = normalizeCardNumber(request.query?.card || url.searchParams.get("card"));
    if (!card) {
      sendJson(response, 400, { error: "card query is required", apiVersion: API_VERSION });
      return;
    }
    const debug = url.searchParams.get("debug") === "1" || request.query?.debug === "1";
    const result = await lookupKoreanCard(card, debug);
    if (!result) {
      sendJson(response, 404, { cardNumber: card, found: false, apiVersion: API_VERSION });
      return;
    }
    if (result.found === false) {
      sendJson(response, 404, result);
      return;
    }
    sendJson(response, 200, { found: true, ...result });
  } catch (error) {
    reportError("korean-card.lookup", error, { url: String(request.url || "") });
    sendJson(response, 500, { error: "lookup failed", apiVersion: API_VERSION });
  }
}

module.exports = handler;
module.exports.lookupKoreanCard = lookupKoreanCard;
module.exports.parseKoreanCard = parseKoreanCard;
