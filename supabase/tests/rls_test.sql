-- 016_rls.sql · 019_org_rls.sql 정책 검증. 로컬 DB에서만 실행할 것.
-- 실패하면 EXCEPTION으로 즉시 멈춘다. 끝까지 가면 통과.
--
-- `supabase db reset` 직후의 빈 DB에서 돌려야 한다. 조회 범위를 절대 건수로
-- 확인하므로 다른 데이터가 남아 있으면 개수가 어긋나 실패한다
-- (트랜잭션은 롤백되지만, 기존 데이터를 지우지는 않는다).
\set ON_ERROR_STOP on
BEGIN;

-- ── 0. 테이블 권한 ────────────────────────────────────────
-- 정책과 권한은 별개의 관문이라 둘 다 있어야 한다. 권한이 없으면 정책이
-- 맞아도 permission denied가 나므로, 아래 정책 테스트보다 먼저 확인한다.
-- (017_grants.sql 이전에는 이 파일이 직접 GRANT를 주고 돌았다.)
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.work_logs', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated에 테이블 권한이 없다 (017_grants.sql 미적용)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL service_role에 테이블 권한이 없다 (017_grants.sql 미적용)';
  END IF;
  RAISE NOTICE 'ok  authenticated/service_role 테이블 권한';
END $$;


-- ── 픽스처 ────────────────────────────────────────────────
-- profiles.id에는 auth.users FK가 없으므로 임의 uuid를 쓴다.
\set alice  '''11111111-1111-1111-1111-111111111111'''
\set bob    '''22222222-2222-2222-2222-222222222222'''
\set carol  '''33333333-3333-3333-3333-333333333333'''
\set master '''44444444-4444-4444-4444-444444444444'''
\set teamA  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set teamB  '''bbbbbbbb-0000-0000-0000-000000000002'''

INSERT INTO public.profiles (id, email, name, is_master) VALUES
  (:alice,  'alice@t.co',  'alice',  false),
  (:bob,    'bob@t.co',    'bob',    false),
  (:carol,  'carol@t.co',  'carol',  false),
  (:master, 'master@t.co', 'master', true);

INSERT INTO public.teams (id, name, created_by) VALUES
  (:teamA, 'A팀', :alice),
  (:teamB, 'B팀', :carol);

INSERT INTO public.team_members (team_id, user_id, role) VALUES
  (:teamA, :alice, 'admin'),
  (:teamA, :bob,   'member'),
  (:teamB, :carol, 'admin');

INSERT INTO public.work_logs (user_id, date, start_time, end_time) VALUES
  (:alice, '2026-08-01', '09:00', '18:00'),
  (:bob,   '2026-08-01', '09:00', '18:00'),
  (:carol, '2026-08-01', '09:00', '18:00');

