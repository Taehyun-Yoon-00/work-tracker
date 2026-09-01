import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster } from '@/app/lib/apiAuth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 테스트/개발 목적으로 이메일 인증 없이 계정을 즉시 생성한다.
// Admin API(email_confirm: true)로 만들기 때문에 프로젝트의 "이메일 인증 필수" 설정을
// 건드리지 않고도(=실제 사용자 가입 흐름은 그대로 유지한 채) 계정을 바로 로그인 가능한 상태로 만든다.
//
// 예전에는 "이 라우트를 부르는 /admin 화면에서 이미 접근을 막고 있다"는 전제로
// 서버 쪽 확인이 없었다. 화면의 버튼을 숨기는 것과 실제로 호출을 막는 것은 다르므로,
// URL만 알면 누구나 계정을 만들 수 있었다. 여기서도 마스터 여부를 직접 확인한다.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  }
  if (!(await isMaster(user.id))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
  }

  const { email, name, password } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const finalPassword = password || Math.random().toString(36).slice(-10)

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: finalPassword,
    email_confirm: true, // 이메일 인증 절차를 건너뛰고 바로 로그인 가능하게 만든다
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const userId = data.user?.id
  if (userId && name) {
    // handle_new_user 트리거가 profiles row를 만들어 두므로, 표시 이름만 업데이트한다.
    await supabaseAdmin.from('profiles').update({ name }).eq('id', userId)
  }

  return NextResponse.json({ success: true, userId, email, password: finalPassword })
}
