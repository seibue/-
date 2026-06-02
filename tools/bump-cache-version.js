const fs = require("fs");
const path = require("path");

const version = process.argv[2];

if (!version || !/^[a-zA-Z0-9._-]+$/.test(version)) {
  console.error("Usage: node tools/bump-cache-version.js 20260520-card-data");
  process.exit(1);
}

const root = process.cwd();

function updateFile(fileName, replacements) {
  const filePath = path.join(root, fileName);
  let text = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, text, "utf8");
  console.log(`Updated ${fileName}`);
}

updateFile("index.html", [
  [/manifest\.webmanifest\?v=[^"]+/g, `manifest.webmanifest?v=${version}`],
  [/styles\.css\?v=[^"]+/g, `styles.css?v=${version}`],
  [/card-catalog\.js\?v=[^"]+/g, `card-catalog.js?v=${version}`],
  [/korean-card-effects\.js\?v=[^"]+/g, `korean-card-effects.js?v=${version}`],
  [/js\/format\.js\?v=[^"]+/g, `js/format.js?v=${version}`],
  [/js\/docx-export\.js\?v=[^"]+/g, `js/docx-export.js?v=${version}`],
  [/js\/share-image\.js\?v=[^"]+/g, `js/share-image.js?v=${version}`],
  [/js\/card-effects\.js\?v=[^"]+/g, `js/card-effects.js?v=${version}`],
  [/app\.js\?v=[^"]+/g, `app.js?v=${version}`],
]);

updateFile("app.js", [
  [/const APP_VERSION = "[0-9A-Za-z._-]+";/g, `const APP_VERSION = "${version}";`],
  [/sw\.js\?v=[0-9A-Za-z._-]+/g, `sw.js?v=${version}`],
]);

updateFile("sw.js", [
  [/jeonjeokmon-shell-[0-9A-Za-z._-]+/g, `jeonjeokmon-shell-${version}`],
]);

console.log(`Cache version bumped to ${version}`);
