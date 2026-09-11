-- ============================================================
-- general_admins SELECT 정책 완화
--
-- 017_rls.sql의 general_admins_select 정책은 "본인 행이거나 이미
-- has_full_org_access()인 사람"만 조회를 허용했다. 그런데 결재 신청
-- 화면(app/approval/page.tsx fetchApproversForSource)은 부문장이
-- 총괄 관리자에게 결재를 올릴 때 이 테이블을 조회해 후보를 채운다 —
-- 즉 "총괄 관리자가 아닌 사람"이 "누가 총괄 관리자인지" 알아야 하는
-- 케이스인데, 기존 정책은 정확히 이 경우를 막고 있었다. 그래서 총괄
-- 관리자가 지정돼 있어도 부문장에게는 결재권자 후보가 항상 빈 목록으로
-- 보였다.
--
-- department_approvers/division_approvers/team_approvers가 이미 같은
-- 이유로 SELECT를 전체 공개해둔 것과 동일한 기준으로 맞춘다. 지정/해제
-- (INSERT/DELETE)는 계속 마스터 전용으로 남긴다.
-- ============================================================

DROP POLICY IF EXISTS general_admins_select ON public.general_admins;

CREATE POLICY general_admins_select_authenticated
  ON public.general_admins FOR SELECT TO authenticated
  USING (true);
