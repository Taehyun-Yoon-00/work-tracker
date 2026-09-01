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

  // work_logs / vacations / remote_works / commute_plans / team_members /
  // team_requests / approval_requests(requester_id) / department_memberships /
  // department_approvers는 모두 profiles(id)를 ON DELETE CASCADE로 참조하므로
  // profiles 삭제만으로 함께 정리된다. 여기서 하나씩 미리 지울 필요가 없다.
  //
  // teams.created_by / approval_requests.approver_id / divisions.head_user_id /
  // departments.head_user_id / general_admins.created_by는 016_delete_user_fks.sql에서
  // ON DELETE SET NULL로 바꿔뒀으므로 이 역시 profiles 삭제가 자동으로 처리한다.
  // (이 마이그레이션이 적용되지 않은 환경에서는 아래 profiles 삭제가 외래키 위반으로
  //  실패할 수 있으며, 그 경우 에러 메시지로 알 수 있다.)
  const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
  if (profileError) {
    return NextResponse.json(
      { error: '프로필 삭제 실패: ' + profileError.message },
      { status: 500 }
    )
  }

  // Auth 계정 삭제
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
