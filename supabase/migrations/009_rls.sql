-- ============================================================
-- Row Level Security 전면 적용
--
-- 지금까지 notifications(002/003)와 push_subscriptions(004)에만 RLS가 있었고,
-- 나머지 테이블은 브라우저가 anon key로 직접 읽고 쓸 수 있었다.
-- 접근 제어가 클라이언트 코드에만 있었으므로 URL만 알면 남의 근무기록을
-- 조회할 수 있는 상태였다. 이 마이그레이션이 그 구멍을 막는다.
--
-- 정책이 반영하는 접근 모델(= 현재 앱이 의도하던 동작):
--   - 본인 데이터는 본인이 읽고 쓴다
--   - 같은 팀 사람의 근무/휴가/원격근무/출근계획은 팀원이면 읽을 수 있다
--   - 팀 관리(팀원 추가/역할 변경/내보내기/팀 삭제)는 팀장만
--   - 마스터 계정(profiles.is_master)은 전체 접근
--   - 서버 API 라우트는 SUPABASE_SERVICE_ROLE_KEY를 쓰므로 RLS를 우회한다
--
-- 적용 전 반드시 09번 주석 맨 아래의 "확인 절차"를 읽을 것.
-- ============================================================

-- ============================================================
-- 헬퍼 함수
--
-- team_members 정책 안에서 team_members를 다시 조회하면 정책이 재귀 호출되어
-- infinite recursion 오류가 난다. SECURITY DEFINER 함수는 호출자의 RLS를
-- 우회하므로 재귀를 끊는 용도로 쓴다.
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

-- ============================================================
-- profiles
--
-- 조회는 로그인한 사용자 전체에게 연다. 팀 목록/결재 화면 곳곳에서
-- 다른 사람의 이름과 이메일을 조인해 표시하기 때문이다.
-- (사내 도구라는 전제에서의 선택이다. 더 좁히려면 shares_team_with를 쓰되
--  결재 상대·팀 가입 신청 화면이 함께 막히므로 화면 수정이 따라야 한다)
-- 생성은 auth.users 트리거(handle_new_user, SECURITY DEFINER)가 하므로
-- INSERT 정책을 만들지 않는다.
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 본인 프로필(이름/총휴가)만 수정. 마스터는 회원 관리 화면에서 전체 수정
CREATE POLICY profiles_update_own_or_master
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_master())
  WITH CHECK (id = auth.uid() OR public.is_master());

-- is_master는 행 단위 정책으로 막을 수 없다.
-- 위 UPDATE 정책은 "본인 행"이면 통과시키는데 RLS는 컬럼을 구분하지 않으므로
-- 일반 사용자가 자기 행의 is_master를 true로 바꿔 마스터가 될 수 있다
-- (마이페이지가 이미 본인 프로필을 UPDATE하므로 실제로 도달 가능한 경로다).
-- 컬럼 단위 방어는 트리거로 한다.
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
-- teams
--
-- 전체 팀 목록을 보여주고 거기서 가입 신청을 하는 구조라 조회는 전체 공개.
-- ============================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_select_authenticated
  ON public.teams FOR SELECT TO authenticated
  USING (true);

CREATE POLICY teams_insert_self
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY teams_delete_admin
  ON public.teams FOR DELETE TO authenticated
  USING (public.is_team_admin(id) OR public.is_master());

-- ============================================================
-- team_members
-- ============================================================
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 내 소속 + 내가 속한 팀의 팀원 목록
CREATE POLICY team_members_select
  ON public.team_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_member(team_id)
    OR public.is_master()
  );

-- 팀 생성 시 본인을 팀장으로 넣는 경우(user_id = 본인)와
-- 팀장이 가입 신청을 승인해 남을 넣는 경우를 모두 허용
CREATE POLICY team_members_insert
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  );

-- 역할 변경, 정렬 순서 변경은 팀장만
CREATE POLICY team_members_update_admin
  ON public.team_members FOR UPDATE TO authenticated
  USING (public.is_team_admin(team_id) OR public.is_master())
  WITH CHECK (public.is_team_admin(team_id) OR public.is_master());

-- 팀장의 내보내기 / 팀 삭제, 마스터의 강제 탈퇴, 본인의 탈퇴
CREATE POLICY team_members_delete
  ON public.team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  );

