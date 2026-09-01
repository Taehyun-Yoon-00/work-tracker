-- ============================================================
-- Row Level Security 전면 적용 (renewal 조직 구조 버전)
--
-- refactoring 브랜치가 main에 적용한 009_rls.sql과 같은 문제를 renewal에서도 고친다:
-- 001~015 어디에도 RLS가 없고(009_fix_work_log_matters_rls.sql은 오히려 "다른 테이블과
-- 맞추기 위해" work_log_matters의 RLS를 껐다), 모든 테이블이 브라우저가 anon/authenticated
-- 세션으로 직접 읽고 쓸 수 있는 상태다. URL이나 테이블/컬럼 이름만 알면 다른 사람의
-- 근무기록·휴가·결재 요청을 조회/수정할 수 있다. 이 마이그레이션이 그 구멍을 막는다.
--
-- renewal은 main과 달리 팀 위에 부서/부문 조직 구조와 총괄 관리자가 있으므로,
-- main의 접근 모델(본인/같은 팀/마스터)만으로는 부족하다. 아래는 실제 화면 코드가
-- 이미 전제하고 있는 접근 범위를 그대로 정책으로 옮긴 것이다:
--
--   [시스템 권한] MASTER(profiles.is_master) — 항상 전체 접근
--   [조직 관리 권한] 총괄 관리자 > 부문장 > 부서장 > 팀장 > 팀원
--     - 총괄 관리자(general_admins)와 마스터는 조직 전체를 본다 (team/[id]/page.tsx:116 참고)
--     - 부문장(divisions.head_user_id)은 자기 부문 산하 모든 부서/팀을 본다
--     - 부서장(departments.head_user_id)은 자기 부서 산하 모든 팀 + 부서 직속 인원을 본다
--     - 팀장(team_members.role='admin')은 같은 팀원과 데이터를 공유해서 본다(팀원과 동일)
--   [조직 구조 변경] 팀/부서/부문 생성·수정·삭제, 인원 배치는 /org 화면 전용이며
--     화면 접근 자체가 "부서장 이상"으로 제한돼 있다(client-side). 여기서도 같은 기준
--     (manages_department/manages_division)으로 서버에서 다시 막는다.
--   [결재] 요청자·지정된 결재권자·같은 팀·같은 부서 사람은 조회 가능
--     (approval/page.tsx의 or 조건: requester_id/approver_id/team_id/department_id)
--
-- 서버 API 라우트는 SUPABASE_SERVICE_ROLE_KEY를 쓰므로 RLS를 우회한다.
--
-- 적용 전 반드시 파일 맨 아래의 "확인 절차"를 읽을 것.
-- ============================================================

-- ============================================================
-- 헬퍼 함수
--
-- 정책 안에서 같은 테이블을 다시 조회하면 정책이 재귀 호출되어 infinite recursion
-- 오류가 난다. SECURITY DEFINER 함수는 호출자의 RLS를 우회하므로 재귀를 끊는 용도로 쓴다.
-- search_path를 고정하는 것은 SECURITY DEFINER 함수의 필수 방어다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_master FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- 총괄 관리자(조직 관리 권한 트랙의 최상위, MASTER와는 별도 트랙)
CREATE OR REPLACE FUNCTION public.is_general_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.general_admins WHERE user_id = auth.uid()
  );
$$;

-- 마스터 또는 총괄 관리자 — 조직 전체에 대한 열람/관리 권한 (team/[id]/page.tsx의
-- "masterFlag || generalAdminRow" 판정과 동일)
CREATE OR REPLACE FUNCTION public.has_full_org_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_master() OR public.is_general_admin();
$$;

-- 내가 이 팀의 팀원인가
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$$;

-- 내가 이 팀의 팀장인가
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- 이 사람과 내가 팀을 하나라도 공유하는가 (팀원끼리의 조회 허용에 쓴다)
CREATE OR REPLACE FUNCTION public.shares_team_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members mine
    JOIN public.team_members theirs ON theirs.team_id = mine.team_id
    WHERE mine.user_id = auth.uid() AND theirs.user_id = p_user_id
  );
$$;

-- 내가 이 부서의 부서장인가
CREATE OR REPLACE FUNCTION public.is_department_head(p_department_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.departments
    WHERE id = p_department_id AND head_user_id = auth.uid()
  );
$$;

-- 내가 이 부문의 부문장인가
CREATE OR REPLACE FUNCTION public.is_division_head(p_division_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.divisions
    WHERE id = p_division_id AND head_user_id = auth.uid()
  );
