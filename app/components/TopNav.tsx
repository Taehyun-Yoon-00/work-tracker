'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppBadge } from '../hooks/useAppBadge'
import { useNotifications } from '../hooks/useNotifications'
import { usePushSubscription } from '../hooks/usePushSubscription'
import NotificationCenter from './notifications/NotificationCenter'
import MenuDrawer from './MenuDrawer'

export default function TopNav() {
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id)
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  const { notifications, unreadCount, loading, refetch, markAsRead, markAllAsRead } =
    useNotifications(userId)

  // App Badge는 "읽지 않은 Notification 개수" 기준
  useAppBadge(unreadCount)

  // 어느 페이지에 있든(로그인 직후부터) 푸시 구독이 되도록 여기서 호출
  usePushSubscription(userId)

  return (
    <div className="fixed top-0 inset-x-0 h-11 bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 z-40">
      {userId && (
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="메뉴 열기"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-white transition"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        </button>
      )}

      <img
        src="/logo/toray-logo.png"
        alt="TORAY"
        className="h-[90px] w-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      />

      {userId && (
        <button
          onClick={() => {
            if (!open) refetch()
            setOpen((v) => !v)
          }}
          aria-label="알림"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-white transition"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
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

      {userId && <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
