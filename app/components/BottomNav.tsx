'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const fetchPending = async () => {
      const { data: { user } } = await supabase.auth.getUser()
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
    { label: '근무기록', path: '/', icon: '🕐' },
    { label: '팀', path: '/team', icon: '👥' },
    { label: '결재', path: '/approval', icon: '📋' },
    { label: '마이페이지', path: '/mypage', icon: '👤' },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path ||
            (tab.path !== '/' && pathname.startsWith(tab.path))
          return (
            <button
              key={tab.path}
              onClick={() => router.push(tab.path)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition relative ${
                isActive ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <span className="text-xl relative">
                {tab.icon}
                {tab.path === '/approval' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
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