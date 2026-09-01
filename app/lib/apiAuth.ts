import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from './supabaseAdmin'

/**
 * 요청 쿠키의 세션에서 로그인 사용자를 확인한다. 로그인 상태가 아니면 null.
 *
 * API 라우트는 대부분 service role 키로 RLS를 우회하므로, 호출자가 누구인지는
 * 라우트가 직접 확인해야 한다. 이 함수 없이는 아무나 curl로 호출할 수 있다.
 * 세션 갱신은 하지 않으므로 setAll은 비워 둔다(라우트는 응답 쿠키를 쓰지 않는다).
 */
export async function getSessionUser() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  // getUser()는 Auth 서버에 토큰을 검증시킨다. getSession()은 쿠키를 그대로
  // 믿으므로 서버 측 권한 판단에 쓰면 안 된다.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

/** 해당 사용자가 마스터인지 확인한다. */
export async function isMaster(userId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_master')
    .eq('id', userId)
    .single()

  return data?.is_master === true
}
