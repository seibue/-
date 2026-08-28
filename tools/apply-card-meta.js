// tools/card-meta-overrides.json 의 속성(attribute)/유형(form) 보강을 card-catalog.js 의
// "빈 필드에만" 채운다(기존 공식 데이터는 덮어쓰지 않음). 재크롤 없이 즉시 적용.
// 사용: node tools/apply-card-meta.js
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const META_FILE = path.resolve(ROOT, "tools", "card-meta-overrides.json");
const CATALOG_FILE = path.resolve(ROOT, "card-catalog.js");

function loadWindowVar(file, varName) {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(new RegExp(varName + "\\s*=\\s*([\\s\\S]*?);\\s*$"));
  if (!m) throw new Error(varName + " 파싱 실패: " + file);
  return eval("(" + m[1] + ")");
}

function applyCardMeta() {
  const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  const catalog = loadWindowVar(CATALOG_FILE, "window.DIGIMON_CARD_CATALOG");
  const byNo = new Map(catalog.map((c) => [c.no, c]));
  let filledAttr = 0, filledForm = 0;
  for (const [no, ov] of Object.entries(meta)) {
    if (no.startsWith("_")) continue;
    const card = byNo.get(no);
    if (!card) continue;
    if (ov.attribute && !card.attribute) { card.attribute = ov.attribute; filledAttr++; }
    if (ov.form && !card.form) { card.form = ov.form; filledForm++; }
  }
  fs.writeFileSync(CATALOG_FILE, "window.DIGIMON_CARD_CATALOG = " + JSON.stringify(catalog) + ";\n", "utf8");
  console.log("card-catalog.js 보강: 속성 " + filledAttr + "장, 유형 " + filledForm + "장");
}

if (require.main === module) applyCardMeta();
module.exports = { applyCardMeta };
