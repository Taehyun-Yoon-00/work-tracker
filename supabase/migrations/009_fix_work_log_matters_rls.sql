-- ============================================================
-- work_log_matters 테이블에 RLS가 (아마 SQL Editor에서 테이블 생성 시
-- 자동으로) 켜져 있는데 정책이 하나도 없어서 모든 INSERT/UPDATE가
-- "new row violates row-level security policy" 에러로 막히는 문제 수정.
--
-- 이 프로젝트의 다른 테이블(work_logs, vacations, remote_works 등)은
-- 전부 RLS 없이 운영되고 있으므로, 동일한 보안 모델을 맞추기 위해
-- work_log_matters도 RLS를 끈다.
-- 생성일: 2026-08-24
-- ============================================================

ALTER TABLE public.work_log_matters DISABLE ROW LEVEL SECURITY;
