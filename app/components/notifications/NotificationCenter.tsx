'use client'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/ko'
import { useRouter } from 'next/navigation'
import type { Notification } from '../../lib/types'
import type { LucideIcon } from 'lucide-react'
import { Inbox, CheckCircle2, XCircle, Bell } from 'lucide-react'

dayjs.extend(relativeTime)
dayjs.locale('ko')

const TYPE_META: Record<string, { Icon: LucideIcon; style: string }> = {
  REQUEST: { Icon: Inbox, style: 'bg-blue-50 text-blue-500' },
  APPROVED: { Icon: CheckCircle2, style: 'bg-green-50 text-green-500' },
  REJECTED: { Icon: XCircle, style: 'bg-red-50 text-red-500' },
}

interface NotificationCenterProps {
  notifications: Notification[]
  loading: boolean
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onClose: () => void
}

export default function NotificationCenter({
  notifications,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
}: NotificationCenterProps) {
  const router = useRouter()

  const handleClick = (n: Notification) => {
    if (!n.is_read) onMarkAsRead(n.id)
    onClose()
    if (n.approval_id) {
      router.push(`/approval?requestId=${n.approval_id}`)
    } else {
      router.push('/approval')
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  return (
    <>
      {/* 바깥 영역 클릭 시 닫힘 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-4 top-full mt-2 w-80 max-w-[90vw] max-h-[70vh] overflow-y-auto bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg z-50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-700">
          <h3 className="font-semibold text-sm dark:text-white">알림</h3>
          {hasUnread && (
            <button onClick={onMarkAllAsRead} className="text-xs text-blue-500 hover:text-blue-600">
              모두 읽음
            </button>
          )}
        </div>

        {loading && <p className="px-4 py-8 text-center text-xs text-gray-400">불러오는 중…</p>}

        {!loading && notifications.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-gray-400">알림이 없어요.</p>
        )}

        {!loading &&
          notifications.map((n) => {
            const meta = TYPE_META[n.type] ?? { Icon: Bell, style: 'bg-gray-100 text-gray-500' }
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 dark:border-zinc-700/60 last:border-b-0 flex gap-3 transition ${
                  n.is_read
                    ? 'bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
                    : 'bg-blue-50/60 dark:bg-blue-500/10 hover:bg-blue-50 dark:hover:bg-blue-500/20'
                }`}
              >
                <span
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${meta.style}`}
                >
                  <meta.Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-sm truncate ${n.is_read ? 'text-gray-700 dark:text-zinc-200' : 'font-semibold text-gray-900 dark:text-white'}`}
                    >
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </span>
                  {n.message && (
                    <span className="block text-xs text-gray-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </span>
                  )}
                  <span className="block text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
                    {dayjs(n.created_at).fromNow()}
                  </span>
                </span>
              </button>
            )
          })}
      </div>
    </>
  )
}
