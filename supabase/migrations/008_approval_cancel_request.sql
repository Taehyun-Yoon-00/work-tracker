-- ============================================================
-- 기승인 건에 대한 "취소 요청" 워크플로우 지원
-- 요청자가 이미 승인된 건에 대해 취소를 요청하면 cancel_requested = true가 되고,
-- 결재권자가 이를 승인하면 status가 'cancelled'로 바뀌며 cancel_requested는 false로 초기화된다.
-- 결재권자가 취소 요청을 거절하면 cancel_requested만 false로 되돌아가고 status는 'approved'를 유지한다.
-- 생성일: 2026-08-13
-- ============================================================

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
