-- ============================================================
-- approval_requests.division_id 추가
--
-- 배경: 부문장이 "겸임 부서 없이 부문장 역할만" 가진 상태로 결재를 신청하면
-- team_id/department_id가 둘 다 null인 요청이 생긴다(app/approval/page.tsx의
-- "부문 전용 소속" 케이스). 지금까지는 이 요청을 어느 부문 소속인지 구분할 방법이
-- 없어서, 결재 목록 화면에서 부문 단위로 필터링해도 항상 노출되거나(승인자 본인
-- 우회 조건 때문에) 아예 구분이 안 됐다. division_id를 추가해 이 요청이 어느
-- 부문 소속인지 명시적으로 남긴다.
-- 생성일: 2026-09-11
-- ============================================================

alter table public.approval_requests
  add column if not exists division_id uuid references public.divisions(id) on delete set null;

-- 부문장 본인, 또는 그 부문을 관리할 수 있는 사람(상위 부문장/총괄 관리자/마스터)이
-- division_id 기반으로도 조회할 수 있도록 SELECT 정책에 조건을 추가한다.
-- (department_id 기반 조건과 완전히 동일한 패턴.)
drop policy if exists approval_requests_select on public.approval_requests;

create policy approval_requests_select
  on public.approval_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or approver_id = auth.uid()
    or (team_id is not null and public.is_team_member(team_id))
    or (department_id is not null and public.is_in_department(auth.uid(), department_id))
    or (department_id is not null and public.manages_department(department_id))
    or (division_id is not null and public.manages_division(division_id))
    or public.has_full_org_access()
  );
