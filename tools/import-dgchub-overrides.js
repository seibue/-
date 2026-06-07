const https = require("https");
const fs = require("fs");
const APPLY = process.argv.includes("--apply");

function f(u) {
  return new Promise((res) => {
    https.get(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://dgchub.com/" } }, (r) => {
      let b = "";
      r.setEncoding("utf8");
      r.on("data", (c) => (b += c));
      r.on("end", () => res(b));
    });
  });
}
function clean(s) {
  return String(s || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

(async () => {
  const raw = JSON.parse(await f("https://dgchub.com/assets/assets/data/cards.json"));
  const dg = new Map();
  raw.forEach((c) => {
    const kor = (c.localeCardData || []).find((l) => l.locale === "KOR") || {};
    if (kor.name && /[가-힣]/.test(kor.name)) {
      dg.set(c.cardNo, { name: kor.name.trim(), effect: clean(kor.effect), sourceEffect: clean(kor.sourceEffect) });
    }
  });

  // 우리 카탈로그에서 일본어명 카드만 대상
  const cw = {};
  new Function("window", fs.readFileSync("card-catalog.js", "utf8"))(cw);
  const jpCards = cw.DIGIMON_CARD_CATALOG.filter((c) => !/[가-힣]/.test(c.name));

  const overrides = JSON.parse(fs.readFileSync("tools/effect-overrides.json", "utf8"));
  const bySet = {};
  let added = 0;
  const newEntries = {};
  jpCards.forEach((c) => {
    if (overrides[c.no]) return; // 이미 있으면 건너뜀(BT25 수작업 보존)
    const d = dg.get(c.no);
    if (!d) return;
    const entry = { name: d.name };
    if (d.effect) entry.mainEffect = d.effect;
    if (d.sourceEffect) entry.sourceEffect = d.sourceEffect;
    newEntries[c.no] = entry;
    const set = (c.no.match(/^[A-Z]+\d*(?=-)/) || ["?"])[0];
    bySet[set] = (bySet[set] || 0) + 1;
    added += 1;
  });

  console.log("dgchub 한글 카드:", dg.size);
  console.log("우리 일본어명 카드:", jpCards.length);
  console.log("dgchub로 채울 수 있는 카드:", added);
  console.log("세트별:", JSON.stringify(bySet));
  // 샘플
  ["EX11-001", "BT24-016", "BT22-010", "EX9-001"].forEach((no) => {
    if (newEntries[no]) console.log(`\n[${no}] ${newEntries[no].name}\n  상단:${(newEntries[no].mainEffect || "").slice(0, 70)}\n  진화원:${(newEntries[no].sourceEffect || "").slice(0, 60)}`);
  });

  if (APPLY) {
    Object.assign(overrides, newEntries);
    fs.writeFileSync("tools/effect-overrides.json", JSON.stringify(overrides, null, 2) + "\n", "utf8");
    console.log(`\n[적용] ${added}장 추가, 총 ${Object.keys(overrides).filter((k) => !k.startsWith("_")).length}장`);
  } else {
    console.log("\n(드라이런 — 실제 적용하려면 --apply)");
  }
})();
