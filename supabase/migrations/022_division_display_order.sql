-- ============================================================
-- 부문(division) 표시 순서(display_order) 지원
--
-- 부서/팀/부서 직속 인원은 이미 015_org_display_order.sql에서 display_order를
-- 지원하지만, 부문 자체는 지금까지 이름순으로만 표시됐다. 조직 관리 화면에서
-- 부문 순서도 드래그로 바꿀 수 있도록 컬럼을 추가한다.
--
-- 기본값은 기존 표시 순서(이름순)를 그대로 초기값으로 채워서, 마이그레이션
-- 직후에는 화면에 보이는 순서가 바뀌지 않도록 한다.
-- 생성일: 2026-09-03
-- ============================================================

alter table public.divisions
  add column if not exists display_order integer not null default 0;

do $$
declare
  rec record;
  i integer;
begin
  i := 0;
  for rec in
    select id from public.divisions order by name
  loop
    update public.divisions set display_order = i where id = rec.id;
    i := i + 1;
  end loop;
end $$;
