// 국내 출장 정산(国内出張旅費精算) 입력용 타입과 계산 규칙.
//
// ⚠️ 근무시간(work_logs)과는 완전히 별개의 데이터다. 출근하지 않은 날(주말 숙박 등)에도
//    입력해야 하기 때문에 work_logs와 같은 구획에 저장하지 않는다.
//    현재는 UI 확인 단계라 DB 연결 없이 화면 상태로만 다룬다.
//
// 엑셀 양식(TRENGKR_YY年_MM月_国内出張費_XXX.xls) 셀 매핑 — 다음 단계(출력)에서 사용:
//
//  [시트1 国内出張旅費精算]  행: 9, 11, 13 … 69 (정산기간 하루당 2행, 31일분)
//    AT3  = 직급(1~4)      U3 = 해당 월(P3 = 연도)
//    AT열 = 숙박 구분(1=A, 2=B)  → Z/AA(숙박비), AF/AG(일당)은 양식 수식이 자동 계산
//    F열  = 출발지, K열 = 도착지
//
//  [시트2 交通費、電話代-詳細]  행: 시트1과 동일(하루 2행)
//    R = 운임, U = 통행료, X = 주차료
//    N열 = 교통수단. 윗행 "□列車□地下鉄□TAXI", 아랫행 "□BUS□社有車□私有車" 중 선택 항목만 ■
//    F = 출발지, K = 도착지, AI = 이용 목적
//
//  [시트3 運転週報]  왼쪽(전월 16~말일): 날짜 B/E, 경로 G, 누적 Q, 주행 U
//                    오른쪽(당월 1~15일): 날짜 AA/AD, 경로 AF, 누적 AP, 주행 AT
//    AZ1 = 해당 월(AY1 = 연도), H48/AG48 = km당 단가(유류대)
//    누적(Q/AP)은 양식 수식(전일 누적 + 주행거리)이므로 최초 시작값만 넣으면 된다.

import dayjs from 'dayjs'
import { getSettlementPeriod } from '../dates'

/** 'YYYY-MM-DD' */
export type DateStr = string

// ---------- 직급 ----------

/** 마이페이지 직급 프리셋과 같은 순서. 양식의 직급 번호는 (index + 1). */
export const RANK_LABELS = ['사원', '선임', '책임', '수석'] as const
export type RankLevel = 1 | 2 | 3 | 4

/** profiles.position 문자열 → 양식의 직급 번호. 프리셋 밖의 직접 입력 값이면 null. */
export function rankFromPosition(position: string | null | undefined): RankLevel | null {
  const idx = RANK_LABELS.findIndex((label) => label === (position ?? '').trim())
  return idx >= 0 ? ((idx + 1) as RankLevel) : null
}

// ---------- 단가표 (양식 수식 CHOOSE(AT3, …)에서 가져온 값) ----------

const LODGING_A = [62000, 65000, 68000, 70000] as const
const LODGING_B = [18000, 18000, 18000, 18000] as const
const ALLOWANCE = [20000, 22000, 23000, 24000] as const

/** 양식 H48/AG48의 기본값 (km당 단가) */
export const DEFAULT_FUEL_UNIT_PRICE = 240

/** 0 = 없음, 1 = A(숙박), 2 = B — 양식 AT열에 들어가는 값 */
export type LodgingType = 0 | 1 | 2

export function lodgingAmount(type: LodgingType, rank: RankLevel | null): number {
  if (type === 0 || !rank) return 0
  return (type === 1 ? LODGING_A : LODGING_B)[rank - 1]
}

/** 일당은 숙박(A/B)이 있는 날에만 붙는다 (양식: AT=1 또는 2일 때 AG에 금액). */
export function allowanceAmount(type: LodgingType, rank: RankLevel | null): number {
  if (type === 0 || !rank) return 0
  return ALLOWANCE[rank - 1]
}

// ---------- 교통수단 ----------

export type TransportModeKey = 'train' | 'subway' | 'taxi' | 'bus' | 'company' | 'private'

