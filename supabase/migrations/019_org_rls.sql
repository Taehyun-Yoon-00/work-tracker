-- ============================================================
-- 조직 구조(010~015) 테이블에 RLS 적용 + 기존 정책의 조회 범위를 부서까지 확장
--
-- 010~015는 새 테이블을 만들면서 전부 `disable row level security`로 두고
-- 권한을 화면(UI)에서만 막았다. 016이 나머지 테이블의 RLS를 켰으므로,
-- 조직 테이블만 열려 있으면 그쪽이 우회로가 된다.
--   - divisions / departments / department_memberships → 전사 조직도와 소속이 그대로 노출
--   - department_approvers → 아무나 자기를 결재권자로 추가할 수 있음
--   - general_admins → 아무나 총괄 관리자가 될 수 있음 (권한 상승)
--
-- 동시에 016의 조회 범위는 "같은 팀"까지였는데, 조직 개편 이후 팀 상세 화면이
-- 부서 전체를 보여주고 부서장·부문장이 산하 인원을 열람한다. 범위를 넓히지 않으면
-- 그 화면들이 조용히 빈 채로 보인다.
--
-- 권한 모델은 app/lib/orgPermissions.ts와 같다.
--   [시스템]     마스터(is_master)
--   [조직 관리]  총괄 관리자 > 부문장 > 부서장 > 팀장 > 팀원
-- 생성일: 2026-08-31
-- ============================================================

-- ============================================================
-- 헬퍼 함수
--
-- 016과 같은 이유로 SECURITY DEFINER를 쓴다. 정책 안에서 같은 테이블을 다시
-- 조회하면 정책이 재귀 호출되기 때문이다. search_path 고정은 필수 방어다.
-- ============================================================

-- 총괄 관리자인가 (014)
CREATE OR REPLACE FUNCTION public.is_general_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.general_admins WHERE user_id = auth.uid());
$$;

-- 전체 조직에 대한 최상위 권한 (시스템 관리자 또는 총괄 관리자)
CREATE OR REPLACE FUNCTION public.has_top_org_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_master() OR public.is_general_admin();
$$;

-- 이 부문을 관리할 수 있는가 (부문장 이상)
CREATE OR REPLACE FUNCTION public.is_division_head(p_division_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.divisions
      WHERE id = p_division_id AND head_user_id = auth.uid()
    );
$$;

-- 이 부서를 관리할 수 있는가 (부서장 이상 — 상위 부문장과 최상위 권한을 포함)
CREATE OR REPLACE FUNCTION public.is_department_head(p_department_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = p_department_id
        AND (
          d.head_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.divisions v
            WHERE v.id = d.division_id AND v.head_user_id = auth.uid()
          )
        )
    );
$$;

-- 이 사람이 속한 부서 목록. 팀에 속해 있으면 팀의 부서가, 팀 없이 부서에
-- 직접 소속돼 있으면 그 부서가 나온다 (010의 설계 그대로).
CREATE OR REPLACE FUNCTION public.department_ids_of(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.department_id
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = p_user_id AND t.department_id IS NOT NULL
  UNION
  SELECT dm.department_id
  FROM public.department_memberships dm
  WHERE dm.user_id = p_user_id;
$$;

-- 이 사람의 근무 데이터를 볼 수 있는가.
-- 같은 팀이거나, 같은 부서이거나, 그 사람이 속한 부서의 부서장·부문장인 경우.
CREATE OR REPLACE FUNCTION public.shares_org_scope_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.shares_team_with(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.department_ids_of(p_user_id) AS theirs(id)
      WHERE theirs.id IN (SELECT id FROM public.department_ids_of(auth.uid()) AS mine(id))
         OR public.is_department_head(theirs.id)
    );
$$;

-- ============================================================
-- divisions (부문)
--
-- 조직도는 로그인한 사용자 누구나 볼 수 있다. 결재권자 선택과 조직 탐색이
-- 전사 범위이기 때문이다(profiles를 전체 공개한 016과 같은 판단).
-- 만드는 것과 지우는 것은 최상위 권한만, 이름·부문장 변경은 그 부문장도 할 수 있다.
-- ============================================================
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY divisions_select_authenticated
  ON public.divisions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY divisions_insert_top
  ON public.divisions FOR INSERT TO authenticated
  WITH CHECK (public.has_top_org_access());

CREATE POLICY divisions_update_head
  ON public.divisions FOR UPDATE TO authenticated
  USING (public.is_division_head(id))
  WITH CHECK (public.is_division_head(id));

CREATE POLICY divisions_delete_top
  ON public.divisions FOR DELETE TO authenticated
  USING (public.has_top_org_access());

-- ============================================================
-- departments (부서)
--
-- 부서를 만들고 지우는 것은 그 부문의 부문장 이상, 수정은 부서장 이상.
-- ============================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select_authenticated
  ON public.departments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY departments_insert_division_head
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (public.is_division_head(division_id));

CREATE POLICY departments_update_head
  ON public.departments FOR UPDATE TO authenticated
  USING (public.is_department_head(id))
  WITH CHECK (public.is_department_head(id));

CREATE POLICY departments_delete_division_head
  ON public.departments FOR DELETE TO authenticated
  USING (public.is_division_head(division_id));

-- ============================================================
-- department_memberships (부서 직속 인원)
--
-- 배치는 부서장 이상만 한다. 본인이 스스로 부서에 들어갈 수는 없다
-- (팀 가입 신청과 달리 조직 배치는 관리자가 하는 작업이다).
-- ============================================================
ALTER TABLE public.department_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_memberships_select
  ON public.department_memberships FOR SELECT TO authenticated
  USING (true);

CREATE POLICY department_memberships_insert_head
  ON public.department_memberships FOR INSERT TO authenticated
  WITH CHECK (public.is_department_head(department_id));

CREATE POLICY department_memberships_update_head
  ON public.department_memberships FOR UPDATE TO authenticated
  USING (public.is_department_head(department_id))
  WITH CHECK (public.is_department_head(department_id));

-- 본인의 소속 해제는 허용한다 (탈퇴 처리와 "소속 나가기"에 쓰인다)
CREATE POLICY department_memberships_delete
  ON public.department_memberships FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_department_head(department_id));

