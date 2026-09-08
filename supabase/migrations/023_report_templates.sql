-- ============================================================
-- 서포트리스트(엑셀) 양식 업로드
--
-- 총괄 관리자가 매월 바뀔 수 있는 서포트리스트 엑셀 서식(TRENGKR_..._SUPPORT_LIST_....xlsx)을
-- 업로드해두면, 리포트 페이지의 "엑셀로 출력" 기능이 이 서식의 정해진 셀에
-- 본인의 근무시간을 채워 넣어 내려받게 한다.
--
-- 파일 자체는 Supabase Storage(비공개 버킷)에 두고, 여기서는 어떤 파일이
-- 최신 양식인지 가리키는 메타데이터만 관리한다. 실제 업로드/다운로드는
-- /api/admin/report-template, /api/report/export-excel 라우트가 서비스 롤 키로만
-- 수행하므로, 이 테이블과 버킷에는 브라우저가 직접 쓰는 RLS 정책을 두지 않는다
-- (general_admins 등 기존 관리용 테이블과 같은 패턴).
-- 생성일: 2026-09-08
-- ============================================================

insert into storage.buckets (id, name, public)
values ('report-templates', 'report-templates', false)
on conflict (id) do nothing;

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  original_filename text not null,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists report_templates_uploaded_at_idx
  on public.report_templates (uploaded_at desc);

alter table public.report_templates disable row level security;