export const TRANSPORT_MODES: { key: TransportModeKey; label: string; jp: string }[] = [
  { key: 'train', label: '열차', jp: '列車' },
  { key: 'subway', label: '지하철', jp: '地下鉄' },
  { key: 'taxi', label: '택시', jp: 'TAXI' },
  { key: 'bus', label: '버스', jp: 'BUS' },
  { key: 'company', label: '회사차', jp: '社有車' },
  { key: 'private', label: '개인차', jp: '私有車' },
]

// ---------- 하루치 입력 ----------

export interface TripDayEntry {
  /** 시트1: 숙박 구분 (AT열) */
  lodging: LodgingType
  /** 출발지/도착지 — 세 시트가 함께 쓰는 값. 하루에 한 번만 입력한다. */
  from: string
  to: string
  /**
   * 시트별 행선지 표시를 직접 지정한 값. 지정하지 않으면(undefined) 자동:
   *  s1 = 숙박이 있는 날 / s2 = 교통비가 있는 날 / s3 = 주행거리가 있는 날
   */
  showRoute: { s1?: boolean; s2?: boolean; s3?: boolean }
  /** 시트2: 교통수단(여러 개 가능), 금액, 이용 목적 */
  modes: TransportModeKey[]
  fare: number | null
  toll: number | null
  parking: number | null
  purpose: string
  /** 시트3: 그날 주행거리(km). 왕복이면 경로를 A↔B, 아니면 A→B로 적는다. */
  km: number | null
  roundTrip: boolean
}

export function emptyDay(): TripDayEntry {
  return {
    lodging: 0,
    from: '',
    to: '',
    showRoute: {},
    modes: [],
    fare: null,
    toll: null,
    parking: null,
    purpose: '',
    km: null,
    roundTrip: true,
  }
}

export function dayTransportTotal(e: TripDayEntry): number {
  return (e.fare ?? 0) + (e.toll ?? 0) + (e.parking ?? 0)
}

/** 아무 내용도 없는 날인지 (목록의 "입력된 날만 보기"와 일괄 입력의 덮어쓰기 안내에 쓴다) */
export function isDayFilled(e: TripDayEntry | undefined): boolean {
  if (!e) return false
  return (
    e.lodging > 0 ||
    e.from.trim() !== '' ||
    e.to.trim() !== '' ||
    dayTransportTotal(e) > 0 ||
    e.modes.length > 0 ||
    e.purpose.trim() !== '' ||
    (e.km ?? 0) > 0
  )
}

/** 시트별로 출발/도착지를 실제로 적을지 (자동 규칙 + 직접 지정 반영) */
export function routeVisibility(e: TripDayEntry): { s1: boolean; s2: boolean; s3: boolean } {
  return {
    s1: e.showRoute.s1 ?? e.lodging > 0,
    s2: e.showRoute.s2 ?? dayTransportTotal(e) > 0,
    s3: e.showRoute.s3 ?? (e.km ?? 0) > 0,
  }
}

/** 자동 규칙으로 정해지는 값 (UI에서 "자동" 표시를 위해) */
export function autoRouteVisibility(e: TripDayEntry): { s1: boolean; s2: boolean; s3: boolean } {
  return { s1: e.lodging > 0, s2: dayTransportTotal(e) > 0, s3: (e.km ?? 0) > 0 }
}

/** 시트3 경로 문자열 — "A↔B" 또는 "A→B" */
export function driveRouteText(e: TripDayEntry): string {
  const from = e.from.trim()
  const to = e.to.trim()
  if (!from && !to) return ''
  return `${from}${e.roundTrip ? '↔' : '→'}${to}`
}

// ---------- 정산 기간 ----------

export interface SettlementMonth {
  year: number
  /** 1~12. 정산기간은 (전월 16일 ~ 이 달 15일) */
  month: number
}

export function monthKey(m: SettlementMonth): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}

