/**
 * 전적몬 e2e 스모크 테스트 (Playwright)
 * 그동안 수동으로 확인하던 핵심 흐름을 자동 검증한다.
 * 실행: npm run test:e2e
 */
const { test, expect } = require("@playwright/test");

// 클라우드/외부 CDN/서비스워커 관련 잡음은 앱 오류로 보지 않는다.
const IGNORE_ERROR = /supabase|jsdelivr|sw\.js|serviceworker|favicon|net::err|failed to fetch|load failed/i;

async function gotoApp(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#app")).not.toBeEmpty();
  return errors;
}

test("앱이 콘솔 에러 없이 로드된다", async ({ page }) => {
  const errors = await gotoApp(page);
  await expect(page.locator('[data-tab="home"]').first()).toBeVisible();
  await page.waitForTimeout(500);
  const appErrors = errors.filter((e) => !IGNORE_ERROR.test(e));
  expect(appErrors, appErrors.join("\n")).toEqual([]);
});

test("6개 탭이 모두 렌더된다", async ({ page }) => {
  await gotoApp(page);
  for (const tab of ["matches", "tournaments", "decks", "stats", "settings", "home"]) {
    await page.locator(`[data-tab="${tab}"]`).first().click();
    await expect(page.locator("#app")).not.toBeEmpty();
  }
});

test("카드 검색 경계: 'bt21'은 BT21 세트만 보여준다", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="decks"]').first().click();
  await page.locator('[data-action="edit-deck"]').first().click();
  await page.locator("[data-deck-card-search]").fill("bt21");
  await page.waitForTimeout(450); // 검색 디바운스
  const nos = await page
    .locator(".catalog-grid .catalog-card [data-card-no]")
    .evaluateAll((els) => [...new Set(els.map((e) => e.dataset.cardNo))]);
  expect(nos.length).toBeGreaterThan(0);
  expect(nos.every((n) => n.startsWith("BT21-"))).toBe(true);
});

test("카드 검색 결과에 같은 번호 중복이 없다", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="decks"]').first().click();
  await page.locator('[data-action="edit-deck"]').first().click();
  await page.locator("[data-deck-card-search]").fill("BT1-");
  await page.waitForTimeout(450);
  // 카드 1개당 data-card-no 요소가 여러 개이므로 카드 컨테이너 기준으로 번호를 수집
  const nos = await page
    .locator(".catalog-grid .catalog-card")
    .evaluateAll((cards) => cards.map((c) => c.querySelector("[data-card-no]")?.dataset.cardNo));
  const distinct = new Set(nos);
  expect(nos.length).toBeGreaterThan(0);
  expect(nos.length).toBe(distinct.size);
});

test("통계 탭: 기간 칩 4개 + 메타 대시보드", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="stats"]').first().click();
  await expect(page.locator('[data-action="set-stats-period"]')).toHaveCount(4);
  await expect(page.getByText("메타 대시보드").first()).toBeVisible();
  // 기간 전환 동작
  await page.locator('[data-action="set-stats-period"][data-period="7d"]').click();
  await expect(page.locator('[data-action="set-stats-period"][data-period="7d"]')).toHaveClass(/active/);
});

test("모바일 덱 목록: 카드 +/- 버튼이 보이고 수량이 바뀐다", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "모바일 뷰포트 전용 (데스크톱은 hover 오버레이)");
  await gotoApp(page);
  await page.locator('[data-tab="decks"]').first().click();
  await page.locator('[data-action="edit-deck"]').first().click();
  await page.locator('[data-action="deck-builder-tab"][data-view="tray"]').click();

  const firstThumb = page.locator(".deck-thumb-item").first();
  await expect(firstThumb.locator(".deck-thumb-btn.minus")).toBeVisible();
  await expect(firstThumb.locator(".deck-thumb-btn.plus")).toBeVisible();

  const totalPill = page.locator(".deck-pill.total strong");
  const before = await totalPill.innerText();
  await firstThumb.locator(".deck-thumb-btn.minus").click();
  await expect(totalPill).not.toHaveText(before); // 총 매수가 1 줄어듦
});

test("접근성: 활성 탭 aria-current + 모달 dialog 시맨틱", async ({ page }) => {
  await gotoApp(page);
  // 활성 탭에 aria-current="page"
  await page.locator('[data-tab="decks"]').first().click();
  await expect(page.locator('[data-tab="decks"][aria-current="page"]').first()).toBeVisible();
  // 모달은 role=dialog + aria-modal
  await page.locator('[data-action="edit-deck"]').first().click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]').first();
  await expect(dialog).toBeVisible();
  await expect(page.locator('[aria-label="닫기"]').first()).toBeVisible();
});

test("덱 버전 기록 → 버전별 성적 섹션이 생긴다", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="decks"]').first().click();
  // 첫 덱 카드의 '버전' 버튼
  await page.locator('[data-action="save-deck-version"]').first().click();
  await expect(page.getByText("버전별 성적").first()).toBeVisible();
});
