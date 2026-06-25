import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // 관련 데이터 삭제 (Admin 권한으로 RLS 우회)
  await supabaseAdmin.from('work_logs').delete().eq('user_id', userId)
  await supabaseAdmin.from('vacations').delete().eq('user_id', userId)
  await supabaseAdmin.from('remote_works').delete().eq('user_id', userId)
  await supabaseAdmin.from('commute_plans').delete().eq('user_id', userId)
  await supabaseAdmin.from('team_members').delete().eq('user_id', userId)
  await supabaseAdmin.from('team_requests').delete().eq('user_id', userId)
  await supabaseAdmin.from('approval_requests').delete().eq('requester_id', userId)
  await supabaseAdmin.from('profiles').delete().eq('id', userId)

  // Auth 계정 삭제
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}