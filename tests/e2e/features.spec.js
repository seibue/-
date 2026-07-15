/**
 * 전적몬 e2e 기능 시나리오 (Playwright)
 * 3대3 팀전 · 개인 일정 · 덱 빌더 저장 · 삭제→undo · 접근성(Escape/포커스 트랩/라이브 리전)
 * 실행: npm run test:e2e
 */
const { test, expect } = require("@playwright/test");

async function gotoApp(page) {
  await page.goto("/");
  await expect(page.locator("#app")).not.toBeEmpty();
}

test("3대3 팀전: 유형 선택 시 전용 필드 → 저장 후 팀 뱃지", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="matches"]').first().click();
  await page.locator('[data-action="open-match"]').click();

  const form = page.locator("#match-form");
  await expect(form).toBeVisible();
  // 기본 유형에서는 3대3 필드가 숨겨져 있다
  await expect(form.locator(".team3-fields")).toBeHidden();

  await form.locator('select[name="matchType"]').selectOption("3대3 팀전");
  await expect(form.locator(".team3-fields")).toBeVisible();

  await form.locator('input[name="opponent"]').fill("e2e 팀전 상대");
  // 세그먼트 컨트롤이라 input 이 시각적으로 숨겨져 있음 → force
  await form.locator('input[name="teamPosition"][value="B"]').check({ force: true });
  await form.locator('input[name="teamResult"][value="win"]').check({ force: true });
  // 제출 버튼이 2개("추가 후 계속"/"추가") — 모달을 닫는 기본 제출(.primary-action)을 클릭
  await page.locator('.primary-action[type="submit"][form="match-form"]').click();

  // 전적 카드에 '팀 승 · B자리' 뱃지
  const badge = page.locator(".team3-badge").first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("팀 승");
  await expect(badge).toContainText("B자리");
});

test("개인 일정: 추가하면 캘린더에 금색 칩으로 표시된다", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="events"]').first().click();
  await page.locator('[data-action="add-personal-event"]').click();

  const form = page.locator("#event-form");
  await expect(form).toBeVisible();
  await expect(page.getByText("나만 보이는 개인 일정")).toBeVisible();
  await form.locator('input[name="title"]').fill("e2e 개인 연습");
  // 날짜=오늘, 시간=10:00 기본값 사용
  await page.locator('button[type="submit"][form="event-form"], #event-form button[type="submit"]').first().click();

  // 캘린더 격자에 개인 일정 칩(.cal-ev.personal)
  const chip = page.locator(".cal-ev.personal", { hasText: "e2e 개인 연습" }).first();
  await expect(chip).toBeVisible();
});

test("덱 빌더: 새 덱에 카드 추가 후 저장하면 목록에 나타난다", async ({ page }) => {
  await gotoApp(page);
  await page.locator('[data-tab="decks"]').first().click();
  await page.locator('[data-action="open-deck"]').click();

  const form = page.locator("#deck-form");
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill("e2e 신규 덱");

  // 카탈로그 검색 → 첫 카드 추가(.catalog-info 는 상시 노출 영역)
  await page.locator("[data-deck-card-search]").fill("BT1-010");
  await page.waitForTimeout(450); // 검색 디바운스
  await page.locator('.catalog-grid .catalog-info[data-action="add-catalog-card"]').first().click();

  await page.locator('button[type="submit"][form="deck-form"]').click();
  // 모달 닫히고 목록에 새 덱
  await expect(page.locator("#deck-form")).toBeHidden({ timeout: 5000 });
  await expect(page.getByText("e2e 신규 덱").first()).toBeVisible();
});

test("삭제 → undo 토스트 → 되돌리기 복원", async ({ page }) => {
  await gotoApp(page);
  page.on("dialog", (d) => d.accept()); // confirm 자동 수락
  await page.locator('[data-tab="tournaments"]').first().click();

  // 대회 생성
  await page.locator('[data-action="open-tournament"]').click();
  await page.locator('#tournament-form input[name="name"]').fill("e2e undo 대회");
  await page.locator('button[type="submit"][form="tournament-form"]').click();
  const cardWithName = page.locator(".tournament-card", { hasText: "e2e undo 대회" });
  await expect(cardWithName).toHaveCount(1);

  // 삭제 → undo 토스트 (토스트 메시지에도 대회명이 들어가므로 카드 기준으로 검증)
  await cardWithName.locator('[data-action="delete-tournament"]').click();
  await expect(cardWithName).toHaveCount(0);
  const undoBtn = page.locator('.toast-action[data-action="restore-undo"]').first();
  await expect(undoBtn).toBeVisible();

  // 되돌리기 → 복원
  await undoBtn.click();
  await expect(cardWithName).toHaveCount(1);
});

test("온보딩: '샘플 지우기'로 샘플만 정리되고 undo로 복원된다", async ({ page }) => {
  await gotoApp(page);
  page.on("dialog", (d) => d.accept());
  // 홈 스타터 카드의 샘플 지우기
  const clearBtn = page.locator('[data-action="clear-sample-data"]').first();
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();

  // 샘플 덱이 사라지고, 버튼도 숨겨짐(샘플 없음)
  await page.locator('[data-tab="decks"]').first().click();
  await expect(page.getByText("샘플: 레드 오메가")).toHaveCount(0);
  await expect(page.locator('[data-action="clear-sample-data"]')).toHaveCount(0);

  // undo 복원
  await page.locator('.toast-action[data-action="restore-undo"]').first().click();
  await expect(page.getByText("샘플: 레드 오메가").first()).toBeVisible();
});

test("접근성: Escape 닫기 + Tab 포커스 트랩 + 토스트 라이브 리전 상시", async ({ page }) => {
  await gotoApp(page);
  // 라이브 리전은 토스트가 없어도 DOM에 존재
  await expect(page.locator('[data-toast-stack][aria-live="polite"]')).toHaveCount(1);

  // 매치 모달: Escape로 닫힘
  await page.locator('[data-tab="matches"]').first().click();
  await page.locator('[data-action="open-match"]').click();
  const dialog = page.locator('.modal-panel[role="dialog"]');
  await expect(dialog).toBeVisible();

  // 포커스 트랩: 마지막 포커스 가능 요소에서 Tab → 다이얼로그 안 첫 요소로 순환
  const wrapped = await page.evaluate(() => {
    const panel = document.querySelector(".modal-panel");
    const focusables = [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    focusables[focusables.length - 1].focus();
    return focusables.length > 1;
  });
  expect(wrapped).toBe(true);
  await page.keyboard.press("Tab");
  const stayedInDialog = await page.evaluate(() => document.querySelector(".modal-panel").contains(document.activeElement));
  expect(stayedInDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
