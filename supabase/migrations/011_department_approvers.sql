-- ============================================================
-- 결재권자 위임 시스템
--
-- - 부서장(department.head_user_id)은 항상 자동으로 결재권자에 포함된다 (이 테이블에 넣을 필요 없음)
-- - 부서장이 위임한 추가 인원만 이 테이블에 들어간다
-- - 유형(휴가/원격근무/휴일근무)별로 위임 범위를 체크박스로 제한할 수 있다
-- - 위임 권한 자체(= 이 테이블에 행을 추가/삭제할 수 있는 권한)는 부서장 이상만 갖는다 (UI에서 제어, RLS는 이번 범위 아님)
-- ============================================================

create table if not exists public.department_approvers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_vacation boolean not null default true,
  can_remote boolean not null default true,
  can_holiday boolean not null default true,
  created_at timestamptz not null default now(),
  unique (department_id, user_id)
);

alter table public.department_approvers disable row level security;

-- 결재 요청이 어느 부서 맥락에서 올라왔는지 기록 (team_id는 팀이 있는 경우에만 채워짐, nullable 그대로 유지)
alter table public.approval_requests
  add column if not exists department_id uuid references public.departments(id);
