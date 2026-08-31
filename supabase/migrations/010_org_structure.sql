-- ============================================================
-- 조직 구조 개편: 부문(Division) / 부서(Department) 신설
--
-- 설계 원칙
-- - team_members는 전혀 건드리지 않는다 (팀장 = role='admin', 기존 그대로)
-- - 팀장은 지금처럼 team_members.role, 부문장/부서장은 head_user_id 컬럼("자리")으로 표현
-- - 팀이 없는 "부서 직접 소속" 사용자만 department_memberships에 들어간다
--   (팀이 있는 사용자는 team_members -> teams.department_id로 부서/부문이 자동으로 유도됨)
-- - 기존 teams는 전부 임시 "미지정 부문 / 미지정 부서" 밑으로 일괄 배치.
--   실제 배치는 관리자가 이후 화면(/org) 또는 DB에서 직접 재배치한다.
-- 생성일: 2026-08-25
-- ============================================================

-- 부문
create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  head_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 부서
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  name text not null,
  head_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division_id, name)
);

-- 팀을 부서에 연결 (nullable로 시작 -> 마이그레이션 후 채워짐)
alter table public.teams
  add column if not exists department_id uuid references public.departments(id);

-- 부서 직접 소속 (팀이 없는 사용자 전용)
create table if not exists public.department_memberships (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (department_id, user_id)
);

-- RLS는 이번 작업 범위에서 제외 (다른 테이블과 동일하게 비활성 상태 유지)
alter table public.divisions disable row level security;
alter table public.departments disable row level security;
alter table public.department_memberships disable row level security;

-- ------------------------------------------------------------
-- 기존 데이터 마이그레이션: 모든 기존 팀을 "미지정 부문 / 미지정 부서"로 일괄 배치
-- (관리자가 나중에 /org 화면 또는 DB에서 실제 부문/부서로 재배치)
-- ------------------------------------------------------------

insert into public.divisions (name)
values ('미지정 부문')
on conflict (name) do nothing;

insert into public.departments (division_id, name)
select d.id, '미지정 부서'
from public.divisions d
where d.name = '미지정 부문'
on conflict (division_id, name) do nothing;

update public.teams
set department_id = (
  select dep.id
  from public.departments dep
  join public.divisions dv on dv.id = dep.division_id
  where dv.name = '미지정 부문' and dep.name = '미지정 부서'
  limit 1
)
where department_id is null;
