-- ============================================================
-- 대시보드 조회 권한 위임
--
-- 배경: 대시보드(/dashboard)는 팀장/부장/부문장/총괄 관리자만 볼 수 있었다.
-- 결재권자 위임(011, 019)과 같은 방식으로, 조직 관리 화면에서 "대시보드 조회"
-- 권한도 다른 사람에게 위임할 수 있게 한다.
--
--   - division_approvers / department_approvers / team_approvers 세 테이블에
--     can_dashboard 컬럼을 추가한다. (결재 유형 체크와 같은 줄에 하나 더 붙는 형태)
--   - 기본값은 false — 기존 결재권자 위임 행은 대시보드 권한이 없는 상태 그대로다.
--   - 위임받은 사람은 위임된 조직 단위(부문/부서/팀)를 대시보드 조회 범위로 갖는다.
--     (부문 위임 = 부문장과 같은 범위, 부서 위임 = 부장과 같은 범위, 팀 위임 = 팀 하나)
--   - 대시보드는 work_logs만 읽는다. work_logs 조회 정책(017)에 "대시보드 위임을 받은 조직의
--     인원" 조건을 하나 더한다. (조회만 열린다. 근무기록 수정/삭제는 계속 본인만 가능하다.)
--     can_view_user()는 vacations/remote_works/commute_plans 조회에도 쓰이므로 건드리지 않는다 —
--     위임은 대시보드(근무시간 통계)에 필요한 범위까지만 열어주는 최소 권한이다.
--   - 위임 등록/해제 권한은 기존 결재권자 위임과 동일하다 (manages_division/department/team).
--     이 컬럼도 같은 테이블의 같은 RLS 정책 아래에 있으므로 정책을 새로 만들 필요가 없다.
--
-- 모두 IF NOT EXISTS / OR REPLACE라서 여러 번 실행해도 안전하다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 컬럼 추가
-- ------------------------------------------------------------
alter table public.division_approvers
  add column if not exists can_dashboard boolean not null default false;

alter table public.department_approvers
  add column if not exists can_dashboard boolean not null default false;

alter table public.team_approvers
  add column if not exists can_dashboard boolean not null default false;

-- ------------------------------------------------------------
-- 2) 이 대상의 근무기록을 "대시보드 위임" 덕분에 내가 열람할 수 있는가
--
-- 대상이 속한 부서 = 부서 직속 + 부서 산하 팀의 팀원 + 그 부서의 부장.
-- (부장은 부서 직속 테이블에 없어도 대시보드 구성원 목록에 항상 포함되므로 같이 본다.)
-- 아래 세 경로 중 하나라도 맞으면 true:
--   팀 위임   : 내가 그 대상이 속한 팀에 can_dashboard 위임을 받았다
--   부서 위임 : 내가 그 대상이 속한 부서에 can_dashboard 위임을 받았다
--   부문 위임 : 내가 그 대상이 속한 부서의 부문에 can_dashboard 위임을 받았다
--               (대상이 부문장 본인인 경우도 포함 — 부문 직속 인원으로 표시되기 때문)
-- ------------------------------------------------------------
create or replace function public.has_dashboard_delegation_over(p_target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- 팀 단위 위임
    exists (
      select 1
      from public.team_approvers ta
      join public.team_members tm on tm.team_id = ta.team_id
      where ta.user_id = auth.uid()
        and ta.can_dashboard
        and tm.user_id = p_target_user_id
    )
    -- 부서 단위 위임
    or exists (
      select 1
      from public.department_approvers da
      where da.user_id = auth.uid()
        and da.can_dashboard
        and (
          exists (
            select 1 from public.department_memberships dm
            where dm.department_id = da.department_id and dm.user_id = p_target_user_id
          )
          or exists (
            select 1
            from public.team_members tm
            join public.teams t on t.id = tm.team_id
            where t.department_id = da.department_id and tm.user_id = p_target_user_id
          )
          or exists (
            select 1 from public.departments d
            where d.id = da.department_id and d.head_user_id = p_target_user_id
          )
        )
    )
    -- 부문 단위 위임
    or exists (
      select 1
      from public.division_approvers va
      where va.user_id = auth.uid()
        and va.can_dashboard
        and (
          exists (
            select 1 from public.divisions v
            where v.id = va.division_id and v.head_user_id = p_target_user_id
          )
          or exists (
            select 1
            from public.departments d
            where d.division_id = va.division_id
              and (
                d.head_user_id = p_target_user_id
                or exists (
                  select 1 from public.department_memberships dm
                  where dm.department_id = d.id and dm.user_id = p_target_user_id
                )
                or exists (
                  select 1
                  from public.team_members tm
                  join public.teams t on t.id = tm.team_id
                  where t.department_id = d.id and tm.user_id = p_target_user_id
                )
              )
          )
        )
    );
$$;

-- ------------------------------------------------------------
-- 3) work_logs 조회 정책 확장 — 017_rls.sql의 work_logs_select에 위임 조건만 추가한다.
--    (can_view_user 기존 범위는 그대로 + 대시보드 위임 범위)
-- ------------------------------------------------------------
drop policy if exists work_logs_select on public.work_logs;

create policy work_logs_select
  on public.work_logs for select to authenticated
  using (
    public.can_view_user(user_id)
    or public.has_dashboard_delegation_over(user_id)
  );
