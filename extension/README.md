# Aegis → 전적몬 자동 전적 (크롬 확장프로그램)

Tampermonkey 없이 **"Chrome에 추가" 한 번**으로 Aegis 매치를 전적몬에 자동 기록하는 확장프로그램.
유저스크립트(`tools/aegis-jeonjeokmon.user.js`)와 동일한 로직이지만, 확장 격리환경이라 **Aegis CSP·개발자모드·"사용자 스크립트 허용" 토글이 전부 불필요**하다.

## 파일
- `manifest.json` — MV3 매니페스트
- `content.js` — aegis-digi.online 에서 도는 콘텐트 스크립트(매치 조회→인제스트 전송, prefix 자동감지)
- `popup.html` / `popup.js` — 연동 토큰 입력(`chrome.storage.sync`)
- `icons/` — 아이콘 16/48/128 (플레이스홀더, 교체 가능)

## 지금 바로 테스트 (스토어 없이, 무료)
1. 크롬 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **"압축해제된 확장 프로그램을 로드합니다"** 클릭 → 이 `extension/` 폴더 선택
4. 툴바의 확장 아이콘 클릭 → **전적몬에서 토큰 받기**(로그인→Aegis 연동→토큰 발급·복사) → 토큰 붙여넣고 **저장**
5. Aegis(aegis-digi.online) 로그인한 채로 두면 끝. 우하단에 "전적몬: …" 배지가 뜨고 매치가 자동 기록됨.

> 로드언팩은 크롬을 재시작해도 유지된다(개발자 모드가 켜져 있는 한). "사용자 스크립트 허용" 같은 토글은 필요 없다.

## 공개 배포 (Chrome 웹스토어) — 카드 생기면
1. https://chrome.google.com/webstore/devconsole 에서 **개발자 등록**(최초 $5, 1회)
2. `extension/` 폴더를 zip으로 압축 (manifest.json이 zip 루트에 오게)
3. 콘솔에서 **새 항목** → zip 업로드 → 설명/스크린샷/아이콘 입력 → 제출(심사 수일)
4. 공개되면 고유 확장 ID가 생김 → 그때 전적몬에서 "클릭 한 번 연결"(externally_connectable + chrome.runtime.sendMessage)도 붙일 수 있음(현재는 토큰 붙여넣기 방식).

## 참고
- 인제스트 엔드포인트(`/api/aegis-ingest`)는 유저스크립트와 공용. CORS로 `aegis-digi.online` 허용돼 있어 콘텐트 스크립트에서 바로 POST 가능.
- 로직 수정 시 유저스크립트 템플릿(`api/_aegis-userscript-template.js`)과 `content.js` 를 같이 맞출 것.
- 아이콘은 단색 플레이스홀더다. 정식 배포 전 브랜드 아이콘(icon.svg 기반 PNG)으로 교체 권장.
