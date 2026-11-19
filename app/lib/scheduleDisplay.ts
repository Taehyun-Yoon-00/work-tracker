/**
 * 팀/부서 캘린더에서 휴가·원격근무를 막대로 표시할 때 쓰는 공용 색상·라벨.
 * "휴가면 휴가 종류에 맞는 색, 원격이면 인디고"라는 규칙을 한 곳에 모아둬서
 * team/[id]와 DepartmentAffiliationView가 항상 같은 색을 쓰도록 한다.
 */

export type VacationType = 'annual' | 'special' | 'morning' | 'afternoon' | string

export function vacationLabel(type: VacationType): string {
  switch (type) {
    case 'annual':
      return '연차'
    case 'special':
      return '특휴/대휴'
    case 'morning':
      return '오전반차'
    case 'afternoon':
      return '오후반차'
    default:
      return '휴가'
  }
}

/** 막대 배경색 (text-white와 함께 쓰는 진한 색). 반차는 절반만 쉰다는 의미로 한 톤 옅은 색을 쓴다. */
export function vacationColorClass(type: VacationType): string {
  switch (type) {
    case 'annual':
      return 'bg-orange-500'
    case 'special':
      return 'bg-orange-500'
    case 'morning':
    case 'afternoon':
      return 'bg-amber-500'
    default:
      return 'bg-orange-500'
  }
}

export const REMOTE_COLOR_CLASS = 'bg-indigo-500'
export const REMOTE_LABEL = '원격'
