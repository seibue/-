# 전적몬 — CLAUDE.md

프로젝트를 이어받는 Claude(또는 다른 AI)가 매번 코드 전체를 다시 읽지 않도록 작성한 인수인계 문서입니다.

---

## 프로젝트 개요

**전적몬**은 디지몬 카드게임 전적·덱·대회를 기록하는 한국어 PWA 웹앱입니다.

- 라이브 URL: <https://jeonjeokmon.vercel.app/>
- 호스팅: Vercel (GitHub 연결 예정 — 현재는 수동 배포)
- 저장소: <https://github.com/seibue/DegiLog>

---

## 파일 구조

```
DegiLog/
├── index.html               # 진입점. <div id="app"> + js/* 와 app.js 를 defer 로드
├── app.js                   # 앱 코어 (~5,400줄, IIFE 단일 파일) — 상태/렌더/이벤트/데이터레이어
├── styles.css               # 전체 스타일 (다크 테마, CSS 변수 기반)
├── sw.js                    # 서비스워커 (PWA 캐시) — CORE_ASSETS 에 js/* 전부 포함
├── manifest.webmanifest     # PWA 메타
├── icon.svg                 # 앱 아이콘
├── card-catalog.js          # 카드 목록 데이터 (빌드 생성)
├── korean-card-effects.js   # 한글 카드 효과 데이터 (빌드 생성)
├── deck-recipe-template.js  # 덱 레시피 Word 출력 라이브러리
├── preview-server.cjs       # 로컬 개발용 프리뷰 서버 (포트 8787)
├── package.json             # node:test 기반 테스트 스크립트 (의존성 0)
├── js/                      # app.js 에서 분리한 도메인 모듈 (빌드 없음, window.JJM.* 노출)
│   ├── format.js            # 순수 포매팅/결과 헬퍼 (uid, escapeHTML, 승률 등)
│   ├── docx-export.js       # 덱 레시피 인쇄/DOCX 생성 (createDeckRecipeExport)
│   ├── share-image.js       # 공유 이미지 캔버스 렌더/PNG 저장 (createShareImage)
│   ├── card-effects.js      # 카드 효과 번역/조회/캐시 (createCardEffects)
│   ├── diagnostics.js       # 진단 기록/표시/저장 (createDiagnostics) — 가장 먼저 생성
│   ├── deck-import.js        # 덱 텍스트/JSON 가져오기 파서 (createDeckImport)
│   ├── stats.js             # 통계/매치업 계산 (createStats)
│   ├── deck.js              # 덱 편집(draft) 로직 (createDeck)
│   ├── cloud.js             # Supabase 클라우드 동기화 (createCloud)
│   ├── calendar.js          # 대회일정 캘린더 (월간격자·구글캘린더·.ics)
│   ├── views-stats.js       # 통계 탭 뷰(렌더) 함수군 (createStatsViews) — views 분리 1호
│   ├── views-settings.js    # 설정 탭 뷰(렌더) 함수군 (createSettingsViews) — views 분리 2호
│   ├── views-tournaments.js # 대회 탭 뷰(렌더) 함수군 (createTournamentViews) — views 분리 3호
│   ├── views-matches.js     # 전적 탭 뷰(렌더) 함수군 (createMatchesViews) — views 분리 4호
│   ├── views-home.js        # 홈 대시보드 뷰(렌더) 함수군 (createHomeViews) — views 분리 5호 (카드검색은 app.js 잔류)
│   └── views-decks.js       # 덱 탭 목록 뷰(렌더) 함수군 (createDeckViews) — views 분리 6호 (빌더 모달은 app.js 잔류)
├── tests/                   # node --test 단위 테스트 (모듈별, npm test 로 실행)
│   └── *.test.js
├── api/
│   ├── korean-card.js       # Vercel 서버리스: 한국 공식 카드 크롤링
│   └── card-image.js        # Vercel 서버리스: 카드 이미지 프록시
└── tools/
    ├── refresh-card-data.js      # update + bump을 한 번에 실행
    ├── update-card-data.js       # card-catalog.js, korean-card-effects.js 재생성
    ├── build-card-catalog-cache.js
    ├── build-korean-card-effects-cache.js
    └── bump-cache-version.js     # 캐시 버전 문자열 일괄 갱신 (js/* 포함)
```

---

## 핵심 규칙

