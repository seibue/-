# 전적몬 — CLAUDE.md

프로젝트를 이어받는 Claude(또는 다른 AI)가 매번 코드 전체를 다시 읽지 않도록 작성한 인수인계 문서입니다.

---

## 프로젝트 개요

**전적몬**은 디지몬 카드게임 전적·덱·대회를 기록하는 한국어 PWA 웹앱입니다.

- 라이브 URL: <https://digi-log.vercel.app/>
- 호스팅: Vercel (GitHub 연결 예정 — 현재는 수동 배포)
- 저장소: <https://github.com/seibue/DegiLog>

---

## 파일 구조

```
DegiLog/
├── index.html               # 진입점. <div id="app"> 하나만 있음
├── app.js                   # 앱 전체 로직 (~7,500줄, IIFE 단일 파일)
├── styles.css               # 전체 스타일 (다크 테마, CSS 변수 기반)
├── sw.js                    # 서비스워커 (PWA 캐시)
├── manifest.webmanifest     # PWA 메타
├── icon.svg                 # 앱 아이콘
├── card-catalog.js          # 카드 목록 데이터 (빌드 생성)
├── korean-card-effects.js   # 한글 카드 효과 데이터 (빌드 생성)
├── deck-recipe-template.js  # 덱 레시피 Word 출력 라이브러리
├── preview-server.cjs       # 로컬 개발용 프리뷰 서버
├── api/
│   ├── korean-card.js       # Vercel 서버리스: 한국 공식 카드 크롤링
│   └── card-image.js        # Vercel 서버리스: 카드 이미지 프록시
└── tools/
    ├── refresh-card-data.js      # update + bump을 한 번에 실행
    ├── update-card-data.js       # card-catalog.js, korean-card-effects.js 재생성
    ├── build-card-catalog-cache.js
    ├── build-korean-card-effects-cache.js
    └── bump-cache-version.js     # 캐시 버전 문자열 일괄 갱신
```

---

## 핵심 규칙

### 1. UI 문구는 한국어만
모든 버튼 레이블, 플레이스홀더, 토스트, 에러 메시지는 **한국어**로 작성합니다.

### 2. 캐시 버전 관리 (가장 중요)
`app.js`, `styles.css`, `index.html`, `sw.js`를 수정하면 **반드시** 캐시 버전을 함께 올려야 합니다.  
버전 문자열 형식: `YYYYMMDD-short-note` (예: `20260526-tournament-ux-1`)

버전이 연동된 위치:
- `index.html` — `?v=` 쿼리스트링 (styles.css, card-catalog.js, korean-card-effects.js, app.js, manifest)
- `app.js` — `const APP_VERSION = "..."` + `sw.js?v=...`
- `sw.js` — `const CACHE_NAME = "jeonjeokmon-shell-..."`

**자동 갱신 명령:**
```powershell
node tools/bump-cache-version.js 20260527-my-feature
```

### 3. 수정 후 문법 체크 필수
```powershell
node --check app.js
node --check sw.js
```

### 4. 기존 기능 삭제·구조 변경 전 설명 먼저
큰 변경은 작업 전에 무엇을 바꾸는지 설명하고 확인을 받습니다.

---

## 앱 구조 (app.js)

단일 IIFE(`(function() { ... })()`) 안에 모든 로직이 있습니다.

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

GitHub에 올릴 파일: `index.html`, `app.js`, `styles.css`, `card-catalog.js`, `korean-card-effects.js`, `sw.js`, `tools/`

---

## 배포 흐름

현재는 Vercel CLI 또는 Vercel 대시보드에서 수동 배포합니다.  
GitHub 연결 후에는 `main` 브랜치 push → Vercel 자동 배포로 전환 예정.

**api/ 폴더는 반드시 GitHub에 포함해야 합니다.**  
`api/card-image.js`(카드 이미지 프록시)와 `api/korean-card.js`(한글 효과 크롤링)가 Vercel 서버리스 함수로 동작합니다.

---

## 작업 우선순위 (2026-05-27 기준)

- [x] GitHub 저장소 초기화 및 연결
- [x] CLAUDE.md 작성
- [ ] 전적 기록 — 대회 라운드 뱃지 (`[스위스 R2]`, `[토너먼트 4강]`)
- [ ] 홈 — 최근 N게임 트렌드 표시 ("최근 10전 7승")
- [ ] 통계 — 선공/후공 승률 분리
- [ ] 설정 — 카드 데이터 최종 갱신일 표시

## 이미 구현된 것 (제안 전 확인)

- 덱 카드 수량 +/- 버튼 — `renderDeckListRow()`의 `deck-count-stepper` 완전 구현됨

---

## 알려진 주의 사항

- `api/` 폴더가 git에서 누락되면 카드 이미지 프록시(`/api/card-image`)가 깨집니다.
- `deck-recipe-template.js`는 버전 쿼리가 `20260516-docx`로 고정되어 있습니다 (내용 변경 시만 갱신).
- Supabase publishable key는 공개 키이므로 커밋해도 무방합니다.
