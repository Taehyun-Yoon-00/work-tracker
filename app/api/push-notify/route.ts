import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { sendPushToUser } from '../../lib/notifications'

const TYPE_LABEL: Record<string, string> = {
  vacation: '휴가',
  remote: '원격근무',
  holiday: '휴일출근',
}

// 범용 push 발송 엔드포인트. 뱃지 값은 항상 "읽지 않은 Notification 개수" 기준입니다.
// (이 엔드포인트는 Notification 행을 만들지 않으므로, Notification 생성이 필요한 흐름은
//  notify-approval을 사용하세요.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, title, message, type, url } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId 누락' }, { status: 400 })
    }

    await sendPushToUser(
      supabaseAdmin,
      userId,
      title || '근무관리 시스템',
      message || (type ? `${TYPE_LABEL[type] ?? type} 결재 요청이 도착했어요.` : '새 알림이 도착했어요.'),
      url || '/approval'
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('push-notify error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
