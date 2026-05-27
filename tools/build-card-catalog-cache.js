const fs = require("fs");
const https = require("https");
const path = require("path");

const SOURCE_URL = "https://dgchub.com/assets/assets/data/cards.json";
const OUTPUT_FILE = path.resolve(process.cwd(), "card-catalog.js");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/json,text/plain,*/*",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.4",
            Referer: "https://dgchub.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JeonjeokmonCardCatalogBuilder/1.0",
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
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pick(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeType(value) {
  const text = String(value || "").toLowerCase().replace(/[\s_-]/g, "");
  if (["digiegg", "digitama", "egg", "digi-egg", "디지타마"].includes(text)) return "digiEgg";
  if (["tamer", "테이머"].includes(text)) return "tamer";
  if (["option", "옵션"].includes(text)) return "option";
  if (["digimon", "디지몬"].includes(text)) return "digimon";
  return "other";
}

function normalizeColor(value) {
  const text = String(value || "").toLowerCase();
  const aliases = {
    빨강: "red",
    레드: "red",
    파랑: "blue",
    블루: "blue",
    노랑: "yellow",
    옐로: "yellow",
    초록: "green",
    그린: "green",
    검정: "black",
    블랙: "black",
    보라: "purple",
    퍼플: "purple",
    흰색: "white",
    화이트: "white",
  };
  return aliases[text] || text;
}

function normalizeImage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  if (text.startsWith("/")) return `https://dgchub.com${text}`;
  return `https://dgchub.com/${text.replace(/^\.?\//, "")}`;
}

function sourceCards(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.cards)) return parsed.cards;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.items)) return parsed.items;
  throw new Error("No card array found in DGCHub payload.");
}

function normalizeCard(card) {
  const no = normalizeCardNumber(pick(card, ["no", "cardNo", "cardNumber", "number", "id"]));
  const name = cleanText(pick(card, ["name", "nameKo", "cardName", "cardNameKo", "korName", "koName"]));
  if (!no || !name) return null;

  return {
    no,
    lv: cleanText(pick(card, ["lv", "level"])).replace(/\D/g, "").slice(0, 1),
    name,
    type: normalizeType(pick(card, ["type", "cardType", "card_type"])),
    color: normalizeColor(pick(card, ["color", "color1", "mainColor"])),
    color2: normalizeColor(pick(card, ["color2", "subColor", "secondaryColor"])),
    rarity: cleanText(pick(card, ["rarity", "rare", "cardRarity"])),
    img: normalizeImage(pick(card, ["img", "image", "imageUrl", "smallImgUrl", "smallImageUrl", "imgUrl", "webp"])),
  };
}

async function main() {
  const body = await fetchText(SOURCE_URL);
  const parsed = JSON.parse(body);
  const cards = sourceCards(parsed).map(normalizeCard).filter(Boolean);
  const output = `window.DIGIMON_CARD_CATALOG = ${JSON.stringify(cards)};\n`;
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");

  const missingImages = cards.filter((card) => !card.img).length;
  console.log(`Wrote ${cards.length} cards to ${OUTPUT_FILE}`);
  console.log(`Cards without image URL: ${missingImages}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