$$;

-- 내가 이 부서를 관리할 수 있는가 (부서장 자신, 그 부서가 속한 부문의 부문장,
-- 총괄 관리자, 마스터). /org 화면에서 부서 하위 팀/인원을 배치·수정할 수 있는 기준과 같다.
CREATE OR REPLACE FUNCTION public.manages_department(p_department_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_full_org_access()
    OR public.is_department_head(p_department_id)
    OR EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = p_department_id AND public.is_division_head(d.division_id)
    );
$$;

-- 내가 이 부문을 관리할 수 있는가 (부문장 자신, 총괄 관리자, 마스터)
CREATE OR REPLACE FUNCTION public.manages_division(p_division_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_full_org_access() OR public.is_division_head(p_division_id);
$$;

-- 내가 이 팀을 관리할 수 있는가 (팀장 자신, 그 팀이 속한 부서/부문의 관리자,
-- 총괄 관리자, 마스터). team이 아직 department에 배정되지 않은 경우 department 경로는 통과하지 않는다.
CREATE OR REPLACE FUNCTION public.manages_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_full_org_access()
    OR public.is_team_admin(p_team_id)
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = p_team_id
        AND t.department_id IS NOT NULL
        AND public.manages_department(t.department_id)
    );
$$;

-- 이 사람이 이 부서에 속해 있는가 (부서 직속이거나, 이 부서에 속한 팀의 팀원)
CREATE OR REPLACE FUNCTION public.is_in_department(p_user_id uuid, p_department_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.department_memberships
      WHERE department_id = p_department_id AND user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = p_user_id AND t.department_id = p_department_id
    );
$$;

-- 이 대상의 근무기록/휴가/원격근무/출근계획을 내가 열람할 수 있는가:
-- 본인, 같은 팀, (대상이 속한 부서를) 나도 같이 속해 있거나 관리할 수 있는 경우,
-- 총괄 관리자, 마스터.
CREATE OR REPLACE FUNCTION public.can_view_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR public.has_full_org_access()
    OR public.shares_team_with(p_target_user_id)
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT department_id FROM public.department_memberships WHERE user_id = p_target_user_id
        UNION
        SELECT t.department_id FROM public.team_members tm
          JOIN public.teams t ON t.id = tm.team_id
          WHERE tm.user_id = p_target_user_id AND t.department_id IS NOT NULL
      ) AS target_depts(department_id)
      WHERE public.is_in_department(auth.uid(), target_depts.department_id)
         OR public.manages_department(target_depts.department_id)
    );
$$;

-- ============================================================
-- profiles
--
-- 조회는 로그인한 사용자 전체에게 연다. 팀/부서 목록, 결재 상대, 조직도 곳곳에서
-- 다른 사람의 이름과 이메일을 조인해 표시하기 때문이다.
-- 생성은 auth.users 트리거(handle_new_user, SECURITY DEFINER)가 하므로
-- INSERT 정책을 만들지 않는다.
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 본인 프로필(이름/직급/총휴가)만 수정. 마스터는 회원 관리 화면에서 전체 수정
CREATE POLICY profiles_update_own_or_master
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_master())
  WITH CHECK (id = auth.uid() OR public.is_master());

-- is_master는 행 단위 정책으로 막을 수 없다. 위 UPDATE 정책은 "본인 행"이면
-- 통과시키는데 RLS는 컬럼을 구분하지 않으므로 일반 사용자가 자기 행의 is_master를
-- true로 바꿔 마스터가 될 수 있다(마이페이지가 이미 본인 프로필을 UPDATE하므로
-- 실제로 도달 가능한 경로다). 컬럼 단위 방어는 트리거로 한다.
-- auth.uid()가 NULL인 경우는 서비스 롤/직접 접속이므로 통과시킨다.
CREATE OR REPLACE FUNCTION public.guard_profile_master_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_master IS DISTINCT FROM OLD.is_master
     AND auth.uid() IS NOT NULL
     AND NOT public.is_master() THEN
    RAISE EXCEPTION '마스터 권한은 마스터만 변경할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER profiles_guard_master_flag
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_master_flag();

