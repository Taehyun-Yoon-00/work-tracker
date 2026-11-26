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
  Plane,
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
   * 'dashboardViewer': 팀장 이상 또는 부장/부문장/총괄 관리자, 또는 대시보드 조회를 위임받은 사람
   * (대시보드 조회 가능한 모든 역할) */
  permission?: SidebarPermission
}

export interface SidebarGroup {
  /** 그룹 제목. 생략하면 제목 없이 최상단에 단독으로 표시됨 (예: 대시보드/근무기록 같은 1순위 메뉴) */
  title?: string
  items: SidebarItem[]
}

export interface SidebarProfile {
  isMaster: boolean
  isTeamLeaderOrAbove: boolean
  isOrgManager: boolean
  /** 부문/부서/팀 어디서든 대시보드 조회 권한을 위임받았는가 (생략하면 false) */
  isDashboardDelegate?: boolean
}

/**
 * 메뉴 항목 하나를 이 사람에게 보여줘도 되는지 판정.
 *
 * PC Sidebar와 모바일 MenuDrawer가 예전에는 이 판정을 각자 구현해서 들고 있었고,
 * 그 결과 'orgManager' 기준이 두 화면에서 서로 다르게 동작하는 버그가 있었다
 * (모바일에서는 팀장에게 "조직 관리" 메뉴가 안 보임). 반드시 이 함수 하나만 참조해서
 * 두 화면이 항상 같은 기준으로 동작하게 한다 — 새 permission 종류를 추가할 때도 여기만 고치면 된다.
 *
 * 'orgManager': 총괄 관리자/부문장/부장뿐 아니라 팀장도 포함한다. 팀장은 자기 팀 범위 안에서
 * 미지정 인원 배속, 팀 권한 관리 등을 할 수 있어야 하므로 "조직 관리" 페이지 자체에는 들어갈 수 있어야
 * 한다 (페이지 안에서 실제로 무엇을 할 수 있는지는 lib/orgPermissions.ts의 canManageTeam 등이 별도로 제한한다).
 */
export function hasSidebarPermission(item: SidebarItem, profile: SidebarProfile): boolean {
  switch (item.permission) {
    case 'master':
      return profile.isMaster
    case 'teamLeaderOrAbove':
      return profile.isTeamLeaderOrAbove
    case 'orgManager':
      return profile.isTeamLeaderOrAbove || profile.isOrgManager
    case 'dashboardViewer':
      return (
        profile.isTeamLeaderOrAbove || profile.isOrgManager || !!profile.isDashboardDelegate
      )
    default:
      return true
  }
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
    title: '정산',
    items: [
      {
        label: '출장 정산',
        path: '/settlement',
        icon: Plane,
        description: '국내 · 해외 출장 정산',
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
