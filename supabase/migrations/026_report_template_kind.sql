-- ============================================================
-- report_templates.kind 추가 — 양식 종류 구분
--
-- 배경: 리포트 페이지의 출력 기능이 "서포트리스트" 하나에서
-- "서포트리스트 + 근무관리표" 두 가지로 늘어났다. 양식 파일은 종류마다 따로
-- 관리되어야 하므로(한쪽을 새로 올려도 다른 쪽 양식이 바뀌면 안 된다)
-- 어떤 용도의 양식인지 kind 컬럼으로 구분한다.
--
--   support_list : 서포트리스트 (기존 양식 — 기존 행은 모두 이 값이 된다)
--   attendance   : 근무관리표(勤務管理表)
--
-- 권한은 기존과 동일하다. 양식 업로드/조회는 총괄 관리자·마스터만 가능하고,
-- 파일 자체는 비공개 버킷에 있어 서버 라우트(service role)만 접근한다.
-- 일반 사용자는 양식 원본을 받을 수 없고, 본인 데이터가 채워진 결과물만 내려받는다.
-- 생성일: 2026-11-09
-- ============================================================

alter table public.report_templates
  add column if not exists kind text not null default 'support_list';

alter table public.report_templates
  drop constraint if exists report_templates_kind_check;

alter table public.report_templates
  add constraint report_templates_kind_check
  check (kind in ('support_list', 'attendance'));

drop index if exists public.report_templates_uploaded_at_idx;

create index if not exists report_templates_kind_uploaded_at_idx
  on public.report_templates (kind, uploaded_at desc);
