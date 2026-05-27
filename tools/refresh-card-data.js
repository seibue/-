const { spawnSync } = require("child_process");
const path = require("path");

const root = process.cwd();
const node = process.execPath;
const args = process.argv.slice(2);
const modeFlags = args.filter((arg) => arg === "--catalog-only" || arg === "--effects-only");
const versionArg =
  args.find((arg) => arg.startsWith("--version="))?.slice("--version=".length) ||
  args.find((arg) => !arg.startsWith("--"));
const defaultVersion = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-card-data`;
const version = versionArg || defaultVersion;

if (!/^[a-zA-Z0-9._-]+$/.test(version)) {
  console.error("Usage: node tools/refresh-card-data.js [--catalog-only|--effects-only] [--version=20260525-card-data]");
  process.exit(1);
}

function run(label, commandArgs) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(node, commandArgs, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("카드 데이터 갱신", [path.join(root, "tools", "update-card-data.js"), ...modeFlags]);
run("캐시 버전 갱신", [path.join(root, "tools", "bump-cache-version.js"), version]);

console.log("\n완료했습니다. GitHub에 올릴 파일:");
[
  "index.html",
  "app.js",
  "styles.css",
  "card-catalog.js",
  "korean-card-effects.js",
  "sw.js",
  "tools/update-card-data.js",
  "tools/bump-cache-version.js",
  "tools/refresh-card-data.js",
].forEach((fileName) => console.log(`- ${fileName}`));