-- ── 헬퍼 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.login(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', p, 'role','authenticated')::text);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.check(label text, got int, want int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got <> want THEN RAISE EXCEPTION 'FAIL % : 기대 %건, 실제 %건', label, want, got; END IF;
  RAISE NOTICE 'ok  %', label;
END; $$;

-- ── 1. 조회 범위 ──────────────────────────────────────────
SELECT pg_temp.login(:alice);
SELECT pg_temp.check('alice가 보는 work_logs(본인+같은팀 bob)',
  (SELECT count(*)::int FROM public.work_logs), 2);
SELECT pg_temp.check('alice가 carol(다른팀) 기록을 못 봄',
  (SELECT count(*)::int FROM public.work_logs WHERE user_id = :carol), 0);
SELECT pg_temp.check('alice가 보는 team_members(A팀 2명만)',
  (SELECT count(*)::int FROM public.team_members), 2);
RESET ROLE;

SELECT pg_temp.login(:carol);
SELECT pg_temp.check('carol이 보는 work_logs(본인만)',
  (SELECT count(*)::int FROM public.work_logs), 1);
SELECT pg_temp.check('carol이 A팀 팀원 목록을 못 봄',
  (SELECT count(*)::int FROM public.team_members WHERE team_id = :teamA), 0);
RESET ROLE;

SELECT pg_temp.login(:master);
SELECT pg_temp.check('master가 전체 work_logs를 봄',
  (SELECT count(*)::int FROM public.work_logs), 3);
RESET ROLE;

-- ── 2. 쓰기 차단 ──────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  UPDATE public.work_logs SET memo = '변조' WHERE user_id = '22222222-2222-2222-2222-222222222222';
  IF FOUND THEN RAISE EXCEPTION 'FAIL alice가 bob의 근무기록을 수정했다'; END IF;
  RAISE NOTICE 'ok  alice가 bob의 근무기록을 수정 못 함';
  RESET ROLE;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  DELETE FROM public.work_logs WHERE user_id = '22222222-2222-2222-2222-222222222222';
  IF FOUND THEN RAISE EXCEPTION 'FAIL alice가 bob의 근무기록을 삭제했다'; END IF;
  RAISE NOTICE 'ok  alice가 bob의 근무기록을 삭제 못 함';
  RESET ROLE;
END $$;

DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.login('33333333-3333-3333-3333-333333333333');
  INSERT INTO public.work_logs (user_id, date, start_time, end_time)
    VALUES ('11111111-1111-1111-1111-111111111111', '2026-08-02', '09:00', '18:00');
  RAISE EXCEPTION 'FAIL carol이 alice 명의로 근무기록을 만들었다';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  carol이 남의 명의로 INSERT 못 함';
  RESET ROLE;
END $$;

-- ── 3. is_master 권한 상승 차단 (가드 트리거) ──────────────
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  UPDATE public.profiles SET is_master = true WHERE id = '11111111-1111-1111-1111-111111111111';
  RAISE EXCEPTION 'FAIL alice가 스스로 마스터가 됐다 (권한 상승)';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'ok  alice가 스스로 마스터가 되지 못함';
  RESET ROLE;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  UPDATE public.profiles SET name = 'alice2' WHERE id = '11111111-1111-1111-1111-111111111111';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL alice가 본인 이름을 못 바꾼다 (마이페이지 깨짐)'; END IF;
  RAISE NOTICE 'ok  alice가 본인 이름은 수정 가능';
  RESET ROLE;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.login('44444444-4444-4444-4444-444444444444');
  UPDATE public.profiles SET is_master = true WHERE id = '22222222-2222-2222-2222-222222222222';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL master가 마스터 지정을 못 한다 (회원관리 깨짐)'; END IF;
  RAISE NOTICE 'ok  master는 타인의 마스터 지정 가능';
  RESET ROLE;
END $$;

-- ── 3-2. 마스터도 남의 근무기록은 지우지 못한다 ──────────────
-- 강제 탈퇴는 서버(service_role)가 처리하므로 브라우저 롤에는 열어둘 이유가 없다.
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.login('44444444-4444-4444-4444-444444444444');
  DELETE FROM public.work_logs WHERE user_id = '11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL master가 남의 근무기록을 삭제했다 (%건)', n; END IF;
  RAISE NOTICE 'ok  master도 남의 근무기록은 삭제 불가';
  RESET ROLE;
END $$;

-- ── 4. 대체공휴일: 조회는 전체, 등록은 마스터만 ─────────────
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  INSERT INTO public.substitute_holidays (date, name) VALUES ('2026-09-01', '몰래');
  RAISE EXCEPTION 'FAIL 일반 사용자가 대체공휴일을 등록했다';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  일반 사용자는 대체공휴일 등록 불가';
  RESET ROLE;
END $$;


-- ── 5. 조직 구조 (019_org_rls.sql) ────────────────────────
--
-- 부문/부서를 붙이고, "같은 부서의 다른 팀"까지 조회가 열리는지와
-- 조직 테이블의 쓰기가 부서장 이상으로 막히는지를 본다.
--   부문 D1 ─ 부서 P1 ─ A팀(alice 팀장, bob)
--                    └ B팀(carol 팀장)
--   dave는 다른 부서(P2) 소속이라 보이면 안 된다.
\set div1 '''dddddddd-0000-0000-0000-000000000001'''
\set dep1 '''eeeeeeee-0000-0000-0000-000000000001'''
\set dep2 '''eeeeeeee-0000-0000-0000-000000000002'''
\set dave '''55555555-5555-5555-5555-555555555555'''
\set teamC '''cccccccc-0000-0000-0000-000000000003'''

INSERT INTO public.profiles (id, email, name, is_master) VALUES
  (:dave, 'dave@t.co', 'dave', false);

-- 3에서 bob을 마스터로 만들어 두었다. 여기서는 부서장 권한만 보고 싶으므로 되돌린다.
UPDATE public.profiles SET is_master = false WHERE id = :bob;

-- bob을 부서장으로 세운다 (부서장 이상 권한 검증용)
INSERT INTO public.divisions (id, name, head_user_id) VALUES (:div1, 'D1부문', NULL);
INSERT INTO public.departments (id, division_id, name, head_user_id) VALUES
  (:dep1, :div1, 'P1부서', :bob),
  (:dep2, :div1, 'P2부서', NULL);

UPDATE public.teams SET department_id = :dep1 WHERE id IN (:teamA, :teamB);

INSERT INTO public.teams (id, name, created_by, department_id) VALUES
  (:teamC, 'C팀', :dave, :dep2);
INSERT INTO public.team_members (team_id, user_id, role) VALUES (:teamC, :dave, 'admin');
INSERT INTO public.work_logs (user_id, date, start_time, end_time) VALUES
  (:dave, '2026-08-01', '09:00', '18:00');

-- 조회 범위가 팀에서 부서로 넓어졌는지
SELECT pg_temp.login(:alice);
SELECT pg_temp.check('alice가 같은 부서 carol의 기록을 봄',
  (SELECT count(*)::int FROM public.work_logs WHERE user_id = :carol), 1);
SELECT pg_temp.check('alice가 다른 부서 dave의 기록은 못 봄',
  (SELECT count(*)::int FROM public.work_logs WHERE user_id = :dave), 0);
SELECT pg_temp.check('alice가 보는 work_logs(본인+bob+carol)',
  (SELECT count(*)::int FROM public.work_logs), 3);
RESET ROLE;

-- 같은 부서면 다른 팀의 구성원 목록까지 본다 (부서 캘린더가 이름을 보여준다)
SELECT pg_temp.login(:alice);
SELECT pg_temp.check('alice가 같은 부서 B팀의 팀원 목록을 봄',
  (SELECT count(*)::int FROM public.team_members WHERE team_id = :teamB), 1);
SELECT pg_temp.check('alice가 다른 부서 C팀의 팀원 목록은 못 봄',
  (SELECT count(*)::int FROM public.team_members WHERE team_id = :teamC), 0);
RESET ROLE;

-- 부서장은 산하 인원을 본다
SELECT pg_temp.login(:bob);
SELECT pg_temp.check('부서장 bob이 보는 work_logs(P1부서 3명)',
  (SELECT count(*)::int FROM public.work_logs), 3);
RESET ROLE;

-- 권한 상승 차단: 아무나 총괄 관리자가 될 수 없다
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  INSERT INTO public.general_admins (user_id) VALUES ('11111111-1111-1111-1111-111111111111');
  RAISE EXCEPTION 'FAIL 일반 사용자가 스스로 총괄 관리자가 됐다';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  일반 사용자는 총괄 관리자가 되지 못함';
  RESET ROLE;
END $$;

-- 결재권자 위임은 부서장 이상만
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  INSERT INTO public.department_approvers (department_id, user_id)
    VALUES ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
  RAISE EXCEPTION 'FAIL 일반 사용자가 스스로 결재권자가 됐다';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  일반 사용자는 결재권자 위임 불가';
  RESET ROLE;
END $$;

DO $$
BEGIN
  PERFORM pg_temp.login('22222222-2222-2222-2222-222222222222');
  INSERT INTO public.department_approvers (department_id, user_id)
    VALUES ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
  RAISE NOTICE 'ok  부서장은 결재권자 위임 가능';
  RESET ROLE;
END $$;

-- 부문/부서 생성은 부문장 이상만
DO $$
BEGIN
  PERFORM pg_temp.login('11111111-1111-1111-1111-111111111111');
  INSERT INTO public.divisions (name) VALUES ('몰래 만든 부문');
  RAISE EXCEPTION 'FAIL 일반 사용자가 부문을 만들었다';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok  일반 사용자는 부문 생성 불가';
  RESET ROLE;
END $$;

-- 016에는 없던 teams UPDATE — 부서장이 팀을 옮길 수 있어야 한다
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.login('22222222-2222-2222-2222-222222222222');
  UPDATE public.teams SET display_order = 5 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 부서장이 팀을 수정하지 못했다'; END IF;
  RAISE NOTICE 'ok  부서장은 산하 팀을 수정 가능';
  RESET ROLE;
END $$;

DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.login('55555555-5555-5555-5555-555555555555');
  UPDATE public.teams SET display_order = 9 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE EXCEPTION 'FAIL 관할 밖 사용자가 남의 팀을 수정했다 (%건)', n; END IF;
  RAISE NOTICE 'ok  관할 밖 사용자는 남의 팀 수정 불가';
  RESET ROLE;
END $$;

ROLLBACK;
