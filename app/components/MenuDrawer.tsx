'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useCurrentProfile } from '../hooks/useCurrentProfile'
import { useMyAffiliations } from '../hooks/useMyAffiliations'
import { SIDEBAR_GROUPS, SIDEBAR_FOOTER_ITEMS, SidebarItem } from '../lib/sidebarConfig'
import { X, LogOut, ChevronDown } from 'lucide-react'

interface MenuDrawerProps {
  open: boolean
  onClose: () => void
}

function isActivePath(pathname: string, itemPath: string) {
  if (itemPath === '/') return pathname === '/'
  return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

export default function MenuDrawer({ open, onClose }: MenuDrawerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { name, email, isMaster, isTeamLeaderOrAbove, isOrgManager } = useCurrentProfile()
  const { items: affiliations } = useMyAffiliations()
  const [mounted, setMounted] = useState(false)
  const [affiliationsOpen, setAffiliationsOpen] = useState(false)

  // 드로어를 document.body에 포탈로 렌더링 — TopNav(z-40)의 스태킹 컨텍스트 안에 갇히면
  // 형제 요소인 BottomNav(z-50)에게 항상 가려지므로, 최상위로 빼내야 z-index가 제대로 먹는다.
  useEffect(() => setMounted(true), [])

  const hasPermission = (item: SidebarItem) => {
    if (item.permission === 'master') return isMaster
    if (item.permission === 'teamLeaderOrAbove') return isTeamLeaderOrAbove
    if (item.permission === 'orgManager') return isOrgManager
    if (item.permission === 'dashboardViewer') return isTeamLeaderOrAbove || isOrgManager
    return true
  }

  const handleLogout = async () => {
    onClose()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const renderItem = (item: SidebarItem) => {
    if (!hasPermission(item)) return null
    if (item.path === '/team' && affiliations.length > 1) {
      const anyChildActive = affiliations.some((a) => isActivePath(pathname, a.path))
      const isOpen = affiliationsOpen || anyChildActive
      return (
        <div key={item.path}>
          <button
            onClick={() => setAffiliationsOpen((v) => !v)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
              anyChildActive
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            <span className="shrink-0">
              <item.icon size={18} strokeWidth={1.75} />
            </span>
            <span className="truncate flex-1 text-left">{item.label}</span>
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isOpen && (
            <div className="ml-6 pl-3 border-l-2 border-gray-100 dark:border-zinc-700 mt-0.5 space-y-0.5">
              {affiliations.map((a) => {
                const active = isActivePath(pathname, a.path)
                return (
                  <button
                    key={a.key}
                    onClick={() => {
                      onClose()
                      router.push(a.path)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] truncate transition ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium'
                        : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
                    }`}
                  >
                    {a.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }
    const active = isActivePath(pathname, item.path)
    return (
      <button
        key={item.path}
        onClick={() => {
          onClose()
          router.push(item.path)
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
          active
            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium'
            : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
        }`}
      >
        <span className="shrink-0">
          <item.icon size={18} strokeWidth={1.75} />
        </span>
        <span className="truncate">{item.label}</span>
      </button>
    )
  }

  if (!mounted) return null

  return createPortal(
    <>
      {/* 배경 딤 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-[110] transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 슬라이드 패널 */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white dark:bg-zinc-800 z-[120] shadow-xl transform transition-transform duration-200 ease-out flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-20 flex items-center justify-between px-4 border-b border-gray-100 dark:border-zinc-700 shrink-0">
          <img src="/logo/toray-logo.png" alt="TORAY" className="h-14 w-auto" />
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* 메뉴 그룹 */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {SIDEBAR_GROUPS.map((group, idx) => {
            const visibleItems = group.items.filter(hasPermission)
            if (visibleItems.length === 0) return null
            return (
              <div key={idx}>
                {group.title && (
                  <p className="px-3 mb-1.5 text-[11px] font-semibold text-gray-400 dark:text-zinc-500 tracking-wide">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">{visibleItems.map(renderItem)}</div>
              </div>
            )
          })}
        </nav>

        {/* 하단: 프로필 + 마이페이지/관리자 + 로그아웃 */}
        <div className="border-t border-gray-100 dark:border-zinc-700 px-3 py-3 shrink-0">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-gray-700 dark:text-zinc-200 truncate">
              {name || email}
            </p>
          </div>

          <div className="space-y-0.5">{SIDEBAR_FOOTER_ITEMS.map(renderItem)}</div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-600 dark:hover:text-zinc-300 transition mt-1"
          >
            <span className="shrink-0">
              <LogOut size={14} strokeWidth={1.75} />
            </span>
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
