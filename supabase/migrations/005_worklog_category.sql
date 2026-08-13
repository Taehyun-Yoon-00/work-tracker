-- ============================================================
-- work_logs에 "구분(카테고리)" / "청구 안건" 컬럼 추가
-- 고정 카테고리(수주/자사업무/타부서업무/영업지원) 중 하나를 선택하거나,
-- '청구안건'을 선택해서 장소/구분/내용/코스트코드를 직접 입력하는 기능.
-- 생성일: 2026-07-13
-- ============================================================

ALTER TABLE public.work_logs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS matter_place text,
  ADD COLUMN IF NOT EXISTS matter_division text,
  ADD COLUMN IF NOT EXISTS matter_content text,
  ADD COLUMN IF NOT EXISTS matter_cost_code text;

-- category는 아래 5개 값 중 하나이거나(고정 카테고리 4개 + 청구안건), 미입력(NULL, 과거 기록 호환)
ALTER TABLE public.work_logs
  DROP CONSTRAINT IF EXISTS work_logs_category_check;
ALTER TABLE public.work_logs
  ADD CONSTRAINT work_logs_category_check
  CHECK (category IS NULL OR category IN ('수주', '자사업무', '타부서업무', '영업지원', '청구안건'));

-- category='청구안건'일 때만 매터 필드가 채워지도록 보장 (데이터 정합성)
ALTER TABLE public.work_logs
  DROP CONSTRAINT IF EXISTS work_logs_matter_fields_check;
ALTER TABLE public.work_logs
  ADD CONSTRAINT work_logs_matter_fields_check
  CHECK (
    category = '청구안건'
    OR (matter_place IS NULL AND matter_division IS NULL AND matter_content IS NULL AND matter_cost_code IS NULL)
  );