-- ============================================================
-- divisions / departments
--
-- 조직도가 전 직원에게 공개되는 화면(사이드바, 결재 대상 선택 등)이라 조회는 전체 공개.
-- 생성/수정/삭제는 /org 화면 전용이며 그 화면 접근 자체가 부서장 이상으로 제한된다.
-- ============================================================
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY divisions_select_authenticated
  ON public.divisions FOR SELECT TO authenticated
  USING (true);

-- 부문 생성은 조직 최상위 작업이라 총괄 관리자/마스터만
CREATE POLICY divisions_insert_org_admin
  ON public.divisions FOR INSERT TO authenticated
  WITH CHECK (public.has_full_org_access());

CREATE POLICY divisions_update_manager
  ON public.divisions FOR UPDATE TO authenticated
  USING (public.manages_division(id))
  WITH CHECK (public.manages_division(id));

CREATE POLICY divisions_delete_org_admin
  ON public.divisions FOR DELETE TO authenticated
  USING (public.has_full_org_access());

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select_authenticated
  ON public.departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY departments_insert_manager
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (public.manages_division(division_id));

CREATE POLICY departments_update_manager
  ON public.departments FOR UPDATE TO authenticated
  USING (public.manages_department(id))
  WITH CHECK (public.manages_department(id) AND public.manages_division(division_id));

CREATE POLICY departments_delete_manager
  ON public.departments FOR DELETE TO authenticated
  USING (public.manages_department(id));

-- ============================================================
-- department_memberships (부서 직접 소속)
-- ============================================================
ALTER TABLE public.department_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_memberships_select
  ON public.department_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_in_department(auth.uid(), department_id)
    OR public.manages_department(department_id)
  );

-- 배치는 /org 화면(부서장 이상)에서만 한다
CREATE POLICY department_memberships_insert_manager
  ON public.department_memberships FOR INSERT TO authenticated
  WITH CHECK (public.manages_department(department_id));

CREATE POLICY department_memberships_update_manager
  ON public.department_memberships FOR UPDATE TO authenticated
  USING (public.manages_department(department_id))
  WITH CHECK (public.manages_department(department_id));

CREATE POLICY department_memberships_delete_manager
  ON public.department_memberships FOR DELETE TO authenticated
  USING (public.manages_department(department_id));

-- ============================================================
-- department_approvers (결재권자 위임)
--
-- 결재 신청 화면에서 모든 로그인 사용자가 "이 부서의 결재권자 후보"를 조회해야
-- 하므로 SELECT는 전체 공개. 위임 등록/해제는 그 부서를 관리할 수 있는 사람만.
-- ============================================================
ALTER TABLE public.department_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_approvers_select_authenticated
  ON public.department_approvers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY department_approvers_insert_manager
  ON public.department_approvers FOR INSERT TO authenticated
  WITH CHECK (public.manages_department(department_id));

CREATE POLICY department_approvers_update_manager
  ON public.department_approvers FOR UPDATE TO authenticated
  USING (public.manages_department(department_id))
  WITH CHECK (public.manages_department(department_id));

CREATE POLICY department_approvers_delete_manager
  ON public.department_approvers FOR DELETE TO authenticated
  USING (public.manages_department(department_id));

-- ============================================================
-- general_admins (총괄 관리자)
--
-- 총괄 관리자 지정은 마스터(시스템 관리자)만 할 수 있다 — 조직 관리 권한의
-- 최상위 계급을 부여하는 일이라 profiles.is_master 트리거와 같은 수준으로 제한한다.
-- ============================================================
ALTER TABLE public.general_admins ENABLE ROW LEVEL SECURITY;

-- 본인 여부 확인(useCurrentProfile), 총괄 관리자/마스터의 회원 관리 화면 조회
CREATE POLICY general_admins_select
  ON public.general_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_full_org_access());

CREATE POLICY general_admins_insert_master
  ON public.general_admins FOR INSERT TO authenticated
  WITH CHECK (public.is_master());

CREATE POLICY general_admins_delete_master
  ON public.general_admins FOR DELETE TO authenticated
  USING (public.is_master());

-- ============================================================
-- teams
--
-- 조회는 전체 공개(부서 화면, 결재 대상 선택 등에서 이름을 보여줘야 한다).
-- 생성/수정/삭제는 그 팀이 속한(속하게 될) 부서를 관리할 수 있는 사람만 — /org 화면 전용.
-- ============================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_authenticated
  ON public.teams FOR SELECT TO authenticated
  USING (true);

CREATE POLICY teams_insert_manager
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (department_id IS NOT NULL AND public.manages_department(department_id));

