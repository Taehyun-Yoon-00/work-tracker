'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { Clock, BarChart3, Users, ClipboardList } from 'lucide-react'
import { useMyAffiliations } from '../hooks/useMyAffiliations'

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const { items: affiliations } = useMyAffiliations()

  useEffect(() => {
    const fetchPending = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('approval_requests')
        .select('id', { count: 'exact' })
        .eq('approver_id', user.id)
        .eq('status', 'pending')
      setPendingCount(count || 0)
    }
    fetchPending()
  }, [pathname])

  const tabs = [
    { label: '근무기록', path: '/', Icon: Clock },
    { label: '리포트', path: '/report', Icon: BarChart3 },
    { label: '내 소속', path: '/team', Icon: Users },
    { label: '결재', path: '/approval', Icon: ClipboardList },
  ]

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 z-50">
      <div className="max-w-2xl mx-auto flex h-full">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.path || (tab.path !== '/' && pathname.startsWith(tab.path))
          return (
            <button
              key={tab.path}
              onClick={() =>
                // 소속이 정확히 1개면 /team을 거치지 않고 그 소속으로 바로 간다.
                // (여러 개면 /team이 기존 우선순위대로 보내주므로 그대로 /team으로 간다.)
                router.push(
                  tab.path === '/team' && affiliations.length === 1 ? affiliations[0].path : tab.path
                )
              }
              className={`flex-1 h-full pt-2 flex flex-col items-center justify-start gap-0.5 transition relative ${
                isActive
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              <span className="relative">
                <tab.Icon size={22} strokeWidth={1.75} />
                {tab.path === '/approval' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[11px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
