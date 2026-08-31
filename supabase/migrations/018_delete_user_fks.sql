-- ============================================================
-- 탈퇴를 막던 외래키 두 개를 ON DELETE SET NULL로 바꾼다
--
-- profiles를 참조하는 외래키는 대부분 ON DELETE CASCADE인데 두 개만 NO ACTION이었다.
--   - approval_requests.approver_id
--   - teams.created_by
--
-- 그래서 "결재권자였던 적이 있는 사람"이나 "팀을 만든 사람"을 탈퇴시키면
-- profiles 삭제가 외래키 위반으로 실패했다. /api/admin/delete-user는 이 오류를
-- 확인하지 않아서, auth 계정만 지워지고 profiles 행은 남는 상태가 됐다.
-- 남은 행은 회원 관리 목록과 결재권자 이름에 계속 나타난다.
--
-- CASCADE로 바꾸면 남의 결재 요청이나 팀이 함께 지워지므로 쓸 수 없다.
-- SET NULL로 두면 기록은 남고 이름만 비는데, 화면은 displayName()이
-- '알 수 없음'으로 받아준다.
--
-- 두 컬럼 모두 NOT NULL이 아니므로 SET NULL이 가능하다.
-- ============================================================

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_approver_id_fkey;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_created_by_fkey;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 조직 개편(010/014)이 profiles를 참조하는 외래키를 세 개 더 만들었는데
-- 역시 ON DELETE가 없어서 같은 문제가 되풀이된다.
--   - divisions.head_user_id      (부문장)
--   - departments.head_user_id    (부서장)
--   - general_admins.created_by   (총괄 관리자를 지정한 사람)
-- 자리를 비우는 것이지 조직을 지우는 게 아니므로 전부 SET NULL로 둔다.
-- (general_admins.user_id는 010에서 이미 ON DELETE CASCADE다)
-- ------------------------------------------------------------

ALTER TABLE public.divisions
  DROP CONSTRAINT IF EXISTS divisions_head_user_id_fkey;

ALTER TABLE public.divisions
  ADD CONSTRAINT divisions_head_user_id_fkey
  FOREIGN KEY (head_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_head_user_id_fkey;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_head_user_id_fkey
  FOREIGN KEY (head_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.general_admins
  DROP CONSTRAINT IF EXISTS general_admins_created_by_fkey;

ALTER TABLE public.general_admins
  ADD CONSTRAINT general_admins_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
