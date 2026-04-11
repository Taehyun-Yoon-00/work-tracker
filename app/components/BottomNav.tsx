'use client'

import { useRouter, usePathname } from 'next/navigation'

export default function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()

  const tabs = [
    { label: '근무기록', path: '/', icon: '🕐' },
    { label: '팀', path: '/team', icon: '👥' },
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
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition ${
                isActive
                  ? 'text-blue-500'
                  : 'text-gray-400 hover:text-gray-600'
              }`}>
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}