/** 날짜가 속한 정산월: 16일 이후는 다음 달분이다 (예: 10/16 → 11월분) */
export function settlementMonthOf(date: Date | DateStr): SettlementMonth {
  const d = dayjs(date)
  const base = d.date() >= 16 ? d.add(1, 'month') : d
  return { year: base.year(), month: base.month() + 1 }
}

export function shiftMonth(m: SettlementMonth, diff: number): SettlementMonth {
  const d = dayjs(`${m.year}-${String(m.month).padStart(2, '0')}-01`).add(diff, 'month')
  return { year: d.year(), month: d.month() + 1 }
}

export function getPeriodRange(m: SettlementMonth): { start: DateStr; end: DateStr } {
  return getSettlementPeriod(`${monthKey(m)}-01`)
}

/** 정산기간의 모든 날짜 (양식의 31일분 이내) */
export function getPeriodDates(m: SettlementMonth): DateStr[] {
  const { start, end } = getPeriodRange(m)
  const dates: DateStr[] = []
  let cur = dayjs(start)
  const last = dayjs(end)
  while (cur.isBefore(last) || cur.isSame(last, 'day')) {
    dates.push(cur.format('YYYY-MM-DD'))
    cur = cur.add(1, 'day')
  }
  return dates
}

// ---------- 집계 ----------

export interface DayComputed {
  date: DateStr
  lodging: number
  allowance: number
  transport: number
  km: number
  /** 시트3 누적 주행거리: 이 날 시작 시점 → 종료 시점. 시작값을 입력하지 않았으면 null */
  odoBefore: number | null
  odoAfter: number | null
}

export interface SettlementTotals {
  lodging: number
  allowance: number
  /** 시트1 합계 (숙박비 + 일당) */
  sheet1: number
  fare: number
  toll: number
  parking: number
  /** 시트2 합계 */
  sheet2: number
  km: number
  /** 시트3 금액 = 총 km × 단가 */
  sheet3: number
  grand: number
  /** 시트1에 해당하는(숙박이 있는) 일수 / 교통비 일수 / 운행 일수 */
  lodgingDays: number
  transportDays: number
  driveDays: number
}

export function computeSettlement(
  dates: DateStr[],
  entries: Record<DateStr, TripDayEntry | undefined>,
  rank: RankLevel | null,
  fuelUnitPrice: number,
  odometerStart: number | null
): { days: Record<DateStr, DayComputed>; totals: SettlementTotals } {
  const days: Record<DateStr, DayComputed> = {}
  const t: SettlementTotals = {
    lodging: 0,
    allowance: 0,
    sheet1: 0,
    fare: 0,
    toll: 0,
    parking: 0,
    sheet2: 0,
    km: 0,
    sheet3: 0,
    grand: 0,
    lodgingDays: 0,
    transportDays: 0,
    driveDays: 0,
  }
  let odo = odometerStart

  for (const date of dates) {
    const e = entries[date]
    const lodging = e ? lodgingAmount(e.lodging, rank) : 0
    const allowance = e ? allowanceAmount(e.lodging, rank) : 0
    const km = e?.km ?? 0
    const transport = e ? dayTransportTotal(e) : 0

    const odoBefore = odo
    const odoAfter = odo === null ? null : odo + km
    if (odo !== null) odo = odoAfter

    days[date] = { date, lodging, allowance, transport, km, odoBefore, odoAfter }

    t.lodging += lodging
    t.allowance += allowance
    t.fare += e?.fare ?? 0
    t.toll += e?.toll ?? 0
    t.parking += e?.parking ?? 0
    t.km += km
    if (e && e.lodging > 0) t.lodgingDays += 1
    if (transport > 0) t.transportDays += 1
    if (km > 0) t.driveDays += 1
  }

  t.sheet1 = t.lodging + t.allowance
  t.sheet2 = t.fare + t.toll + t.parking
  t.sheet3 = t.km * fuelUnitPrice
  t.grand = t.sheet1 + t.sheet2 + t.sheet3
  return { days, totals: t }
}
