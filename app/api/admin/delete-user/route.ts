import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster } from '@/app/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // service role 키로 RLS를 우회하는 라우트다. 호출자 확인이 없으면
  // 아무나 임의 계정을 지울 수 있다.
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  }

  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // 본인 탈퇴(마이페이지)와 마스터의 강제 탈퇴(회원 관리)만 허용
  if (userId !== user.id && !(await isMaster(user.id))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
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
