import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * 로그인한 사용자의 브라우저를 Web Push에 구독시키고
 * 구독 정보를 Supabase(push_subscriptions)에 저장하는 훅.
 *
 * - Service Worker / Push API 미지원 환경에서는 조용히 무시됨
 * - 사용자가 알림 권한을 거부한 경우도 조용히 무시됨 (강제로 재요청하지 않음)
 * - 이미 구독되어 있으면 재구독하지 않고 그대로 둠
 */
export function usePushSubscription(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!VAPID_PUBLIC_KEY) {
      console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았어요.')
      return
    }

    let cancelled = false

    const subscribe = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
          // 알림 권한 확인 (이미 거부된 상태라면 요청하지 않고 종료)
          if (Notification.permission === 'denied') return

          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          })
        }

        if (cancelled || !subscription) return

        // Supabase에 구독 정보 저장 (이미 동일 구독이 있으면 upsert)
        const { error } = await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            subscription: subscription.toJSON(),
          },
          { onConflict: 'user_id,subscription' }
        )

        if (error) {
          console.error('push 구독 저장 실패:', error.message)
        }
      } catch (err) {
        console.error('push 구독 처리 중 오류:', err)
      }
    }

    subscribe()

    return () => {
      cancelled = true
    }
  }, [userId])
}
