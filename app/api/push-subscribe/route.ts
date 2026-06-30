import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 서버 전용 service role 키로 RLS를 우회해 안전하게 upsert
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, subscription } = body

    if (!userId || !subscription) {
      return NextResponse.json({ error: 'userId 또는 subscription 누락' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
      { user_id: userId, subscription },
      { onConflict: 'user_id,subscription' }
    )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('push-subscribe error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
