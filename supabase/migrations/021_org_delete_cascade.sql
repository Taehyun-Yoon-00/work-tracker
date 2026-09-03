-- ============================================================
-- 조직 삭제 시 하위 항목이 있어도 삭제 가능하도록 FK 정리
--
-- 지금까지:
-- - teams.department_id 는 ON DELETE 옵션이 없어(NO ACTION), 팀이 남아있는
--   부서는 DB 단에서 삭제가 막혔다. (부문 삭제 시에도 그 부문의 부서를 거쳐
--   연쇄적으로 막힘)
-- - approval_requests.team_id 도 ON DELETE 옵션이 없어서, 결재 이력이 남아있는
--   팀은 삭제가 막혔다.
--
-- 이제부터:
-- - 부서를 삭제하면 그 산하 팀도 함께 삭제된다(팀 소속 인원은 team_members가
--   이미 CASCADE이므로 자동으로 미지정 상태가 된다).
-- - 부문을 삭제하면 이미 CASCADE로 연결된 부서 → 팀까지 연쇄적으로 정리된다.
-- - 팀을 삭제해도 과거 결재 이력(approval_requests)은 남기되, team_id만
--   NULL로 비워서 참조가 끊긴 채로 보존한다(레코드 자체를 지우지 않는다).
--
-- 애플리케이션(app/org/page.tsx)에서는 삭제 전 "몇 명이 미지정 상태가
-- 되는지" 안내하는 확인창을 띄우고, 이 안내에 동의해야 실제 삭제가 실행된다.
-- 생성일: 2026-09-03
-- ============================================================

do $$
declare
  v_constraint_name text;
begin
  -- teams.department_id: NO ACTION -> CASCADE
  select tc.constraint_name into v_constraint_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'teams'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'department_id'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.teams drop constraint %I', v_constraint_name);
  end if;

  alter table public.teams
    add constraint teams_department_id_fkey
    foreign key (department_id) references public.departments(id) on delete cascade;

  -- approval_requests.team_id: NO ACTION -> SET NULL (이력은 보존, 참조만 해제)
  select tc.constraint_name into v_constraint_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'approval_requests'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'team_id'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.approval_requests drop constraint %I', v_constraint_name);
  end if;

  alter table public.approval_requests
    add constraint approval_requests_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete set null;
end $$;
