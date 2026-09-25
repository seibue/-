-- 초! 테이머 배틀 in 서울 대회 일정 등록
-- 출처: https://digimoncard.co.kr/event/52459
-- id는 앱의 일정 추가 기능과 동일하게 DB 기본값을 사용합니다.
-- 같은 대회명의 기존 일정을 지운 뒤 다시 넣습니다.

begin;

delete from public.tournament_events
where title = '초! 테이머 배틀 in 서울';

insert into public.tournament_events
  (title, starts_at, ends_at, location, description, updated_at)
values
  ('초! 테이머 배틀 in 서울', '2026-10-03T10:00:00+09:00', '2026-10-03T18:00:00+09:00', '서울 · 백범김구기념관', '3on3 팀전(스위스+토너먼트) · 월드챔피언십 26-27 KOREA FINAL 진출권 · 참가비 무료 · 부대행사 얼티미트컵(1on1)', now());

commit;