-- ============================================================
-- department_approvers (결재권자 위임)
--
-- 결재 요청 화면이 후보를 뽑아야 하므로 조회는 열어두고, 위임 자체는
-- 부서장 이상만 할 수 있다. 이 관문이 없으면 아무나 자기를 결재권자로 넣는다.
-- ============================================================
ALTER TABLE public.department_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_approvers_select
  ON public.department_approvers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY department_approvers_insert_head
  ON public.department_approvers FOR INSERT TO authenticated
  WITH CHECK (public.is_department_head(department_id));

CREATE POLICY department_approvers_update_head
  ON public.department_approvers FOR UPDATE TO authenticated
  USING (public.is_department_head(department_id))
  WITH CHECK (public.is_department_head(department_id));

CREATE POLICY department_approvers_delete_head
  ON public.department_approvers FOR DELETE TO authenticated
  USING (public.is_department_head(department_id));

-- ============================================================
-- general_admins (총괄 관리자)
--
-- 조회는 화면이 권한을 판단하는 데 필요하므로 열어둔다.
-- 지정·해제는 시스템 관리자(마스터)만 — 총괄 관리자가 스스로를 늘릴 수 없어야 한다.
-- ============================================================
ALTER TABLE public.general_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY general_admins_select
  ON public.general_admins FOR SELECT TO authenticated
  USING (true);

CREATE POLICY general_admins_insert_master
  ON public.general_admins FOR INSERT TO authenticated
  WITH CHECK (public.is_master());

CREATE POLICY general_admins_delete_master
  ON public.general_admins FOR DELETE TO authenticated
  USING (public.is_master());

-- ============================================================
-- teams — 조직 관리 화면(/org)이 팀의 이름·소속 부서·정렬 순서를 바꾼다.
--
-- 016에는 teams UPDATE 정책이 아예 없어서(그때는 팀을 수정하는 화면이 없었다)
-- 지금 그대로 두면 /org의 팀 이동·이름 변경이 조용히 실패한다.
-- 팀 생성·삭제도 부서장 이상이 할 수 있어야 한다.
-- ============================================================
CREATE POLICY teams_update_admin_or_org_head
  ON public.teams FOR UPDATE TO authenticated
  USING (
    public.is_team_admin(id)
    OR public.is_master()
    OR (department_id IS NOT NULL AND public.is_department_head(department_id))
    OR public.has_top_org_access()
  )
  WITH CHECK (
    public.is_team_admin(id)
    OR public.is_master()
    OR (department_id IS NOT NULL AND public.is_department_head(department_id))
    OR public.has_top_org_access()
  );

DROP POLICY IF EXISTS teams_insert_self ON public.teams;
CREATE POLICY teams_insert_self_or_org_head
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR (department_id IS NOT NULL AND public.is_department_head(department_id))
    OR public.has_top_org_access()
  );

