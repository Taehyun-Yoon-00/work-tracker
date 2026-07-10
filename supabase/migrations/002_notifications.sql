-- ============================================================
-- notifications 테이블
-- "결재 요청"이 아닌 "알림"을 Push / App Badge의 기준으로 삼기 위한 테이블
-- 생성일: 2026-07-10
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approval_id uuid REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_type_check CHECK (type IN ('REQUEST', 'APPROVED', 'REJECTED'))
);

-- 목록/뱃지 조회 시 자주 쓰는 조합에 대한 인덱스
CREATE INDEX IF NOT EXISTS notifications_receiver_created_idx
  ON public.notifications (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_receiver_unread_idx
  ON public.notifications (receiver_id)
  WHERE is_read = false;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 본인에게 온 알림만 조회 가능
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (receiver_id = auth.uid());

-- 본인 알림의 읽음 상태만 수정 가능 (is_read 토글 용도)
CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- INSERT/DELETE 정책은 만들지 않습니다.
-- 알림 생성은 서버(API route)에서 SUPABASE_SERVICE_ROLE_KEY로 처리되며
-- 이 키는 RLS를 우회하므로 클라이언트에서 직접 INSERT할 수 없습니다.
