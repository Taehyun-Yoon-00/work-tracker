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

  // 아래 컬럼들은 profiles를 참조하지만 ON DELETE CASCADE가 걸려있지 않다.
  // 그대로 두고 profiles를 삭제하면 외래키 제약 위반으로 삭제 자체가 실패하므로,
  // 삭제 전에 참조를 미리 정리한다 (팀 생성자 → null, 부문장/부서장/총괄관리자 → 해제,
  // 다른 사람 결재 요청의 승인자로 지정돼 있었다면 → null).
  await supabaseAdmin.from('teams').update({ created_by: null }).eq('created_by', userId)
  await supabaseAdmin.from('approval_requests').update({ approver_id: null }).eq('approver_id', userId)
  await supabaseAdmin.from('divisions').update({ head_user_id: null }).eq('head_user_id', userId)
  await supabaseAdmin.from('departments').update({ head_user_id: null }).eq('head_user_id', userId)
  await supabaseAdmin.from('general_admins').update({ created_by: null }).eq('created_by', userId)
  await supabaseAdmin.from('general_admins').delete().eq('user_id', userId)

  await supabaseAdmin.from('profiles').delete().eq('id', userId)

  // Auth 계정 삭제
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}