CREATE POLICY teams_update_manager
  ON public.teams FOR UPDATE TO authenticated
  USING (public.manages_team(id))
  WITH CHECK (department_id IS NULL OR public.manages_department(department_id));

CREATE POLICY teams_delete_manager
  ON public.teams FOR DELETE TO authenticated
  USING (public.manages_team(id));

-- ============================================================
-- team_members
--
-- 조회는 팀원 본인 + 같은 팀원 + 그 팀을 관리할 수 있는 사람(부서장/부문장/
-- 총괄관리자/마스터). 배치/변경/삭제도 /org 화면 전용이라 관리자만 가능하다.
-- ============================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_select
  ON public.team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_member(team_id)
    OR public.manages_team(team_id)
  );

CREATE POLICY team_members_insert_manager
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.manages_team(team_id));

CREATE POLICY team_members_update_manager
  ON public.team_members FOR UPDATE TO authenticated
  USING (public.manages_team(team_id))
  WITH CHECK (public.manages_team(team_id));

-- 본인 탈퇴(마이페이지 회원탈퇴)와 관리자의 내보내기/재배치를 모두 허용
CREATE POLICY team_members_delete
  ON public.team_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.manages_team(team_id));

-- ============================================================
-- team_requests (팀 가입 신청)
--
-- renewal 화면에는 더 이상 자율 가입 신청 UI가 없지만, 스키마와 강제 탈퇴 정리
-- 로직(관리자 화면)이 이 테이블을 참조하므로 회귀 방지를 위해 정책은 유지한다.
-- ============================================================
ALTER TABLE public.team_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_requests_select
  ON public.team_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.manages_team(team_id));

CREATE POLICY team_requests_insert_self
  ON public.team_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY team_requests_update
  ON public.team_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.manages_team(team_id))
  WITH CHECK (user_id = auth.uid() OR public.manages_team(team_id));

CREATE POLICY team_requests_delete
  ON public.team_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.manages_team(team_id));

-- ============================================================
-- work_logs / vacations / remote_works / commute_plans
--
-- 네 테이블 모두 user_id 하나로 소유자가 정해지고 접근 규칙이 같다.
-- 조회: 본인 + can_view_user()가 허용하는 범위(팀/부서/부문 관리자/총괄관리자/마스터)
-- 쓰기: 본인만 (삭제는 강제 탈퇴 처리를 위해 열어둔다)
-- ============================================================

-- work_logs
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_logs_select
  ON public.work_logs FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY work_logs_insert_own
  ON public.work_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY work_logs_update_own
  ON public.work_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY work_logs_delete_own
  ON public.work_logs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- vacations
ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;

CREATE POLICY vacations_select
  ON public.vacations FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY vacations_insert_own
  ON public.vacations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY vacations_update_own
  ON public.vacations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY vacations_delete_own
  ON public.vacations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- remote_works
ALTER TABLE public.remote_works ENABLE ROW LEVEL SECURITY;

CREATE POLICY remote_works_select
  ON public.remote_works FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY remote_works_insert_own
  ON public.remote_works FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY remote_works_update_own
  ON public.remote_works FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY remote_works_delete_own
  ON public.remote_works FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- commute_plans
ALTER TABLE public.commute_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY commute_plans_select
  ON public.commute_plans FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

CREATE POLICY commute_plans_insert_own
  ON public.commute_plans FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY commute_plans_update_own
  ON public.commute_plans FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY commute_plans_delete_own
  ON public.commute_plans FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- work_log_matters (안건별 공수)
--
-- 소유자 컬럼이 없고 work_log_id로만 연결되므로 부모 행의 권한을 따라간다.
-- 009_fix_work_log_matters_rls.sql이 "다른 테이블과 맞춘다"며 껐던 RLS를
-- 이번에 다른 테이블과 함께 다시 켠다.
-- ============================================================
ALTER TABLE public.work_log_matters ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_log_matters_select
  ON public.work_log_matters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id AND public.can_view_user(w.user_id)
    )
  );

CREATE POLICY work_log_matters_insert_own
  ON public.work_log_matters FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id AND w.user_id = auth.uid()
    )
  );

CREATE POLICY work_log_matters_update_own
  ON public.work_log_matters FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id AND w.user_id = auth.uid()
    )
  );

-- 저장할 때마다 기존 안건을 지우고 다시 넣는 구조라 DELETE가 필요하다
CREATE POLICY work_log_matters_delete_own
  ON public.work_log_matters FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id AND w.user_id = auth.uid()
    )
  );

