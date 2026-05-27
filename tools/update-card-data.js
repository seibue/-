const { spawnSync } = require("child_process");
const path = require("path");

const root = process.cwd();
const node = process.execPath;

const tasks = [
  {
    name: "card catalog",
    label: "카드 카탈로그",
    script: path.join(root, "tools", "build-card-catalog-cache.js"),
    flag: "--catalog-only",
  },
  {
    name: "korean effects",
    label: "정발 효과",
    script: path.join(root, "tools", "build-korean-card-effects-cache.js"),
    flag: "--effects-only",
  },
];

function selectedTasks() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--catalog-only")) return tasks.filter((task) => task.flag === "--catalog-only");
  if (args.has("--effects-only")) return tasks.filter((task) => task.flag === "--effects-only");
  return tasks;
}

for (const task of selectedTasks()) {
  console.log(`\n== ${task.label} 갱신 ==`);
  const result = spawnSync(node, [task.script], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) {
  console.log("\n카드 데이터 갱신 완료");
}
