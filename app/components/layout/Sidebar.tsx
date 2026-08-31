'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useCurrentProfile } from '../../hooks/useCurrentProfile'
import { useMyAffiliations } from '../../hooks/useMyAffiliations'
import { SIDEBAR_GROUPS, SIDEBAR_FOOTER_ITEMS, SidebarItem } from '../../lib/sidebarConfig'
import { LogOut, ChevronDown } from 'lucide-react'

function isActivePath(pathname: string, itemPath: string) {
  if (itemPath === '/') return pathname === '/'
  return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { userId, name, email, isMaster, isTeamLeaderOrAbove, isOrgManager } = useCurrentProfile()
  const { items: affiliations } = useMyAffiliations()
  const [affiliationsOpen, setAffiliationsOpen] = useState(false)

  // 로그인 화면 등 비로그인 상태에서는 사이드바를 표시하지 않음
  if (!userId) return null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const hasPermission = (item: SidebarItem) => {
    if (item.permission === 'master') return isMaster
    if (item.permission === 'teamLeaderOrAbove') return isTeamLeaderOrAbove
    if (item.permission === 'orgManager') return isOrgManager
    return true
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
            <span className="shrink-0"><item.icon size={18} strokeWidth={1.75} /></span>
            <span className="truncate flex-1 text-left">{item.label}</span>
            <ChevronDown size={14} strokeWidth={2} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && (
            <div className="ml-6 pl-3 border-l-2 border-gray-100 dark:border-zinc-700 mt-0.5 space-y-0.5">
              {affiliations.map((a) => {
                const active = isActivePath(pathname, a.path)
                return (
                  <button
                    key={a.key}
                    onClick={() => router.push(a.path)}
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
        onClick={() => router.push(item.path)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
          active
            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium'
            : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
        }`}
      >
        <span className="shrink-0"><item.icon size={18} strokeWidth={1.75} /></span>
        <span className="truncate">{item.label}</span>
      </button>
    )
  }

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex-col z-30">
      {/* 로고 */}
      <div className="h-20 flex items-center px-4 border-b border-gray-100 dark:border-zinc-700 shrink-0">
        <img src="/logo/toray-logo.png" alt="TORAY" className="h-14 w-auto" />
        <span className="ml-2 text-xs font-semibold text-gray-400 dark:text-zinc-500 tracking-wide">
          WORK TRACKER
        </span>
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
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-zinc-200 truncate">
              {name || email}
            </p>
          </div>
        </div>

        <div className="space-y-0.5">{SIDEBAR_FOOTER_ITEMS.map(renderItem)}</div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-gray-400 dark:text-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-600 dark:hover:text-zinc-300 transition mt-1"
        >
          <span className="shrink-0"><LogOut size={14} strokeWidth={1.75} /></span>
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  )
}
