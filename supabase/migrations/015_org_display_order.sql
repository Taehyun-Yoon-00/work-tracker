-- ============================================================
-- 조직 표시 순서(display_order) 지원
--
-- 조직 관리 화면에서 드래그 앤 드롭으로 순서를 바꿀 수 있어야 하는 대상:
--   - 부문 안의 부서 목록          -> departments.display_order
--   - 부서 안의 팀 목록            -> teams.display_order
--   - 부서 직속 인원 목록          -> department_memberships.display_order
--   - (팀 소속 인원 목록은 기존 team_members.display_order를 그대로 사용)
--
-- 기본값은 생성 순서(created_at)를 그대로 따르도록 임시 값을 채워둔다.
-- 생성일: 2026-08-30
-- ============================================================

alter table public.departments
  add column if not exists display_order integer not null default 0;

alter table public.teams
  add column if not exists display_order integer not null default 0;

alter table public.department_memberships
  add column if not exists display_order integer not null default 0;

-- 기존 로우들은 생성일 순서를 그대로 초기 표시 순서로 사용한다.
do $$
declare
  rec record;
  i integer;
begin
  i := 0;
  for rec in
    select id from public.departments order by division_id, created_at
  loop
    update public.departments set display_order = i where id = rec.id;
    i := i + 1;
  end loop;

  i := 0;
  for rec in
    select id from public.teams order by department_id, created_at
  loop
    update public.teams set display_order = i where id = rec.id;
    i := i + 1;
  end loop;

  i := 0;
  for rec in
    select id from public.department_memberships order by department_id, created_at
  loop
    update public.department_memberships set display_order = i where id = rec.id;
    i := i + 1;
  end loop;
end $$;