DROP POLICY IF EXISTS teams_delete_admin ON public.teams;
CREATE POLICY teams_delete_admin_or_org_head
  ON public.teams FOR DELETE TO authenticated
  USING (
    public.is_team_admin(id)
    OR public.is_master()
    OR (department_id IS NOT NULL AND public.is_department_head(department_id))
    OR public.has_top_org_access()
  );

-- ============================================================
-- team_members — /org에서 부서장이 팀 사이로 인원을 옮기고 팀장을 지정한다.
-- 016은 팀장만 허용했으므로 부서장 이상을 더한다.
-- ============================================================
DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select
  ON public.team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_member(team_id)
    OR public.is_master()
    -- 조직 관리 화면은 관할 밖 팀의 구성까지 보여줘야 배치를 할 수 있다
    OR public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND t.department_id IS NOT NULL
        AND (
          public.is_department_head(t.department_id)
          -- 같은 부서 사람은 부서 화면에서 다른 팀의 구성원까지 본다.
          -- (부서 캘린더가 그 사람들의 휴가·원격근무를 이름과 함께 보여준다)
          OR t.department_id IN (SELECT id FROM public.department_ids_of(auth.uid()) AS mine(id))
        )
    )
  );

DROP POLICY IF EXISTS team_members_insert ON public.team_members;
CREATE POLICY team_members_insert
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
    OR public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND t.department_id IS NOT NULL
        AND public.is_department_head(t.department_id)
    )
  );

DROP POLICY IF EXISTS team_members_update_admin ON public.team_members;
CREATE POLICY team_members_update_admin
  ON public.team_members FOR UPDATE TO authenticated
  USING (
    public.is_team_admin(team_id)
    OR public.is_master()
    OR public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND t.department_id IS NOT NULL
        AND public.is_department_head(t.department_id)
    )
  )
  WITH CHECK (
    public.is_team_admin(team_id)
    OR public.is_master()
    OR public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND t.department_id IS NOT NULL
        AND public.is_department_head(t.department_id)
    )
  );

DROP POLICY IF EXISTS team_members_delete ON public.team_members;
CREATE POLICY team_members_delete
  ON public.team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
    OR public.has_top_org_access()
    OR EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND t.department_id IS NOT NULL
        AND public.is_department_head(t.department_id)
    )
  );

-- ============================================================
-- 근무 데이터 조회 범위를 팀에서 부서로 넓힌다.
--
-- 016은 shares_team_with(같은 팀)까지만 열었다. 팀 상세의 "부서 전체" 필터와
-- 부서 화면(/team/dept/[id])은 같은 부서의 다른 팀 인원까지 보여주므로
-- shares_org_scope_with로 바꾼다. 쓰기 정책은 그대로(본인만) 둔다.
-- ============================================================
DROP POLICY IF EXISTS work_logs_select ON public.work_logs;
CREATE POLICY work_logs_select
  ON public.work_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_org_scope_with(user_id)
    OR public.is_master()
  );

DROP POLICY IF EXISTS vacations_select ON public.vacations;
CREATE POLICY vacations_select
  ON public.vacations FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_org_scope_with(user_id)
    OR public.is_master()
  );

DROP POLICY IF EXISTS remote_works_select ON public.remote_works;
CREATE POLICY remote_works_select
  ON public.remote_works FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_org_scope_with(user_id)
    OR public.is_master()
  );

DROP POLICY IF EXISTS commute_plans_select ON public.commute_plans;
CREATE POLICY commute_plans_select
  ON public.commute_plans FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_org_scope_with(user_id)
    OR public.is_master()
  );

DROP POLICY IF EXISTS work_log_matters_select ON public.work_log_matters;
CREATE POLICY work_log_matters_select
  ON public.work_log_matters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id
        AND (
          w.user_id = auth.uid()
          OR public.shares_org_scope_with(w.user_id)
          OR public.is_master()
        )
    )
  );

-- ============================================================
-- approval_requests — 부서 직속으로 올린 요청은 team_id가 NULL이다.
-- 016의 정책은 팀 기준이라 그런 요청이 당사자에게만 보인다.
-- 결재 화면의 조회 범위(내 요청 / 내가 결재권자 / 내 팀 / 내 부서)에 맞춘다.
-- ============================================================
DROP POLICY IF EXISTS approval_requests_select ON public.approval_requests;
CREATE POLICY approval_requests_select
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
    OR (
      department_id IS NOT NULL
      AND (
        department_id IN (SELECT id FROM public.department_ids_of(auth.uid()) AS mine(id))
        OR public.is_department_head(department_id)
      )
    )
    OR public.is_master()
  );
