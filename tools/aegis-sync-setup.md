# Aegis → 전적몬 자동 전적 연동 (설정 가이드)

Aegis(aegis-digi.online) 매치가 끝나면 **승/패 + 상대 아키타입**이 전적몬에 자동 기록됩니다.

## 구성 요소
- `api/aegis-ingest.js` — Vercel 서버리스. 개인 토큰으로 사용자를 찾아 Supabase(`jeonjeokmon_user_data`)의 `data.matches`에 추가(중복은 Aegis 매치ID로 제거). 상대 덱 대표카드 → 아키타입(한글)은 `card-catalog.js`로 해석.
- `tools/aegis-jeonjeokmon.user.js` — Tampermonkey 유저스크립트. Aegis에서 본인 쿠키로 `/api/green/account/matches/export`를 폴링(60초), 새 매치마다 `/opponent-deck` 조회 후 인제스트로 전송.
- 전적몬 설정 > **Aegis 연동** 카드 — 로그인 후 연동 토큰 발급/복사.

## 최초 1회 설정 (사용자)
1. **배포** — 엔드포인트·설정 UI·유저스크립트를 올립니다(git push → Vercel).
2. **Vercel 환경변수 추가**: Vercel 프로젝트 → Settings → Environment Variables
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase 대시보드 → Project Settings → API → **service_role** 키 (⚠️ 비밀키, 절대 공개/커밋 금지)
   - (`SUPABASE_URL`은 이미 쓰고 있으면 재사용. 없으면 `https://facrfwefgnklmsxcyagu.supabase.co` 추가)
   - 저장 후 재배포(또는 자동 재배포).
3. **전적몬에서 토큰 발급**: 전적몬 → ⚙ 설정 → Google 로그인 → "Aegis 연동" 카드 → **연동 토큰 발급** → 토큰 복사.
4. **유저스크립트 설치**: 크롬에 **Tampermonkey** 설치 → 전적몬 설정 카드의 "연동 스크립트 설치" 링크(`/tools/aegis-jeonjeokmon.user.js`) → 설치 → 스크립트 상단 `TOKEN`에 복사한 토큰 붙여넣고 저장.
5. 끝. Aegis에 로그인한 채로 두면 매치가 자동 기록됩니다(우하단에 "전적몬: …" 상태 표시).

## 동작/제약
- **폴링 60초**(Aegis export 분당 3회 제한). 실시간은 아니고 수십 초 지연.
- **상대 아키타입**: 상대가 "매치 후 덱 공유"를 켠 경우에만 상대 덱을 받아 아키타입을 뽑습니다(아니면 상대 닉네임으로 기록, 메모에 닉 보존).
- **선/후공**은 Aegis 매치 기록에 없어 "불명"으로 들어갑니다.
- 내 덱: Aegis 덱 이름이 전적몬 덱 이름과 같으면 자동 연결, 다르면 메모에 덱 이름만 남깁니다.
- 토큰 재발급 시 기존 토큰은 무효 → 유저스크립트의 `TOKEN`도 새로 교체해야 합니다.

## 보안
- `SUPABASE_SERVICE_ROLE_KEY`는 서버리스(서버)에서만 사용, 클라이언트/저장소에 노출 안 함.
- 인제스트는 토큰이 가리키는 그 사용자 1명의 데이터에만 append. 레이트리밋 + 낙관적 잠금(updated_at)으로 본인 편집 덮어쓰기 방지.
