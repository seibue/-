# 전적몬

라이브: <https://jeonjeokmon.vercel.app/>

디지몬 카드게임 전적·덱·대회를 기록하는 한국어 PWA 웹앱입니다. (초기 UI는 어두운 모바일 앱형 디자인을 참고해 제작)

## 필수 조건

- 브라우저만 있으면 앱 실행 가능 (`index.html` 직접 열기 또는 배포 URL)
- `tools/` 스크립트 실행 시 **Node.js 18 이상** 필요

## 기능

- `index.html`을 브라우저에서 열면 바로 실행됩니다.
- 전적, 덱, 덱 구축 카드, 설정 데이터는 브라우저 `localStorage`에 먼저 저장되고, Google 로그인 시 Supabase에도 동기화됩니다.
- 덱 관리에서 카드 넘버, Lv, 카드 이름, 카드 종류, 매수를 입력해 덱을 구축할 수 있습니다.
- 같은 카드 넘버는 최대 4장까지 저장되며, 전적 기록에서 활약 카드를 체크하면 카드별 승률이 계산됩니다.
- 덱은 일반 덱 50장과 디지타마 5장, 총 55장까지 구성할 수 있습니다.
- 설정 탭에서 내 데이터 백업 파일 저장/불러오기를 사용할 수 있습니다.

## 운영 메모

### 카드 데이터 갱신

신규 카드가 나오거나 정발 효과가 추가되면 PC 작업 폴더에서 아래 명령을 실행합니다.

```powershell
node tools/update-card-data.js
node tools/bump-cache-version.js 20260520-card-data
```

첫 명령은 `card-catalog.js`와 `korean-card-effects.js`를 다시 만들고, 두 번째 명령은 브라우저/PWA 캐시가 새 파일을 받도록 버전을 올립니다.

갱신 후 GitHub/Vercel에 보통 함께 올릴 파일:

- `index.html`
- `app.js`
- `styles.css`
- `card-catalog.js`
- `korean-card-effects.js`
- `sw.js`
- `tools/`

### 캐시 버전 규칙

배포할 때 화면이나 데이터 파일이 바뀌었다면 항상 다음 명령으로 버전을 바꿉니다.

```powershell
node tools/bump-cache-version.js YYYYMMDD-short-note
```

예: `node tools/bump-cache-version.js 20260520-mobile-deck`
