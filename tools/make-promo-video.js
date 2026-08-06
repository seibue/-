/**
 * 전적몬 홍보 영상 생성기
 *
 * 실제 앱(preview-server.cjs, 8787)을 Playwright 크로미움으로 조작하면서
 * 세로 9:16 화면 녹화를 만든다. 자막·가짜 커서·인트로/아웃트로는 페이지에
 * 오버레이 레이어를 주입해서 그린다(앱 코드는 건드리지 않음).
 *
 * 실행:
 *   node tools/make-promo-video.js
 *   node tools/make-promo-video.js --keep-shots   (구간별 스크린샷도 남김)
 *
 * 결과물: promo/전적몬-홍보.webm (+ promo/shots/*.png)
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "promo");
const SHOT_DIR = path.join(OUT_DIR, "shots");
const KEEP_SHOTS = process.argv.includes("--keep-shots");

// 9:16 세로. Playwright 는 recordVideo.size 로 업스케일을 하지 않으므로(축소만 함)
// 뷰포트 = 영상 해상도로 잡아야 프레임이 꽉 찬다. 폭 540 은 모바일 레이아웃
// 브레이크포인트(@media max-width:540px) 경계 값이라 모바일 UI 를 유지하는 최대 해상도.
const VIEWPORT = { width: 540, height: 960 };
const VIDEO_SIZE = { width: 540, height: 960 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- 프리뷰 서버 */

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  if (await ping()) return null;
  const child = spawn(process.execPath, ["preview-server.cjs"], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 30; i += 1) {
    await wait(300);
    if (await ping()) return child;
  }
  child.kill();
  throw new Error("preview-server.cjs 기동 실패");
}

/* ------------------------------------------------------------- 오버레이 주입 */

