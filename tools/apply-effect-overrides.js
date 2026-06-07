// tools/effect-overrides.json 의 비공식 번역을, 재크롤 없이 생성 파일에 빠르게 적용한다.
// - korean-card-effects.js: 비어 있는 효과/이름 필드를 채우고 unofficial:true 표시
// - card-catalog.js: 해당 카드의 이름을 (정발 전이라 일본어였던 경우) 한글 번역명으로 갱신
//
// 전체 재생성(크롤 포함)은 build-*-cache.js / refresh-card-data.js 가 담당한다.
// 이 도구는 오버라이드만 빠르게 반영할 때 쓴다(배치 작업 중).
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OVERRIDES_FILE = path.resolve(ROOT, "tools", "effect-overrides.json");
const EFFECTS_FILE = path.resolve(ROOT, "korean-card-effects.js");
const CATALOG_FILE = path.resolve(ROOT, "card-catalog.js");

function normalizeCardNumber(value) {
  return String(value || "").replace(/[^a-z0-9-]/gi, "").toUpperCase();
}
function meaningfulText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && text !== "-" ? text : "";
}
function loadWindowVar(file, varName) {
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function("window", fs.readFileSync(file, "utf8"))(sandbox.window);
  return sandbox.window[varName];
}

const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"));
const effects = loadWindowVar(EFFECTS_FILE, "KOREAN_CARD_EFFECTS") || {};

let appliedEffects = 0;
Object.keys(overrides).forEach((key) => {
  if (key.startsWith("_")) return;
  const no = normalizeCardNumber(key);
  if (!no) return;
  const ov = overrides[key] || {};
  const existing = effects[no] || {
    name: "",
    sourceUrl: "",
    fetchedAt: new Date().toISOString(),
    mainEffect: "",
    sourceEffect: "",
    securityEffect: "",
    altEffect: "",
  };
  let touched = false;
  const ovName = meaningfulText(ov.name);
  if (ovName && !existing.name) {
    existing.name = ovName;
    touched = true;
  }
  ["mainEffect", "sourceEffect", "securityEffect", "altEffect"].forEach((field) => {
    const value = meaningfulText(ov[field]);
    if (value && !existing[field]) {
      existing[field] = value;
      touched = true;
    }
  });
  if (touched) {
    existing.unofficial = true;
    effects[no] = existing;
    appliedEffects += 1;
  }
});

// korean-card-effects.js 재작성(번호순 정렬, 빌더와 동일 포맷)
const sortedEffects = Object.fromEntries(
  Object.keys(effects)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((no) => {
      const c = effects[no];
      return [
        no,
        {
          name: c.name,
          sourceUrl: c.sourceUrl,
          fetchedAt: c.fetchedAt,
          mainEffect: c.mainEffect,
          sourceEffect: c.sourceEffect,
          securityEffect: c.securityEffect,
          altEffect: c.altEffect,
          ...(c.unofficial ? { unofficial: true } : {}),
        },
      ];
    })
);
fs.writeFileSync(EFFECTS_FILE, `window.KOREAN_CARD_EFFECTS = ${JSON.stringify(sortedEffects, null, 2)};\n`, "utf8");

// card-catalog.js: 오버라이드로 이름이 생긴 카드의 카탈로그 이름을 한글로 동기화
const catalog = loadWindowVar(CATALOG_FILE, "DIGIMON_CARD_CATALOG") || [];
let appliedNames = 0;
const byNo = new Map(catalog.map((c) => [c.no, c]));
Object.keys(overrides).forEach((key) => {
  if (key.startsWith("_")) return;
  const no = normalizeCardNumber(key);
  const krName = sortedEffects[no] && sortedEffects[no].name;
  const card = byNo.get(no);
  if (krName && card && card.name !== krName) {
    card.name = krName;
    appliedNames += 1;
  }
});
fs.writeFileSync(CATALOG_FILE, `window.DIGIMON_CARD_CATALOG = ${JSON.stringify(catalog)};\n`, "utf8");

console.log(`효과/이름 보강: ${appliedEffects}장, 카탈로그 이름 갱신: ${appliedNames}장`);
