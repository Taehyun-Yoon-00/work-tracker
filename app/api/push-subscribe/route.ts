import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/app/lib/apiAuth'

// 서버 전용 service role 키로 RLS를 우회해 안전하게 upsert
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // 세션 사용자로 고정한다. body의 userId를 믿으면 남의 계정에
    // 내 구독을 붙여 타인의 푸시를 대신 받을 수 있다.
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
    }

    const body = await req.json()
    const { subscription } = body

    if (!subscription) {
      return NextResponse.json({ error: 'subscription 누락' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({ user_id: user.id, subscription }, { onConflict: 'user_id,subscription' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('push-subscribe error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
