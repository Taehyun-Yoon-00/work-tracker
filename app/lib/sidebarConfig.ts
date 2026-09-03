// PC Sidebar와 모바일 MenuDrawer가 함께 참조하는 확장형 메뉴 구조.
// 새 페이지가 생기면 이 배열에 항목(또는 그룹)만 추가하면 자동으로 반영됨.
// 아직 실제 페이지가 없는 기능(대시보드, 팀 통계, 전체 통계, 사용자/권한 관리 등)은
// 여기 추가하지 않는다 — 실제로 존재하는 라우트만 노출한다.

import type { LucideIcon } from 'lucide-react'
import {
  TrendingUp,
  Clock,
  BarChart3,
  Users,
  Building2,
  ClipboardList,
  User,
  Settings,
} from 'lucide-react'

export type SidebarPermission = 'all' | 'master' | 'teamLeaderOrAbove' | 'orgManager' | 'dashboardViewer'

export interface SidebarItem {
  label: string
  path: string
  icon: LucideIcon
  description?: string
  /** 'all'(기본값): 로그인한 모든 사용자, 'master': is_master 계정만, 'teamLeaderOrAbove': 팀장 이상,
   * 'dashboardViewer': 팀장 이상 또는 부서장/부문장/총괄 관리자 (대시보드 조회 가능한 모든 역할) */
  permission?: SidebarPermission
}

export interface SidebarGroup {
  /** 그룹 제목. 생략하면 제목 없이 최상단에 단독으로 표시됨 (예: 대시보드/근무기록 같은 1순위 메뉴) */
  title?: string
  items: SidebarItem[]
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    
    title: '근무관리',
    items: [
      {
        label: '대시보드',
        path: '/dashboard',
        icon: TrendingUp,
        description: '팀 근무 통계',
        permission: 'dashboardViewer',
      },
      { label: '근무기록', path: '/', icon: Clock, description: '근무 입력 · 휴가 · 원격근무' },
      {
        label: '리포트',
        path: '/report',
        icon: BarChart3,
        description: '월별 안건별 근무 시간 통계',
      },
    ],
  },
  {
    title: '조직',
    items: [
      { label: '내 소속', path: '/team', icon: Users },
      {
        label: '조직 관리',
        path: '/org',
        icon: Building2,
        description: '부문 · 부서 · 팀 구조 관리',
        permission: 'orgManager',
      },
    ],
  },
  {
    title: '결재',
    items: [{ label: '결재', path: '/approval', icon: ClipboardList }],
  },
]

export const SIDEBAR_FOOTER_ITEMS: SidebarItem[] = [
  { label: '마이페이지', path: '/mypage', icon: User },
  { label: '회원 관리', path: '/admin', icon: Settings, permission: 'master' },
]
