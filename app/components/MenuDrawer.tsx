'use client'

import { useRouter, usePathname } from 'next/navigation'
import { NAV_MENU_ITEMS } from '../lib/navMenu'

interface MenuDrawerProps {
  open: boolean
  onClose: () => void
}

export default function MenuDrawer({ open, onClose }: MenuDrawerProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <>
      {/* 배경 딤 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 슬라이드 패널 */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white dark:bg-zinc-800 z-50 shadow-xl transform transition-transform duration-200 ease-out flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-11 flex items-center justify-between px-4 border-b border-gray-200 dark:border-zinc-700 shrink-0">
          <span className="font-semibold text-sm dark:text-white">메뉴</span>
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_MENU_ITEMS.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 px-4 py-3">
              표시할 메뉴가 없어요.
            </p>
          )}
          {NAV_MENU_ITEMS.map((item) => {
            // 이 메뉴의 페이지들은 하단 탭에 없어서, 지금 어디에 있는지
            // 알려주는 곳이 여기뿐이다.
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`)
            return (
              <button
                key={item.path}
                onClick={() => {
                  onClose()
                  router.push(item.path)
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-zinc-700/50'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-700'
                }`}
              >
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'dark:text-zinc-100'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.description && (
                    <span className="block text-xs text-gray-400 dark:text-zinc-500 truncate">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
