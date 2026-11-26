// 출장 정산 탭. 화면 전체가 탭별로 전환된다(한 화면에 카드로 나란히 놓지 않는다).
// 해외 출장을 열 때는 아래 enabled만 true로 바꾸고, settlement/page.tsx의 switch에 화면을 연결한다.

export type SettlementTypeKey = 'domestic' | 'overseas' | 'admin'

export interface SettlementTypeConfig {
  key: SettlementTypeKey
  label: string
  /** false면 탭이 비활성(클릭 불가)으로 표시된다 */
  enabled: boolean
  /** true면 총괄 관리자/마스터에게만 탭이 보인다 (서버 API가 권한을 다시 확인한다) */
  adminOnly?: boolean
}

export const SETTLEMENT_TYPES: SettlementTypeConfig[] = [
  { key: 'domestic', label: '국내 출장', enabled: true },
  { key: 'overseas', label: '해외 출장', enabled: false },
  { key: 'admin', label: '단가·양식 관리', enabled: true, adminOnly: true },
]

export const DEFAULT_SETTLEMENT_TYPE: SettlementTypeKey = 'domestic'

/** 현재 사용자에게 보여줄 탭 목록 */
export function visibleSettlementTypes(isAdmin: boolean): SettlementTypeConfig[] {
  return SETTLEMENT_TYPES.filter((t) => !t.adminOnly || isAdmin)
}
