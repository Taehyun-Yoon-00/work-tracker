-- ============================================================
-- push_subscriptions 테이블
-- Web Push 구독 정보(endpoint, keys 등)를 저장.
-- usePushSubscription 훅이 로그인한 사용자의 브라우저에서
-- 직접(anon/user 세션으로) upsert하므로 RLS 정책이 필요함.
-- 생성일: 2026-07-11
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  -- usePushSubscription.ts / push-subscribe route가 upsert 시
  -- onConflict: 'user_id,subscription' 을 사용하므로 동일한 조합에 유니크 제약 필요
  CONSTRAINT push_subscriptions_user_subscription_key UNIQUE (user_id, subscription)
);

-- 유저별 구독 목록 조회(푸시 발송 시)에 자주 쓰이는 인덱스
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독만 조회 가능
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 본인 명의로만 구독 생성 가능 (usePushSubscription 훅이 클라이언트에서 직접 insert)
CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- upsert 시 conflict 발생하면 UPDATE 경로를 타므로 본인 행에 한해 허용
CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인 구독 삭제(로그아웃, 알림 거부 등 추후 기능 대비)도 허용
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 참고: app/lib/notifications.ts의 sendPushToUser / 만료된 구독 정리(delete)는
-- SUPABASE_SERVICE_ROLE_KEY(서버 admin 클라이언트)로 실행되어 위 RLS를 우회합니다.
