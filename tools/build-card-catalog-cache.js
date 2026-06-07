const fs = require("fs");
const https = require("https");
const path = require("path");

// 카드 카탈로그(목록/메타데이터)는 일본 공식 사이트(digimoncard.com)에서 가져온다.
// - 이유: dgchub 의존 제거 + 공식·완전한 카드 데이터(번호/색/형태/종류/레어도/이미지).
// - 한글 이름은 한국 공식(korean-card-effects.js, KR 사이트)에서 번호로 매칭해 채우고,
//   미발매(일본 선행) 카드는 일본어 이름으로 남긴다.
// - 효과는 별도(build-korean-card-effects-cache.js)에서 한국 공식으로 받는다.
const BASE_URL = "https://digimoncard.com/cards/";
const OUTPUT_FILE = path.resolve(process.cwd(), "card-catalog.js");
const KOREAN_EFFECTS_FILE = path.resolve(process.cwd(), "korean-card-effects.js");
const DELAY_MS = 150;

// 소스 구조가 또 바뀌어 대량 누락이 생겨도 빈/반토막 카탈로그를 덮어쓰지 않도록 하한선.
const MIN_EXPECTED_CARDS = 4000;

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
            "Accept-Language": "ja,en-US;q=0.8,en;q=0.6",
            Referer: BASE_URL,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JeonjeokmonCardCatalogBuilder/2.0",
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

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// 일본어 색 → 내부 코드
const COLOR_MAP = { 赤: "red", 青: "blue", 黄: "yellow", 緑: "green", 黒: "black", 紫: "purple", 白: "white" };

function mapColors(colorDdHtml) {
  const matched = String(colorDdHtml || "").match(/赤|青|黄|緑|黒|紫|白/g) || [];
  const codes = matched.map((c) => COLOR_MAP[c]).filter(Boolean);
  return { color: codes[0] || "", color2: codes[1] || "" };
}

// 일본어 카드 분류(cardType) → 내부 종류. "デジモン/オプション" 같은 복합은 우선순위로 판정.
function mapType(cardTypeText) {
  const text = String(cardTypeText || "");
  if (text.includes("デジタマ")) return "digiEgg";
  if (text.includes("テイマー")) return "tamer";
  if (text.includes("デジモン")) return "digimon";
  if (text.includes("オプション")) return "option";
  return "other";
}

function extractField(itemHtml, className) {
  const re = new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)<\\/`, "i");
  const match = String(itemHtml || "").match(re);
  return match ? cleanText(match[1]) : "";
}

function colorDd(itemHtml) {
  const match = String(itemHtml || "").match(/cardInfoTit"[^>]*>\s*色\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
  return match ? match[1] : "";
}

function parseCards(html) {
  return String(html || "")
    .split(/<li class="image_lists_item/)
    .slice(1)
    .map((item) => {
      const no = normalizeCardNumber(extractField(item, "cardNo"));
      if (!no) return null;
      const rarity = extractField(item, "cardRarity");
      const cardTypeText = extractField(item, "cardType");
      const lvText = extractField(item, "cardLv");
      const lv = (lvText.match(/(\d)/) || [, ""])[1];
      const jpName = extractField(item, "cardTitle");
      const { color, color2 } = mapColors(colorDd(item));
      return { no, rarity, type: mapType(cardTypeText), lv, jpName, color, color2 };
    })
    .filter(Boolean);
}

function categoryIds(html) {
  return [
    ...new Set(
      [...String(html || "").matchAll(/<option value="(\d{4,})">/g)].map((match) => match[1])
    ),
  ];
}

function loadKoreanNames() {
  if (!fs.existsSync(KOREAN_EFFECTS_FILE)) return {};
  try {
    const sandbox = { window: {} };
    const code = fs.readFileSync(KOREAN_EFFECTS_FILE, "utf8");
    // eslint-disable-next-line no-new-func
    new Function("window", code)(sandbox.window);
    const effects = sandbox.window.KOREAN_CARD_EFFECTS || {};
    const names = {};
    Object.keys(effects).forEach((no) => {
      const name = String(effects[no]?.name || "").trim();
      if (name) names[normalizeCardNumber(no)] = name;
    });
    return names;
  } catch (error) {
    console.warn("한글 이름 로드 실패(일본어 이름으로 대체):", error.message);
    return {};
  }
}

async function main() {
  const koreanNames = loadKoreanNames();
  console.log(`한글 이름 소스: ${Object.keys(koreanNames).length}장`);

  const firstHtml = await fetchText(`${BASE_URL}?search=true`);
  const categories = categoryIds(firstHtml);
  if (!categories.length) throw new Error("카드 카테고리를 찾지 못했습니다(소스 구조 변경 가능).");
  console.log(`카테고리 ${categories.length}개`);

  const byNumber = new Map();
  let koMatched = 0;

  for (const [index, category] of categories.entries()) {
    const url = `${BASE_URL}?search=true&category=${category}`;
    const html = await fetchText(url);
    const cards = parseCards(html);
    cards.forEach((card) => {
      if (byNumber.has(card.no)) return; // 병렬/중복은 첫 항목만
      const koName = koreanNames[card.no];
      if (koName) koMatched += 1;
      byNumber.set(card.no, {
        no: card.no,
        lv: card.lv,
        name: koName || card.jpName,
        type: card.type,
        color: card.color,
        color2: card.color2,
        rarity: card.rarity,
        img: "", // 앱은 images.digimoncard.io로 이미지를 받는다(런타임). 카탈로그엔 싣지 않음.
      });
    });
    console.log(`[${index + 1}/${categories.length}] category ${category}, cards ${byNumber.size}`);
    await sleep(DELAY_MS);
  }

  const list = [...byNumber.values()];
  if (list.length < MIN_EXPECTED_CARDS) {
    throw new Error(
      `카탈로그 카드 수가 비정상적으로 적습니다(${list.length}). ` +
        `소스 구조가 바뀌었을 수 있어 기존 card-catalog.js를 보호하기 위해 중단합니다.`
    );
  }

  const output = `window.DIGIMON_CARD_CATALOG = ${JSON.stringify(list)};\n`;
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");

  const jpNameCount = list.length - koMatched;
  console.log(`Wrote ${list.length} cards to ${OUTPUT_FILE}`);
  console.log(`한글 이름: ${koMatched}장 / 일본어 이름(미발매 등): ${jpNameCount}장`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
