import { createClient } from '@supabase/supabase-js'

// 서버 전용 (service role) 클라이언트 — RLS를 우회하므로 route.ts(API) 안에서만 사용해야 합니다.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
