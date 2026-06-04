// Playwright e2e 설정 — 로컬 프리뷰 서버(preview-server.cjs)를 띄워 실제 브라우저로 검증.
// 실행: npm run test:e2e  (최초 1회: npx playwright install chromium)
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "node preview-server.cjs",
    port: 8787,
    reuseExistingServer: true,
    timeout: 20000,
  },
});
