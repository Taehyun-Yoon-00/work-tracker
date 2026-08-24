import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../lib/types'

/**
 * 로그인한 사용자의 Notification 목록/읽지 않은 개수를 관리하는 훅.
 * - 최신순 목록
 * - 읽지 않은 개수 (App Badge 기준)
 * - 클릭 시 읽음 처리
 */
export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  const fetchNotifications = async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications(data as Notification[])
    setLoading(false)
  }

  useEffect(() => {
    if (!userId) return
    fetchNotifications()

    // 실시간 반영: 다른 곳에서 알림이 새로 생기거나(INSERT) 읽음 처리되면(UPDATE) 바로 목록/뱃지에 반영
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          const created = payload.new as Notification
          setNotifications((prev) => {
            if (prev.some((n) => n.id === created.id)) return prev
            return [created, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as Notification
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        }
      )
      .subscribe()

    // 모바일 브라우저는 화면이 꺼지거나 앱이 백그라운드로 가면
    // Realtime WebSocket 연결을 강제로 끊어버림.
    // 다시 포그라운드로 돌아왔을 때 최신 상태를 강제로 다시 받아온다.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!userId) return
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      )
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('receiver_id', userId)
    },
    [userId]
  )

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', userId)
      .in('id', unreadIds)
  }, [userId, notifications])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return {
    notifications,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
  }
}
