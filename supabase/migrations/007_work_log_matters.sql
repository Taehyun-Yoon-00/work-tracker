-- ============================================================
-- 하루에 안건을 여러 개 기록할 수 있도록 정규화
-- work_logs(하루 1행)에 있던 category/matter_* 단일 컬럼을 없애고,
-- work_log_matters(하루당 여러 행, 각 행마다 구분 + 시간)로 분리
-- 생성일: 2026-07-13
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_log_matters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  work_log_id uuid NOT NULL REFERENCES public.work_logs(id) ON DELETE CASCADE,
  category text NOT NULL,
  hours numeric(4,2) NOT NULL,
  matter_place text,
  matter_division text,
  matter_content text,
  matter_cost_code text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT work_log_matters_pkey PRIMARY KEY (id),
  CONSTRAINT work_log_matters_category_check
    CHECK (category IN ('수주', '자사업무', '타부서업무', '영업지원', '청구안건')),
  CONSTRAINT work_log_matters_hours_check CHECK (hours > 0),
  CONSTRAINT work_log_matters_fields_check CHECK (
    category = '청구안건'
    OR (matter_place IS NULL AND matter_division IS NULL AND matter_content IS NULL AND matter_cost_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS work_log_matters_work_log_id_idx
  ON public.work_log_matters (work_log_id);

-- work_logs에 이미 저장돼 있던 category/matter_* 값을 work_log_matters로 1건씩 이관
-- (하루 총 근무시간을 그대로 안건 1개의 시간으로 넣어줌)
INSERT INTO public.work_log_matters (work_log_id, category, hours, matter_place, matter_division, matter_content, matter_cost_code, sort_order)
SELECT
  id,
  category,
  ROUND(
    (EXTRACT(EPOCH FROM (
      (end_time + (CASE WHEN is_next_day THEN interval '1 day' ELSE interval '0' END))
      - start_time
    )) / 3600.0) - (break_minutes / 60.0)
  , 2),
  matter_place, matter_division, matter_content, matter_cost_code,
  0
FROM public.work_logs
WHERE category IS NOT NULL;

-- work_logs는 이제 시간/메모 등 "하루 1행" 정보만 남기고 구분/안건 컬럼은 제거
ALTER TABLE public.work_logs DROP CONSTRAINT IF EXISTS work_logs_category_check;
ALTER TABLE public.work_logs DROP CONSTRAINT IF EXISTS work_logs_matter_fields_check;
ALTER TABLE public.work_logs
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS matter_place,
  DROP COLUMN IF EXISTS matter_division,
  DROP COLUMN IF EXISTS matter_content,
  DROP COLUMN IF EXISTS matter_cost_code;

-- 참고: work_logs에 RLS가 걸려있지 않아 이 테이블도 동일하게 RLS 없이 둠 (기존 보안 모델과 일관성 유지)
