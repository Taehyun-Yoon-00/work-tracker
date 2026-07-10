import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationType } from './types'

webpush.setVapidDetails(
  process.env.VAPID_MAILTO!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

interface CreateNotificationParams {
  receiverId: string
  approvalId?: string | null
  type: NotificationType
  title: string
  message?: string | null
}

/**
 * Notification row 하나를 생성합니다. (알림 흐름의 시작점)
 * admin(service role) 클라이언트로만 호출해야 합니다 — RLS는 클라이언트의 직접 INSERT를 막습니다.
 */
export async function createNotification(
  admin: SupabaseClient,
  { receiverId, approvalId, type, title, message }: CreateNotificationParams
) {
  const { data, error } = await admin
    .from('notifications')
    .insert({
      receiver_id: receiverId,
      approval_id: approvalId ?? null,
      type,
      title,
      message: message ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('알림 생성 실패:', error.message)
    return null
  }
  return data
}

/** 읽지 않은 Notification 개수 (App Badge 기준) */
export async function getUnreadNotificationCount(admin: SupabaseClient, userId: string) {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('is_read', false)
  return count ?? 0
}

/**
 * 특정 유저의 모든 구독 기기로 Push를 발송합니다.
 * Badge 값은 항상 "읽지 않은 Notification 개수" 기준으로 계산합니다.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  url = '/approval'
) {
  try {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId)

    if (!subs || subs.length === 0) return

    const unreadCount = await getUnreadNotificationCount(admin, userId)

    const payload = JSON.stringify({
      title,
      body,
      url,
      unreadCount,
    })

    const staleSubIds: string[] = []
    await Promise.all(
      subs.map(async (s: { id: string; subscription: webpush.PushSubscription }) => {
        try {
          await webpush.sendNotification(s.subscription, payload)
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            staleSubIds.push(s.id)
          } else {
            console.error('push 발송 실패:', err)
          }
        }
      })
    )

    if (staleSubIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', staleSubIds)
    }
  } catch (err) {
    console.error('push 발송 실패:', err)
  }
}

/**
 * Notification 생성 → DB 저장 → Push 발송 → Badge 업데이트 순서를 한 번에 처리합니다.
 */
export async function notifyAndPush(
  admin: SupabaseClient,
  params: CreateNotificationParams & { url?: string }
) {
  const notification = await createNotification(admin, params)
  if (!notification) return null

  await sendPushToUser(admin, params.receiverId, params.title, params.message || '', params.url)

  return notification
}
