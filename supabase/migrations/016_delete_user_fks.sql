-- ============================================================
-- 탈퇴를 막던 외래키들을 ON DELETE SET NULL로 바꾼다
--
-- profiles를 참조하는 외래키 중 다음은 ON DELETE CASCADE가 아니라 기본값(NO ACTION)이다.
--   - teams.created_by
--   - approval_requests.approver_id
--   - divisions.head_user_id       (010_org_structure)
--   - departments.head_user_id     (010_org_structure)
--   - general_admins.created_by    (014_general_admin, "누가 지정했는지" 기록용 컬럼)
--
-- 그래서 "팀을 만든 적이 있거나", "결재권자였거나", "부문장/부서장으로 지정된 적이
-- 있거나", "총괄 관리자를 지정한 적이 있는" 사람을 탈퇴시키면 profiles 삭제가
-- 외래키 위반으로 실패한다. 지금까지는 /api/admin/delete-user가 삭제 전에
-- 이 컬럼들을 애플리케이션 코드에서 직접 null로 미리 바꿔서 우회해왔는데,
-- DB 제약을 직접 고치면 그 방어 코드가 없어도 항상 안전하다
-- (다른 경로로 profiles가 지워지는 경우, 예: Supabase 대시보드에서 직접 삭제해도 동일하게 보호된다).
--
-- CASCADE로 바꾸면 그 사람이 만든 팀이나 결재 기록 자체가 함께 지워지므로 쓸 수 없다.
-- SET NULL로 두면 기록은 남고 이름/지정만 비는데, 화면은 displayName()이
-- '알 수 없음'으로 받아준다.
--
-- 다섯 컬럼 모두 NOT NULL이 아니므로 SET NULL이 가능하다.
-- ============================================================

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_created_by_fkey;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_approver_id_fkey;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- divisions/general_admins은 010/014에서 처음 생성될 때부터 없었을 수 있으므로
-- 테이블 존재 여부를 먼저 확인한다 (아직 그 마이그레이션을 적용하지 않은 환경 보호).
DO $$
BEGIN
  IF to_regclass('public.divisions') IS NOT NULL THEN
    ALTER TABLE public.divisions
      DROP CONSTRAINT IF EXISTS divisions_head_user_id_fkey;
    ALTER TABLE public.divisions
      ADD CONSTRAINT divisions_head_user_id_fkey
      FOREIGN KEY (head_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.departments') IS NOT NULL THEN
    ALTER TABLE public.departments
      DROP CONSTRAINT IF EXISTS departments_head_user_id_fkey;
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_head_user_id_fkey
      FOREIGN KEY (head_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.general_admins') IS NOT NULL THEN
    ALTER TABLE public.general_admins
      DROP CONSTRAINT IF EXISTS general_admins_created_by_fkey;
    ALTER TABLE public.general_admins
      ADD CONSTRAINT general_admins_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
