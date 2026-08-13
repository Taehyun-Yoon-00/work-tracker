// 상단 네비게이션의 삼선(햄버거) 메뉴에 표시되는 확장 탭 목록.
// 새 페이지를 추가할 때는 이 배열에 항목만 추가하면 됨.

export interface NavMenuItem {
  label: string
  path: string
  icon: string
  description?: string
}

export const NAV_MENU_ITEMS: NavMenuItem[] = [
  {
    label: '리포트',
    path: '/report',
    icon: '📊',
    description: '월별 안건별 근무 시간 통계',
  },
]
