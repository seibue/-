const fs = require("fs");
const https = require("https");
const path = require("path");

const BASE_URL = "https://digimoncard.co.kr/";
const CARDLIST_URL = `${BASE_URL}cardlist`;
const OUTPUT_FILE = path.resolve(process.cwd(), "korean-card-effects.js");
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
            Referer: BASE_URL,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JeonjeokmonCacheBuilder/1.0",
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
              reject(new Error(`HTTP ${response.statusCode}: ${url}`));
              return;
            }
            resolve(body);
          });
        }
      )
      .on("error", reject);
  });
}

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
    rtri: "▷",
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

function parseCards(html, sourceUrl, fetchedAt) {
  return extractCardItems(html)
    .map((item) => {
      const cardNumber = normalizeCardNumber((item.match(/class=["']cardno["'][^>]*>\s*([^<]+)/i) || [])[1]);
      if (!cardNumber) return null;
      const nameRaw = cleanText((item.match(/<div\b[^>]*class=["']card_name["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "");
      const name = nameRaw.replace(new RegExp(`^${cardNumber}\\s*[A-Z]*\\s*`, "i"), "").trim();
      const mainEffect = findDlValue(item, "상단 텍스트");
      const sourceEffect = findDlValue(item, "하단 텍스트");
      const securityEffect = findDlValue(item, "시큐리티 효과");
      if (!mainEffect && !sourceEffect && !securityEffect) return null;
      return {
        cardNumber,
        name,
        sourceUrl,
        fetchedAt,
        mainEffect,
        sourceEffect,
        securityEffect,
        altEffect: "",
      };
    })
    .filter(Boolean);
}

function categoryIds(html) {
  return [
    ...new Set(
      [...String(html || "").matchAll(/index\.php\?mid=cardlist(?:&amp;|&)category=(\d+)/gi)]
        .map((match) => match[1])
        .filter(Boolean)
    ),
  ];
}

function maxPage(html) {
  const pages = [...String(html || "").matchAll(/(?:&amp;|&)page=(\d+)/gi)].map((match) => Number(match[1]) || 1);
  return Math.max(1, ...pages);
}

function cardListUrl(category, page = 1) {
  const url = new URL("index.php", BASE_URL);
  url.searchParams.set("mid", "cardlist");
  url.searchParams.set("category", category);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

function writeCache(cards) {
  const sorted = Object.fromEntries(
    [...cards.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([cardNumber, card]) => [
      cardNumber,
      {
        name: card.name,
        sourceUrl: card.sourceUrl,
        fetchedAt: card.fetchedAt,
        mainEffect: card.mainEffect,
        sourceEffect: card.sourceEffect,
        securityEffect: card.securityEffect,
        altEffect: card.altEffect,
      },
    ])
  );
  const output = `window.KOREAN_CARD_EFFECTS = ${JSON.stringify(sorted, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const firstHtml = await fetchText(CARDLIST_URL);
  const categories = categoryIds(firstHtml);
  if (!categories.length) throw new Error("No card categories found.");

  const cards = new Map();
  let fetchedPages = 0;

  for (const [index, category] of categories.entries()) {
    const firstUrl = cardListUrl(category, 1);
    const firstPage = await fetchText(firstUrl);
    fetchedPages += 1;
    const lastPage = maxPage(firstPage);
    const pages = [[firstUrl, firstPage]];
    for (let page = 2; page <= lastPage; page += 1) {
      await sleep(DELAY_MS);
      const url = cardListUrl(category, page);
      pages.push([url, await fetchText(url)]);
      fetchedPages += 1;
    }

    pages.forEach(([url, html]) => {
      parseCards(html, url, fetchedAt).forEach((card) => {
        const existing = cards.get(card.cardNumber);
        if (!existing || (!existing.mainEffect && !existing.sourceEffect && !existing.securityEffect)) {
          cards.set(card.cardNumber, card);
        }
      });
    });

    console.log(`[${index + 1}/${categories.length}] category ${category}, pages ${lastPage}, cards ${cards.size}`);
    await sleep(DELAY_MS);
  }

  writeCache(cards);
  console.log(`Wrote ${cards.size} cards from ${fetchedPages} pages to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