function installOverlay() {
  if (window.__promo) return;
  const style = document.createElement("style");
  style.textContent = `
    #promo-layer, #promo-layer * { pointer-events: none; }
    #promo-layer {
      position: fixed; inset: 0; z-index: 2147483000;
      font-family: "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif;
    }
    #promo-cursor {
      position: fixed; left: 0; top: 0; width: 30px; height: 30px; margin: -15px 0 0 -15px;
      border-radius: 50%; border: 2px solid rgba(25,231,255,.9);
      background: radial-gradient(circle at 50% 50%, rgba(25,231,255,.45), rgba(25,231,255,.05) 70%);
      box-shadow: 0 0 18px rgba(25,231,255,.55);
      opacity: 0; transform: translate(-100px,-100px);
      transition: transform .5s cubic-bezier(.22,.61,.36,1), opacity .25s ease;
    }
    #promo-ripple {
      position: fixed; left: 0; top: 0; width: 30px; height: 30px; margin: -15px 0 0 -15px;
      border-radius: 50%; border: 2px solid rgba(255,210,31,.9); opacity: 0;
    }
    #promo-ripple.go { animation: promo-ripple .55s ease-out; }
    @keyframes promo-ripple {
      from { opacity: .95; transform: scale(.5); }
      to   { opacity: 0;   transform: scale(2.8); }
    }
    @keyframes promo-pop {
      from { opacity: 0; transform: translateY(12px) scale(.84); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes promo-fill { to { transform: scaleX(1); } }
    #promo-caption {
      position: fixed; left: 16px; right: 16px; bottom: 96px;
      padding: 14px 18px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(9,19,34,.94), rgba(3,7,18,.94));
      border: 1px solid rgba(58,118,166,.85);
      box-shadow: 0 18px 45px rgba(0,0,0,.55);
      color: #e8f4f8; opacity: 0; transform: translateY(14px);
      transition: opacity .4s ease, transform .4s ease;
    }
    #promo-caption.on { opacity: 1; transform: translateY(0); }
    #promo-caption .t { font-size: 23px; font-weight: 800; letter-spacing: -.3px; line-height: 1.35; }
    #promo-caption .s { margin-top: 6px; font-size: 17px; font-weight: 500; color: #8bb9da; }
    #promo-caption .t em { font-style: normal; color: #19e7ff; }
    #promo-title {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px; text-align: center;
      background: radial-gradient(120% 80% at 50% 30%, #0d2440 0%, #030712 62%);
      opacity: 0; transition: opacity .55s ease;
    }
    #promo-title.on { opacity: 1; }
    #promo-title img { width: 150px; height: 150px; filter: drop-shadow(0 12px 30px rgba(25,231,255,.4)); animation: promo-pop .7s cubic-bezier(.2,.9,.3,1.25) both; }
    #promo-title .big {
      font-size: 62px; font-weight: 900; letter-spacing: -2px;
      background: linear-gradient(180deg, #f8ffff 0%, #19e7ff 55%, #69f4ff 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 0 22px rgba(25,231,255,.55));
    }
    #promo-title .big em { font-style: normal; }
    #promo-title .gauge {
      position: relative; width: 300px; max-width: 72vw; height: 16px;
      border-radius: 8px; overflow: hidden; background: #0b2338;
      box-shadow: inset 0 0 0 2px #04111e, 0 0 16px rgba(25,231,255,.3);
    }
    #promo-title .gauge .fill {
      position: absolute; inset: 0; transform-origin: left; transform: scaleX(0);
      background: linear-gradient(90deg, #2de39d 0 67%, #ffd21f 67% 100%);
      animation: promo-fill 1.1s .45s cubic-bezier(.4,0,.2,1) forwards;
    }
    #promo-title .gauge .ticks {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(90deg, transparent 0 calc(100%/6 - 2px), rgba(4,7,15,.5) calc(100%/6 - 2px) calc(100%/6));
    }
    #promo-title .meta {
      display: flex; justify-content: space-between; align-items: center;
      width: 300px; max-width: 72vw;
      font-family: "Press Start 2P", "Noto Sans KR", monospace;
    }
    #promo-title .meta .bl { color: #3f9bff; font-size: 13px; letter-spacing: 1px; text-shadow: 2px 2px 0 #000; }
    #promo-title .meta .wn { color: #ffd21f; font-size: 13px; text-shadow: 2px 2px 0 #000; }
    #promo-title .sub { font-size: 22px; font-weight: 600; color: #8bb9da; line-height: 1.6; margin-top: 4px; }
    #promo-title .url {
      margin-top: 8px; padding: 14px 26px; border-radius: 999px;
      border: 1px solid rgba(25,231,255,.55); background: rgba(25,231,255,.1);
      color: #19e7ff; font-size: 23px; font-weight: 800;
    }
    #promo-title .tags { display: flex; gap: 9px; flex-wrap: wrap; justify-content: center; max-width: 420px; }
    #promo-title .tags span {
      padding: 8px 15px; border-radius: 999px; font-size: 15px; font-weight: 700;
      background: rgba(255,210,31,.12); border: 1px solid rgba(255,210,31,.45); color: #ffd21f;
    }
  `;
  document.head.appendChild(style);

  const layer = document.createElement("div");
  layer.id = "promo-layer";
  layer.innerHTML = `
    <div id="promo-title"></div>
    <div id="promo-caption"><div class="t"></div><div class="s"></div></div>
    <div id="promo-cursor"></div>
    <div id="promo-ripple"></div>`;
  document.body.appendChild(layer);

  const cursor = layer.querySelector("#promo-cursor");
  const ripple = layer.querySelector("#promo-ripple");
  const caption = layer.querySelector("#promo-caption");
  const titleCard = layer.querySelector("#promo-title");

  window.__promo = {
    caption(text, sub) {
      caption.querySelector(".t").innerHTML = text || "";
      caption.querySelector(".s").textContent = sub || "";
      caption.classList.toggle("on", Boolean(text));
    },
    hideCaption() {
      caption.classList.remove("on");
    },
    title(html) {
      titleCard.innerHTML = html;
      titleCard.classList.add("on");
    },
    hideTitle() {
      titleCard.classList.remove("on");
    },
    move(x, y) {
      cursor.style.opacity = "1";
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    },
    hideCursor() {
      cursor.style.opacity = "0";
    },
    tap(x, y) {
      ripple.style.transform = `translate(${x}px, ${y}px)`;
      ripple.classList.remove("go");
      void ripple.offsetWidth;
      ripple.classList.add("go");
    },
  };
}

/* --------------------------------------------------------------- 조작 헬퍼 */

const skipped = [];

async function ensureOverlay(page) {
  await page.evaluate(installOverlay);
}

async function titleCard(page, html, ms) {
  await page.evaluate((markup) => {
    window.__promo.hideCursor();
    window.__promo.hideCaption();
    window.__promo.title(markup);
  }, html);
  await wait(ms);
}

