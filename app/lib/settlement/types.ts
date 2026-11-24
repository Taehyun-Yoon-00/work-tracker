// 출장 정산 유형. 화면 전체가 유형별로 전환된다(한 화면에 카드로 나란히 놓지 않는다).
// 해외 출장을 열 때는 아래 enabled만 true로 바꾸고, settlement/page.tsx의 switch에 화면을 연결한다.

export type SettlementTypeKey = 'domestic' | 'overseas'

export interface SettlementTypeConfig {
  key: SettlementTypeKey
  label: string
  /** false면 탭이 비활성(클릭 불가)으로 표시된다 */
  enabled: boolean
}

export const SETTLEMENT_TYPES: SettlementTypeConfig[] = [
  { key: 'domestic', label: '국내 출장', enabled: true },
  { key: 'overseas', label: '해외 출장', enabled: false },
]

export const DEFAULT_SETTLEMENT_TYPE: SettlementTypeKey = 'domestic'