-- ============================================================
-- team_requests (팀 가입 신청)
-- ============================================================
ALTER TABLE public.team_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_requests_select
  ON public.team_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  );

CREATE POLICY team_requests_insert_self
  ON public.team_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인의 재신청(status를 pending으로 되돌림)과 팀장의 승인/반려
CREATE POLICY team_requests_update
  ON public.team_requests FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  );

CREATE POLICY team_requests_delete
  ON public.team_requests FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_admin(team_id)
    OR public.is_master()
  );

-- ============================================================
-- work_logs / vacations / remote_works / commute_plans
--
-- 네 테이블 모두 user_id 하나로 소유자가 정해지고 접근 규칙이 같다.
-- 조회: 본인 + 같은 팀 사람 + 마스터
-- 쓰기: 본인만 (삭제는 마스터의 강제 탈퇴 처리를 위해 열어둔다)
-- ============================================================

-- work_logs
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_logs_select
  ON public.work_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.shares_team_with(user_id)
    OR public.is_master()
  );

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
  USING (
    user_id = auth.uid()
    OR public.shares_team_with(user_id)
    OR public.is_master()
  );

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
  USING (
    user_id = auth.uid()
    OR public.shares_team_with(user_id)
    OR public.is_master()
  );

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
  USING (
    user_id = auth.uid()
    OR public.shares_team_with(user_id)
    OR public.is_master()
  );

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
-- work_log_matters_work_log_id_idx(007)가 있어 EXISTS 조회는 인덱스를 탄다.
-- ============================================================
ALTER TABLE public.work_log_matters ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_log_matters_select
  ON public.work_log_matters FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_logs w
      WHERE w.id = work_log_id
        AND (
          w.user_id = auth.uid()
          OR public.shares_team_with(w.user_id)
          OR public.is_master()
        )
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
      WHERE w.id = work_log_id
        AND w.user_id = auth.uid()
    )
  );

-- ============================================================
-- approval_requests (결재)
--
-- 조회 범위는 결재 페이지의 기존 쿼리(내 요청 / 내가 결재권자 / 내 팀)와 같다.
-- ============================================================
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_select
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR public.is_team_member(team_id)
    OR public.is_master()
  );

CREATE POLICY approval_requests_insert_self
  ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- 신청자의 수정/취소, 결재권자의 승인/반려/취소요청 처리
CREATE POLICY approval_requests_update
  ON public.approval_requests FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR public.is_master()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR approver_id = auth.uid()
    OR public.is_master()
  );

-- DELETE 정책은 만들지 않는다. 회원 강제 탈퇴 시의 삭제는
-- /api/admin/delete-user가 서비스 롤 키로 처리한다.

-- ============================================================
-- substitute_holidays (대체공휴일)
--
-- 달력 표시에 모두가 읽어야 하고, 등록/삭제는 마스터 전용 화면에만 있다.
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
--      npx supabase db reset      (로컬 DB를 001~009로 새로 만든다)
--
-- 2) 계정 두 개 이상으로 아래를 직접 확인한다.
--    - 근무기록 저장/수정/삭제, 안건별 공수 저장
--    - 휴가/원격근무 토글, 주차별 출근계획 저장
--    - 팀 생성 -> 다른 계정으로 가입 신청 -> 팀장이 승인
--    - 팀 상세에서 팀원의 주간/월간 근무시간이 보이는지
--    - 결재 신청 -> 결재권자 계정에서 승인/반려 -> 취소 요청
--    - 리포트 페이지 합계가 나오는지
--    - 마스터 계정의 회원 목록/대체공휴일 등록/강제 탈퇴
--
-- 3) 막혔는지 확인하려는 것(이게 이번 작업의 목적):
--    같은 팀이 아닌 계정으로 /team/<남의 팀 id>를 열었을 때
--    팀원 목록과 근무기록이 비어 보여야 한다.
--
-- 4) 문제가 없으면 운영에 적용한다.
--      npx supabase db push
--
-- 되돌리려면 각 테이블에 대해
--   ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
-- 를 실행하면 정책을 지우지 않고도 즉시 원복된다.
-- ============================================================
