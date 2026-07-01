import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

webpush.setVapidDetails(
  process.env.VAPID_MAILTO!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const TYPE_LABEL: Record<string, string> = {
  vacation: '휴가',
  remote: '원격근무',
  holiday: '휴일근무',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, title, message, type, url } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId 누락' }, { status: 400 })
    }

    // 해당 유저의 모든 구독 가져오기
    const { data: subs, error: subError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId)

    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 500 })
    }

    if (!subs || subs.length === 0) {
      // 구독 정보가 없으면 조용히 종료 (push를 못 받을 뿐, 에러는 아님)
      return NextResponse.json({ success: true, sent: 0 })
    }

    // 뱃지에 표시할 현재 pending 건수 계산 (해당 유저가 결재권자인 건)
    const { count: pendingCount } = await supabaseAdmin
      .from('approval_requests')
      .select('id', { count: 'exact', head: true })
      .eq('approver_id', userId)
      .eq('status', 'pending')

    const payload = JSON.stringify({
      title: title || '근무관리 시스템',
      body: message || (type ? `${TYPE_LABEL[type] ?? type} 결재 요청이 도착했어요.` : '새 알림이 도착했어요.'),
      url: url || '/approval',
      pendingCount: pendingCount ?? 0,
    })

    let sent = 0
    const staleSubIds: string[] = []

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(s.subscription, payload)
          sent++
        } catch (err: any) {
          // 만료되거나 무효화된 구독은 정리 대상으로 표시
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            staleSubIds.push(s.id)
          } else {
            console.error('push 발송 실패:', err?.message || err)
          }
        }
      })
    )

    if (staleSubIds.length > 0) {
      await supabaseAdmin.from('push_subscriptions').delete().in('id', staleSubIds)
    }

    return NextResponse.json({ success: true, sent })
  } catch (err) {
    console.error('push-notify error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