async function say(page, text, sub, ms = 2000) {
  await page.evaluate(([t, s]) => {
    window.__promo.hideCursor(); // 자막을 읽는 구간에서는 커서를 치운다
    window.__promo.caption(t, s);
  }, [text, sub || ""]);
  if (ms) await wait(ms);
}

async function quiet(page, ms = 400) {
  await page.evaluate(() => window.__promo.hideCaption());
  if (ms) await wait(ms);
}

async function point(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(box.height / 2, 26));
  await page.evaluate(([px, py]) => window.__promo.move(px, py), [x, y]);
  await wait(330);
  return { x, y };
}

/** 커서 이동 → 탭 링 → 실제 클릭. 없으면 건너뛰고 기록만 남긴다. */
async function tap(page, selector, label) {
  const locator = typeof selector === "string" ? page.locator(selector).first() : selector;
  try {
    await locator.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    skipped.push(label || String(selector));
    return false;
  }
  const at = await point(page, locator);
  if (at) {
    await page.evaluate(([x, y]) => window.__promo.tap(x, y), [at.x, at.y]);
    await wait(180);
  }
  await locator.click({ timeout: 4000 }).catch(() => {});
  await wait(340);
  return true;
}

async function type(page, selector, text, label) {
  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    skipped.push(label || String(selector));
    return false;
  }
  await point(page, locator);
  await locator.click({ timeout: 3000 }).catch(() => {});
  await locator.fill("");
  for (const ch of text) {
    await locator.type(ch, { delay: 0 });
    await wait(40);
  }
  await wait(320);
  return true;
}

async function scrollTo(page, y, ms = 1050) {
  await page.evaluate((top) => {
    window.__promo.hideCursor();
    window.scrollTo({ top, behavior: "smooth" });
  }, y);
  await wait(ms);
}

async function shot(page, name) {
  if (!KEEP_SHOTS) return;
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) }).catch(() => {});
}

/* ------------------------------------------------------------------ 스토리보드 */

