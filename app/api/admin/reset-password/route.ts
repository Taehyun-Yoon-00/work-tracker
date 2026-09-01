import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster } from '@/app/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // 응답으로 임시 비밀번호를 돌려주는 라우트다. 마스터만 호출할 수 있어야 한다.
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  }
  if (!(await isMaster(user.id))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
  }

  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // 임시 비밀번호로 초기화
  const tempPassword = Math.random().toString(36).slice(-8)

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tempPassword })
}
