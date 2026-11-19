-- ============================================================
-- 조회 성능용 인덱스 추가 (데이터/동작은 바뀌지 않고 조회만 빨라진다)
--
-- 배경: PostgreSQL은 외래키 컬럼에 인덱스를 자동으로 만들지 않는다. 지금까지는
-- UNIQUE 제약이 만드는 인덱스(예: team_members(team_id, user_id))만 있어서,
-- "user_id로 내 소속 찾기", "head_user_id로 내가 부장/부문장인 곳 찾기",
-- "결재 목록을 기간 + 부서로 거르기" 같은 자주 쓰는 조회는 테이블 전체를 훑고 있었다.
-- RLS 정책(017_rls.sql)도 같은 컬럼들을 서브쿼리로 매 행마다 확인하므로 효과가 크다.
--
-- 모두 IF NOT EXISTS라서 여러 번 실행해도 안전하다.
-- ============================================================

-- 내 소속/권한 조회 (user_id가 UNIQUE 인덱스의 첫 컬럼이 아닌 테이블들)
create index if not exists team_members_user_id_idx
  on public.team_members (user_id);
create index if not exists department_memberships_user_id_idx
  on public.department_memberships (user_id);
create index if not exists department_approvers_user_id_idx
  on public.department_approvers (user_id);
create index if not exists division_approvers_user_id_idx
  on public.division_approvers (user_id);
create index if not exists team_approvers_user_id_idx
  on public.team_approvers (user_id);

-- 부문장/부장 여부 확인 (head_user_id = 내 id)
create index if not exists divisions_head_user_id_idx
  on public.divisions (head_user_id);
create index if not exists departments_head_user_id_idx
  on public.departments (head_user_id);

-- 조직 트리 내려가기 (팀 -> 부서)
create index if not exists teams_department_id_idx
  on public.teams (department_id);

-- 결재 목록: 기간(created_at) + 최신순 정렬, 그리고 요청자/결재자/조직별 필터
create index if not exists approval_requests_created_at_idx
  on public.approval_requests (created_at desc);
create index if not exists approval_requests_requester_id_idx
  on public.approval_requests (requester_id);
create index if not exists approval_requests_approver_id_idx
  on public.approval_requests (approver_id);
create index if not exists approval_requests_team_id_idx
  on public.approval_requests (team_id);
create index if not exists approval_requests_department_id_idx
  on public.approval_requests (department_id);
create index if not exists approval_requests_division_id_idx
  on public.approval_requests (division_id);
