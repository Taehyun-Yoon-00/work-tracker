'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppBadge } from '../hooks/useAppBadge'
import { useNotifications } from '../hooks/useNotifications'
import NotificationCenter from './notifications/NotificationCenter'

export default function TopNav() {
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id)
    }
    getUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id)
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  const { notifications, unreadCount, loading, refetch, markAsRead, markAllAsRead } = useNotifications(userId)

  // App Badge는 "읽지 않은 Notification 개수" 기준
  useAppBadge(unreadCount)

  return (
    <div className="fixed top-0 left-0 right-0 bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 z-40">
      <div className="max-w-2xl mx-auto relative flex items-center justify-center h-14 px-4">
        <img src="/logo/toray-logo.png" alt="TORAY" className="h-6 w-auto" />

        {userId && (
          <button
            onClick={() => {
              if (!open) refetch()
              setOpen((v) => !v)
            }}
            aria-label="알림"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700 transition relative"
          >
            <span className="text-xl">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {open && userId && (
          <NotificationCenter
            notifications={notifications}
            loading={loading}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