-- ============================================================
-- approval_requests (결재)
--
-- 조회 범위는 결재 페이지의 기존 쿼리(approval/page.tsx fetchRequests)와 같다:
-- 내 요청 / 내가 결재권자 / 내 팀의 요청 / 내 부서의 요청.
-- ============================================================
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_select
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
    OR (department_id IS NOT NULL AND public.is_in_department(auth.uid(), department_id))
    OR public.has_full_org_access()
  );

CREATE POLICY approval_requests_insert_self
  ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- 신청자의 수정/취소, 결재권자의 승인/반려/취소요청 처리, 그 부서/부문 관리자의
-- 오버라이드(휴가 중인 결재권자를 대신해 처리해야 하는 경우 등), 총괄관리자/마스터
CREATE POLICY approval_requests_update
  ON public.approval_requests FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR (department_id IS NOT NULL AND public.manages_department(department_id))
    OR public.has_full_org_access()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR (department_id IS NOT NULL AND public.manages_department(department_id))
    OR public.has_full_org_access()
  );

-- DELETE 정책은 만들지 않는다. 회원 강제 탈퇴 시의 삭제는
-- /api/admin/delete-user가 서비스 롤 키로 처리한다.

-- ============================================================
-- substitute_holidays (대체공휴일)
--
-- 달력 표시에 모두가 읽어야 하고, 등록/삭제는 마스터 전용 화면(/admin)에만 있다.
-- ============================================================
ALTER TABLE public.substitute_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY substitute_holidays_select_authenticated
  ON public.substitute_holidays FOR SELECT TO authenticated
  USING (true);

CREATE POLICY substitute_holidays_insert_master
  ON public.substitute_holidays FOR INSERT TO authenticated
  WITH CHECK (public.is_master());

CREATE POLICY substitute_holidays_delete_master
  ON public.substitute_holidays FOR DELETE TO authenticated
  USING (public.is_master());

-- ============================================================
-- 확인 절차 (적용 전에 읽을 것)
--
-- 이 마이그레이션은 되돌리기 번거로운 변경이다. 정책이 하나라도 어긋나면
-- 해당 화면이 "데이터가 없음"으로 조용히 비어 보인다. 순서대로 진행할 것.
--
-- 1) 운영에 바로 넣지 말고 로컬/스테이징에서 먼저 적용한다.
--      npx supabase db reset      (로컬 DB를 001~018로 새로 만든다)
--
-- 2) 최소 아래 조합의 계정으로 직접 확인한다: 팀원, 팀장, 부서장, 부문장,
--    총괄 관리자, 마스터, 그리고 "아무 소속도 없는" 일반 계정.
--    - 근무기록 저장/수정/삭제, 안건별 공수 저장
--    - 휴가/원격근무 토글, 주차별 출근계획 저장
--    - /team 진입 시 소속에 따라 팀/부서 화면으로 올바르게 라우팅되는지
--    - 팀 상세(/team/[id])에서 팀원 + (부서 전체 스코프일 때) 부서 인원의
--      주간/월간 근무시간이 보이는지
--    - 부서 직속 인원 화면(/team/dept/[id])이 부서장/부문장/총괄관리자/마스터에게
--      제대로 보이고, 무관한 계정에는 막히는지
--    - /org 화면에서 부문/부서/팀 생성·수정·삭제·인원 배치·순서 변경
--      (부서장은 자기 부서만, 부문장은 자기 부문 산하만, 그 외에는 총괄관리자/마스터만)
--    - 결재 신청 → 결재권자 후보(부서장 자동 + 위임된 결재권자) 조회 →
--      승인/반려 → 취소 요청 → 리포트 페이지 합계
--    - 마스터 회원 관리 화면의 회원 목록/대체공휴일 등록/총괄관리자 지정/강제 탈퇴
--
-- 3) 막혔는지 확인하려는 것(이게 이번 작업의 목적):
--    나와 무관한 팀/부서 id로 /team/<id> 또는 /team/dept/<id>를 열었을 때
--    "권한이 없습니다"로 막히고, 데이터도 비어 보여야 한다.
--
-- 4) 문제가 없으면 운영에 적용한다.
--      npx supabase db push
--
-- 되돌리려면 각 테이블에 대해
--   ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
-- 를 실행하면 정책을 지우지 않고도 즉시 원복된다.
-- ============================================================
