-- ============================================================
-- 부문/팀 단위 결재권자 위임 확장
--
-- 배경: 011_department_approvers.sql은 부서 단위 위임만 지원했다.
-- 조직 계층이 "부문장 > 부서장 > 팀장 > 팀원"으로 갖춰지면서 다음이 필요해졌다:
--
--   1) 부문장도 부서장과 마찬가지로 결재권자 위임(대리 결재자 지정)을 할 수 있어야 한다.
--      부문장(division.head_user_id)은 이 테이블에 없어도 항상 결재권자다 — 부서장과 같은 패턴.
--   2) 팀장(team_members.role='admin')도 지금까지 결재 요청 화면에서는 이미 결재권자
--      후보로 선택 가능했지만, 위임 기능/조직 관리 화면에는 반영돼 있지 않았다.
--      부서/부문과 동일한 패턴으로 팀 단위 위임 테이블을 추가한다.
--   3) 부서장이 결재를 올릴 때는 그 결재가 부문장에게 올라가야 한다 (부문장은 모든
--      부서에 대한 결재권을 가짐) — 이건 애플리케이션 코드(결재 요청 화면의 결재권자
--      후보 조회)에서 처리하고, 이 마이그레이션은 위임을 저장할 테이블만 추가한다.
--
-- 생성일: 2026-09-01
-- ============================================================

-- ------------------------------------------------------------
-- division_approvers (부문장이 위임한 결재권자)
-- ------------------------------------------------------------
create table if not exists public.division_approvers (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_vacation boolean not null default true,
  can_remote boolean not null default true,
  can_holiday boolean not null default true,
  created_at timestamptz not null default now(),
  unique (division_id, user_id)
);

-- ------------------------------------------------------------
-- team_approvers (팀장이 위임한 결재권자)
-- ------------------------------------------------------------
create table if not exists public.team_approvers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_vacation boolean not null default true,
  can_remote boolean not null default true,
  can_holiday boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ============================================================
-- RLS: department_approvers(017_rls.sql)와 완전히 동일한 패턴.
-- 결재 신청 화면에서 모든 로그인 사용자가 후보를 조회해야 하므로 SELECT는 전체 공개.
-- 위임 등록/해제는 그 조직 단위를 관리할 수 있는 사람만 (manages_division/manages_team).
-- ============================================================

alter table public.division_approvers enable row level security;

create policy division_approvers_select_authenticated
  on public.division_approvers for select to authenticated
  using (true);

create policy division_approvers_insert_manager
  on public.division_approvers for insert to authenticated
  with check (public.manages_division(division_id));

create policy division_approvers_update_manager
  on public.division_approvers for update to authenticated
  using (public.manages_division(division_id))
  with check (public.manages_division(division_id));

create policy division_approvers_delete_manager
  on public.division_approvers for delete to authenticated
  using (public.manages_division(division_id));

alter table public.team_approvers enable row level security;

create policy team_approvers_select_authenticated
  on public.team_approvers for select to authenticated
  using (true);

create policy team_approvers_insert_manager
  on public.team_approvers for insert to authenticated
  with check (public.manages_team(team_id));

create policy team_approvers_update_manager
  on public.team_approvers for update to authenticated
  using (public.manages_team(team_id))
  with check (public.manages_team(team_id));

create policy team_approvers_delete_manager
  on public.team_approvers for delete to authenticated
  using (public.manages_team(team_id));

-- 018_grants.sql과 같은 범용 GRANT문을 새 테이블에도 적용한다.
grant select, insert, update, delete on public.division_approvers to authenticated;
grant select, insert, update, delete on public.team_approvers to authenticated;

-- ============================================================
-- approval_requests: 부서장/부문장이 자신이 직접 team_members나
-- department_memberships에 없어도(=자리로만 존재해도) 관리 범위 전체의 결재 이력을
-- 볼 수 있도록 조회 정책을 넓힌다 (approval/page.tsx 결재 페이지 열람 범위 확장).
-- manages_department()는 이미 "부서장 자신 + 그 부서가 속한 부문의 부문장 +
-- 총괄관리자 + 마스터"를 포함하므로 이 한 줄로 부서장/부문장/총괄관리자/마스터의
-- 전체 조회 범위가 충족된다.
-- ============================================================
drop policy if exists approval_requests_select on public.approval_requests;

create policy approval_requests_select
  on public.approval_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or approver_id = auth.uid()
    or (team_id is not null and public.is_team_member(team_id))
    or (department_id is not null and public.is_in_department(auth.uid(), department_id))
    or (department_id is not null and public.manages_department(department_id))
    or public.has_full_org_access()
  );