async function run(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#app").waitFor({ state: "visible", timeout: 15000 });
  await wait(1200);
  await ensureOverlay(page);

  // 앱 재렌더로 오버레이가 지워지지 않도록(body 직속이라 안전) 매 구간 앞에서 보강
  const guard = setInterval(() => {
    page.evaluate(installOverlay).catch(() => {});
  }, 1500);

  /* 1. 인트로 */
  await titleCard(
    page,
    `<img src="/icon.svg" alt="">
     <div class="big">전적<em>몬</em></div>
     <div class="gauge"><span class="fill"></span><span class="ticks"></span></div>
     <div class="meta"><span class="bl">BATTLE LOG</span><span class="wn">WIN 67%</span></div>`,
    2600
  );
  await page.evaluate(() => window.__promo.hideTitle());
  await wait(500);
  await shot(page, "01-intro");

  /* 2. 홈 대시보드 */
  await say(page, "오늘 몇 승 몇 패였더라?", "홈에서 최근 전적과 덱별 승률을 한눈에", 1500);
  await scrollTo(page, 460, 1000);
  await shot(page, "02-home");
  await scrollTo(page, 0, 650);
  await quiet(page, 200);

  /* 3. 전적 기록 */
  await tap(page, '[data-tab="matches"]', "탭:전적");
  await say(page, "전적 기록은 <em>10초</em>", "덱 · 상대 · 결과만 고르면 끝", 1200);
  await tap(page, '[data-action="open-match"]', "전적 추가 버튼");
  await type(page, '#match-form input[name="opponent"]', "블랙워그레이몬", "상대 덱 입력");
  await tap(page, '#match-form input[name="result"][value="win"]', "결과:승");
  await shot(page, "03-match-form");
  await say(page, "선공/후공, 대회 라운드, 활약 카드까지", "적어둔 만큼 통계로 돌아옵니다", 1600);
  await tap(page, '.primary-action[type="submit"][form="match-form"]', "전적 저장");
  await wait(550);
  await shot(page, "04-match-saved");
  await quiet(page, 200);

  /* 4. 대회 기록 */
  await tap(page, '[data-tab="tournaments"]', "탭:대회");
  await say(page, "스위스 + 토너먼트 컷", "라운드별 전적이 대회 카드 하나로", 1600);
  await scrollTo(page, 400, 1000);
  await shot(page, "05-tournaments");
  await scrollTo(page, 0, 600);
  await quiet(page, 200);

  /* 5. 덱 관리 + 카드 검색 + 카드 미리보기 */
  await tap(page, '[data-tab="decks"]', "탭:덱");
  await say(page, "덱은 <em>카드 DB</em>에서 바로", "번호 · 이름 · 효과 문구로 검색", 1300);
  await tap(page, '[data-action="edit-deck"]', "덱 수정");
  await type(page, "[data-deck-card-search]", "BT13-11", "카드 검색");
  await wait(750);
  await shot(page, "06-card-search");
  await quiet(page, 150);
  await tap(page, ".catalog-grid .catalog-image", "카드 미리보기");
  await wait(700);
  await say(page, "한글 정발 효과 그대로", "일러스트는 스와이프로 패럴렐까지", 1700);
  await shot(page, "07-card-preview");
  await quiet(page, 150);
  await page.keyboard.press("Escape");
  await wait(550);
  await say(page, "탭 한 번이면 덱에 추가", "50 + 5장 구성 제한도 실시간 체크", 1200);
  await tap(page, ".catalog-grid .catalog-info", "카드 추가");
  await wait(550);
  await shot(page, "08-card-added");
  await quiet(page, 150);
  await page.keyboard.press("Escape");
  await wait(550);

  /* 6. 통계 */
  await tap(page, '[data-tab="stats"]', "탭:통계");
  await say(page, "이 덱, 그 상대한테 진짜 약한가?", "덱별 · 상대별 매치업 승률 리포트", 1600);
  await scrollTo(page, 1100, 1150);
  await shot(page, "09-stats-matchup");
  await say(page, "선공/후공 승률, 카드별 활약도", "기간 필터로 메타 변화까지 추적", 1600);
  await scrollTo(page, 1900, 1150);
  await shot(page, "10-stats-more");
  await quiet(page, 150);

  /* 7. 오늘 전적 공유 */
  await scrollTo(page, 300, 950);
  await say(page, "오늘 전적은 <em>X에 바로</em>", "문장 자동 정리 + 사용 덱 이미지 저장", 1700);
  await shot(page, "11-share");
  await scrollTo(page, 0, 600);
  await quiet(page, 200);

  /* 8. 대회 일정 캘린더 */
  await tap(page, '[data-tab="events"]', "탭:대회일정");
  await say(page, "이번 주 대회, 어디서 열리지?", "지역별 공식 일정 + 나만 보는 개인 일정", 1800);
  await scrollTo(page, 320, 1000);
  await shot(page, "12-events");
  await quiet(page, 200);

  /* 9. 아웃트로 */
  await titleCard(
    page,
    `<img src="/icon.svg" alt="">
     <div class="big">전적<em>몬</em></div>
     <div class="gauge"><span class="fill"></span><span class="ticks"></span></div>
     <div class="meta"><span class="bl">BATTLE LOG</span><span class="wn">WIN 67%</span></div>`,
    3000
  );
  await shot(page, "13-outro");
  clearInterval(guard);
  await wait(400);
}

/* ------------------------------------------------------------------------ main */

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (KEEP_SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "dark",
    reducedMotion: "no-preference",
    recordVideo: { dir: OUT_DIR, size: VIDEO_SIZE },
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));

  const started = Date.now();
  let failure = null;
  try {
    await run(page);
  } catch (error) {
    failure = error;
  }

  const rawVideo = await page.video().path();
  await context.close(); // 영상 파일은 close 이후에 확정된다
  await browser.close();
  if (server) server.kill();

  const target = path.join(OUT_DIR, "전적몬-홍보.webm");
  if (fs.existsSync(target)) fs.rmSync(target);
  fs.renameSync(rawVideo, target);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const size = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`\n영상: ${target}`);
  console.log(`길이: 약 ${seconds}초 · 용량 ${size}MB · ${VIDEO_SIZE.width}x${VIDEO_SIZE.height}`);
  if (skipped.length) console.log(`건너뛴 구간(${skipped.length}): ${skipped.join(", ")}`);
  if (failure) {
    console.error("\n중간 실패:", failure.message);
    process.exitCode = 1;
  }
})();