### 1. UI 문구는 한국어만
모든 버튼 레이블, 플레이스홀더, 토스트, 에러 메시지는 **한국어**로 작성합니다.

### 2. 캐시 버전 관리 (가장 중요)
`app.js`, `styles.css`, `index.html`, `sw.js`를 수정하면 **반드시** 캐시 버전을 함께 올려야 합니다.  
버전 문자열 형식: `YYYYMMDD-short-note` (예: `20260526-tournament-ux-1`)

버전이 연동된 위치:
- `index.html` — `?v=` 쿼리스트링 (styles.css, **js/*.js**, card-catalog.js, korean-card-effects.js, app.js, manifest)
- `app.js` — `const APP_VERSION = "..."` + `sw.js?v=...`
- `sw.js` — `const CACHE_NAME = "jeonjeokmon-shell-..."`

**자동 갱신 명령:**
```powershell
node tools/bump-cache-version.js 20260527-my-feature
```
> `js/` 에 **새 모듈 파일을 추가하면** ① `index.html`에 `<script defer>` 태그(app.js 앞), ② `sw.js`의 `CORE_ASSETS`, ③ `tools/bump-cache-version.js`의 치환 규칙 세 곳에 직접 등록해야 합니다.

### 3. 수정 후 문법 체크 + 테스트 필수
```powershell
node --check app.js
node --check sw.js
npm test          # node:test 기반(의존성 0) — 순수 로직/모듈 회귀 검증
npm run test:e2e  # Playwright(devDependency) — 실제 브라우저 스모크(앱로드·탭·검색·스테퍼·통계·버전)
```
> e2e 최초 1회: `npm install` 후 `npm run test:e2e:install`(chromium 다운로드).
> `tests/e2e/*.spec.js`는 `@playwright/test` 기반이라 `node --test`에는 안 잡힙니다.
> e2e는 `preview-server.cjs`(8787)를 자동 기동하며, desktop·mobile 2개 프로젝트로 돕니다.
> 모바일 전용 검증(썸네일 +/-)은 desktop 프로젝트에서 자동 skip.

### 4. 기존 기능 삭제·구조 변경 전 설명 먼저
큰 변경은 작업 전에 무엇을 바꾸는지 설명하고 확인을 받습니다.

---

## 모듈 구조 (js/ + app.js)

원래 `app.js` 단일 파일(~7,500줄)이었으나, **빌드 단계 없이** 도메인별 모듈로 분리했습니다.
- 각 모듈은 IIFE로 `window.JJM.<name>` 에 노출되고, **`app.js`보다 먼저 `<script defer>`로 로드**됩니다.
- Node에서는 `module.exports`로도 노출되어 `tests/`에서 `require`로 단위 테스트합니다 (브라우저/Node 겸용 UMD 패턴).

### 의존성 주입(DI) 패턴 — 가장 중요
`data`/`state`/DOM 에 의존하는 모듈은 **순수 함수가 아니므로** `createXxx(deps)` 팩토리로 만들고, `app.js`가 의존성을 주입합니다.
```js
const { addDraftCard, deckReadiness } = window.JJM.deck.createDeck({ state, getData: () => data, ... });
```
- **`data`는 재할당되는 변수**(`loadData`, `setDataFromCloud` 등) → 반드시 `getData: () => data` 게터로 주입. 절대 `data`를 직접 넘기지 말 것(스냅샷이 됨).
- **`state`는 재할당되지 않음**(프로퍼티만 변경) → 참조로 직접 주입 OK.
- 순수 함수(예: `format.js`, `normalizeEffectText`)는 모듈 레벨에 두고 직접 노출 → 그대로 테스트 가능.

### 팩토리 생성 순서 (app.js 상단)
`diagnostics → share-image → card-effects → deck-import → stats → deck → cloud` 순으로 `state` 정의 직후 생성합니다.
- `recordDiagnostic`(diagnostics)이 다른 모듈에 주입되므로 **diagnostics를 가장 먼저** 생성.
- `cloud`는 `cloudClient`(let)·`cloudStatusText`·`syncTone`을 app.js에 남겨 **diagnostics와의 순환 의존을 차단**하고, `getCloudClient/setCloudClient`·`setData`로 연결.
- 공용 유틸(`deckCards`/`deckCountSummary`/`deckLimitViolation`/`sortDeckCards` 등)은 여러 모듈에 주입되므로 **app.js에 잔류**.

### 모듈별 노출 API
| 모듈 | 노출 | app.js가 쓰는 주요 함수 |
|------|------|------|
| `format` | 함수 직접 | uid, escapeHTML, formatDate, resultLabel, normalizeGameStats, finalizeRecordStats … |
| `docx-export` | `createDeckRecipeExport` | printDeckRecipe, downloadDeckRecipeDocx |
| `share-image` | `createShareImage` | downloadDeckImage, downloadDailyShareImage, openDailyShareX |
| `card-effects` | `createCardEffects` + 순수 2종 | staticKoreanOfficialEffect, fetchAndCacheCardEffect |
| `diagnostics` | `createDiagnostics` + safeDiagnosticDetail | recordDiagnostic, diagnosticStatusInfo, downloadDiagnostics, clearDiagnostics |
| `deck-import` | `createDeckImport` + apiCardType | parseDeckImportSource, enrichImportedDecks, normalizeImportedDeck |
| `stats` | `createStats` | statsFromMatches, statsForDeck, deckMatchupRows, tournamentStageSummary … (13종) |
| `deck` | `createDeck` | addDraftCard, changeDraftCardCount, deckReadiness, cloneDeck … (9종) |
| `cloud` | `createCloud` | initializeCloudAuth, saveCloudData, scheduleCloudSave, loginWithGoogle … |

> ⚠️ 분리는 "함수 이동 + 동작 보존"이 원칙입니다. 로직 변경은 별도 커밋으로. 모듈 옮길 때 `node --check` + `npm test`로 회귀 확인 필수.

---

## 앱 구조 (app.js)

단일 IIFE(`(function() { ... })()`) 안에 코어 로직(상태, 렌더, 이벤트, 데이터 레이어, 공용 유틸)이 있고, 도메인 로직은 `js/` 모듈에서 주입받습니다.

### 상태 관리
- `data` — localStorage에서 불러온 영구 데이터 (decks, matches, tournaments, settings)
- `state` — 화면 상태 (현재 탭, 열린 모달, 필터 값 등)

### 주요 상수
| 상수 | 설명 |
|------|------|
| `STORAGE_KEY` | localStorage 키 |
| `APP_VERSION` | 캐시 버전 문자열 |
| `DECK_LIMITS` | 덱 구성 제한 (총 55장: 메인 50 + 디지타마 5) |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | 클라우드 동기화 설정 |
| `ADMIN_EMAILS` | 관리자 이메일 (`seibue63@gmail.com`) |

### 탭 구성
```
home        홈          최근 전적 요약, 덱별 승률 카드, 덱 이미지 공유
matches     전적 기록   매치 CRUD, 필터, 일괄 삭제, undo
tournaments 대회 기록   토너먼트 CRUD, 스위스+토너먼트 라운드 관리
decks       덱 관리     덱 CRUD, 카드 브라우저(72개), 고급 검색, 레시피 Word 출력
stats       통계        덱별/상대덱별 매치업 승률, 카드별 활약도
settings    설정        Supabase 동기화, PWA 설치, 백업/복원, 카드 데이터 갱신
```

### 렌더링 패턴
이벤트 위임 기반 단방향 흐름입니다.
1. 상태(`state`, `data`) 변경
2. `render()` 호출 → `root.innerHTML = ...` 전체 재렌더링
3. 이벤트는 `document.addEventListener`로 위임 (`data-action`, `data-tab` 속성 기반)

주요 render 함수:
- `render()` — 최상위 진입점
- `renderCurrentTab()` — 현재 탭에 맞는 뷰 호출
- `renderMatchCard()`, `renderTournamentCard()`, `renderDeckCard()` — 카드 단위
- `renderModal()` — 모달 분기

주요 handle 함수:
- `handleAction(action, target)` — 모든 버튼 액션 중앙 처리
- `handleMatchSubmit()`, `handleTournamentSubmit()`, `handleDeckSubmit()`

---

## 데이터 구조

### match 객체
```js
{
  id, deckId, date, matchType, opponent, result,      // 필수
  playOrder,                                           // "first" | "second" | "unknown"
  tournamentId, roundStage, roundLabel,               // 대회 소속일 때
  memo, cardIds, cardNames, cardNumbers,              // 활약 카드
  createdAt, updatedAt
}
```

### tournament 객체
```js
{
  id, name, date, format, location, memo,
  // format: "mixed" | "swiss" | "top"
  createdAt, updatedAt
}
```

### deck 객체
```js
{
  id, name, colors, note,
  cards: [{ id, cardNumber, level, name, type, count }],
  createdAt, updatedAt
}
```

---

## 카드 데이터 갱신

신규 카드·정발 효과 추가 시:
```powershell
node tools/refresh-card-data.js
# 또는 버전 지정:
node tools/refresh-card-data.js --version=20260527-card-data
```

GitHub에 올릴 파일: `index.html`, `app.js`, `js/`, `styles.css`, `card-catalog.js`, `korean-card-effects.js`, `sw.js`, `tools/`, `tests/`, `package.json`

### 데이터 소스 (중요)
- **카탈로그**(`card-catalog.js`) ← **일본 공식 `digimoncard.com/cards`**(HTML 크롤). 번호·색·형태(레벨)·종류·레어도 추출. **dgchub 의존 제거됨.**
  - 한글 이름은 `korean-card-effects.js`에서 번호로 매칭해 채우고, **미발매(일본 선행) 카드는 일본어 이름**으로 남음(한국 정발 후 효과 재크롤 시 자동 한글화).
  - `img`는 빈 값으로 두어 런타임에 **일본 공식 `digimoncard.com/images/cardlist/card/{번호}.png`** 를 쓰게 함(`remoteCardImageUrls`). 패럴렐(다른 일러)은 `_P1.._Pn`. 카드 이미지 소스는 일본 공식으로 통일됨(images.digimoncard.io 의존 제거).
  - 빌드 순서 의존: **효과 → 카탈로그**(카탈로그가 한글 이름을 효과 파일에서 읽음). `update-card-data.js`가 이 순서로 실행.
  - 안전장치: 파싱 카드 수가 4000 미만이면 빌더가 **중단**(빈/반토막 카탈로그 덮어쓰기 방지).
- **정발 효과**(`korean-card-effects.js`) ← **한국 공식 `digimoncard.co.kr/cardlist`**(HTML 크롤). 효과 없는 정발 카드도 이름 보존 위해 포함.

---

## 배포 흐름

현재는 Vercel CLI 또는 Vercel 대시보드에서 수동 배포합니다.  
GitHub 연결 후에는 `main` 브랜치 push → Vercel 자동 배포로 전환 예정.

**api/ 폴더는 반드시 GitHub에 포함해야 합니다.**  
`api/card-image.js`(카드 이미지 프록시)와 `api/korean-card.js`(한글 효과 크롤링)가 Vercel 서버리스 함수로 동작합니다.

---

## 작업 우선순위 (2026-06-06 기준)

> ⚠️ 새 작업 제안 전, **반드시 실제 코드로 구현 여부를 확인**할 것. 아래 목록만 믿지 말 것.

- [x] GitHub 저장소 초기화 및 연결
- [x] CLAUDE.md 작성
- [x] 전적 기록 — 대회 라운드 뱃지 — `roundText()`로 구현됨
- [x] 홈 — 최근 N게임 트렌드 — `homeTrendRows()` ("최근 N전 N승")
- [~] 통계 — 선공/후공 승률 — **부분**: 매치업 리포트 내 선공/후공 분리는 있음(`matchupBreakdownRows(…, "playOrder")`). 통계 상단의 *독립 선후공 카드*는 미구현.
- [ ] 설정 — 카드 데이터 최종 갱신일 표시 — 미구현(유일하게 남은 항목)

## 이미 구현된 것 (제안 전 확인)

- 덱 카드 수량 +/- 버튼 — `renderDeckListRow()`/`renderDeckThumb()` 스테퍼 (모바일 4모서리 배치)
- 덱 목록 카드 정렬(레벨/번호/종류순) — 빌더 tray, `state.deckTraySort`/`sortDeckCardsBy()`
- 덱 코드 복사/가져오기 — `copy-deck-code`(digimonmeta 배열), 가져오기(텍스트·JSON·digimonmeta·파일, 에라타/변형번호 처리)
- 덱 버전 스냅샷 + 버전별 승률 — `save-deck-version`, `deck.versions`, `deckVersionRecords()`
- 대회 라운드 전적 인라인 수정 — `renderTournamentCard()` 행별 ✎
- **대회일정 캘린더** — `events` 탭, `js/calendar.js`(월간격자·구글캘린더링크·.ics+알람), 관리자 공식 일정 CRUD(Supabase `tournament_events`), 지역 필터칩
- **개인 일정(본인만 보임)** — 누구나 '내 일정' 추가(`add-personal-event`). `data.personalEvents`(per-user 블록, RLS·기기간 동기화, 로그아웃 시 localStorage)에 저장 → `allCalendarEvents()`가 공식+개인 합쳐 표시. 개인 일정은 금색 칩·'내 일정' 배지, 소유자만 편집/삭제. `normalizePersonalEvents`(store.js), `savePersonalEvent`/`deletePersonalEventById`(app.js), `state.eventModalKind`("personal"/"official")
- 통계 기간 필터 + 메타 대시보드(테스트 플레이 제외) — `statsScopedMatches()`, `opponentMetaRows()`
- 카드 미리보기 일러스트 갤러리 — `renderCardPreview()` 메인 이미지 좌우 스와이프(터치)/화살표/카운터(`previewActiveImage`, touchstart·touchend). 썸네일 스트립은 제거(스와이프로 대체), 이미지 높이 `min(52vh,420px)`로 제한. 기본 일러 + 일본 공식(digimoncard.com) 패럴렐 `_P1.._Pn` 을 런타임 탐색(`loadCardParallelImages`/`probeImageLoad`, `previewParallelCache`). 카드 이미지 전부 일본 공식 통일. 덱 구성·검색은 번호당 1장 유지
- 대회일정 날짜 선택 시 일정 패널로 스크롤(`#calendar-day-panel` scrollIntoView) — 모바일에서 패널이 하단 네비에 가려 안 보이던 문제 해결
- 덱 카드별 일러 선택 — 덱 수정 중 미리보기에서 스와이프로 패럴렐을 고르고, 저장본과 다른 일러일 때만 뜨는 "이 일러로 덱에 저장" 버튼으로 저장(`save-deck-card-art`, 덱 카드 `art` 필드 `""`/`_Pn`, `imageIndexToArt`/`imageIndexFromArt`). `deckCardImageSource`/`shareCardImageSources`가 `art` 반영 → 썸네일·공유 이미지·버전 스냅샷에 적용. `normalizeCards`(store.js)가 `art` 보존
- 상단 ⚙ 설정 아이콘(설정 탭은 하단 네비에서 제거됨), X 문의 카드, PWA 설치 브라우저별 안내
- 보안: Supabase RLS(`jeonjeokmon_user_data`·`tournament_events`), `vercel.json` 보안 헤더, LICENSE

---

## 알려진 주의 사항

- `api/` 폴더가 git에서 누락되면 카드 이미지 프록시(`/api/card-image`)가 깨집니다.
- `deck-recipe-template.js`는 버전 쿼리가 `20260516-docx`로 고정되어 있습니다 (내용 변경 시만 갱신).
- Supabase publishable key는 공개 키이므로 커밋해도 무방합니다.
- `js/` 모듈은 **`app.js`보다 먼저 로드**되어야 합니다(`window.JJM.*` 의존). `index.html`의 `<script>` 순서를 깨지 말 것.
- 모듈에 `data`를 직접 주입하면 재할당 시 stale 스냅샷이 됩니다 — 반드시 `getData: () => data` 게터 사용.
- node 테스트는 브라우저 API(canvas/네트워크/OAuth)를 못 잡습니다. 캔버스·OAuth는 여전히 수동/실기기 확인 필요하지만, **UI 흐름은 `npm run test:e2e`(Playwright)로 자동 검증**됩니다. 로컬 점검은 `node preview-server.cjs` (포트 8787).
- `node_modules/`, `test-results/`, `playwright-report/`는 .gitignore 처리 (배포 불필요). Vercel 배포에는 영향 없음.

---

## 향후 분리 후보 (트랙 B 잔여, 고위험)

`store`(데이터 레이어: loadData/saveData/normalize*/recovery/undo), views(렌더 함수군), controller(`handleAction` + 이벤트 리스너)는 `data`/`state` 컨테이너 전면 도입이 필요한 최고난도 영역입니다. 별도 세션에서 신중히 진행 권장(`render`↔`handleAction` 상호 호출 + 528곳의 data/state 참조).
