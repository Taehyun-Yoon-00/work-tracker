// 단가 조회 규칙 — 화면(금액 미리보기)과 서버(엑셀 출력)가 같은 함수를 써서 같은 금액이 나오게 한다.
// 순수 함수라 DB/네트워크에 의존하지 않는다. 테이블 정의: supabase/migrations/031_domestic_trip_pricing.sql

import type { RankLevel, RankRate, SettlementMonth } from './domestic'

/** domestic_trip_rates 한 행 */
export interface RateRow {
  effective_year: number
  effective_month: number
  rank_level: number
  lodging_a: number
  lodging_b: number
  allowance: number
}

/** domestic_trip_vehicle_types 한 행 */
export interface VehicleType {
  id: string
  label: string
  sort_order: number
  is_active: boolean
}

/** domestic_trip_fuel_prices 한 행 */
export interface FuelPriceRow {
  year: number
  month: number
  vehicle_type_id: string
  price: number
}

export interface DomesticPricing {
  rates: RateRow[]
  vehicleTypes: VehicleType[]
  fuelPrices: FuelPriceRow[]
}

export const EMPTY_PRICING: DomesticPricing = { rates: [], vehicleTypes: [], fuelPrices: [] }

/** 연·월을 비교 가능한 정수로 (2026-11 → 24322) */
export const ymIndex = (year: number, month: number) => year * 12 + (month - 1)

// ---------- 직급별 단가 ----------

/**
 * 정산월에 적용되는 직급별 단가 버전의 "적용 시작월". 그 달 이전(포함)에 시작한 버전 중 가장 최근 것.
 * 어떤 버전도 없으면 null.
 */
export function pickRateVersion(
  rows: RateRow[],
  month: SettlementMonth
): { year: number; month: number } | null {
  const target = ymIndex(month.year, month.month)
  let best: { year: number; month: number } | null = null
  for (const r of rows) {
    const idx = ymIndex(r.effective_year, r.effective_month)
    if (idx > target) continue
    if (!best || idx > ymIndex(best.year, best.month)) {
      best = { year: r.effective_year, month: r.effective_month }
    }
  }
  return best
}

/** 정산월·직급에 적용되는 단가. 단가표가 없거나 그 직급 행이 없으면 null. */
export function pickRankRate(
  rows: RateRow[],
  month: SettlementMonth,
  rank: RankLevel | null
): RankRate | null {
  if (!rank) return null
  const version = pickRateVersion(rows, month)
  if (!version) return null
  const row = rows.find(
    (r) =>
      r.effective_year === version.year &&
      r.effective_month === version.month &&
      r.rank_level === rank
  )
  return row ? { lodgingA: row.lodging_a, lodgingB: row.lodging_b, allowance: row.allowance } : null
}

/** 적용 시작월 버전 목록(최신순) — 관리 탭에서 쓴다. */
export function listRateVersions(rows: RateRow[]): { year: number; month: number }[] {
  const seen = new Map<number, { year: number; month: number }>()
  for (const r of rows) {
    seen.set(ymIndex(r.effective_year, r.effective_month), {
      year: r.effective_year,
      month: r.effective_month,
    })
  }
  return [...seen.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v)
}

// ---------- 차종별 km당 단가 ----------

export interface FuelPriceLookup {
  price: number
  /** 실제로 가져온 단가의 정산월. 요청한 달과 다르면 이전 달 값이 이월된 것 */
  fromYear: number
  fromMonth: number
  carried: boolean
}

/**
 * 정산월·차종의 km당 단가. 그 달 값이 없으면 그 이전 달 중 가장 최근 값을 쓴다(이월).
 * 이전 값도 없으면 null.
 */
export function pickFuelPrice(
  rows: FuelPriceRow[],
  vehicleTypeId: string,
  month: SettlementMonth
): FuelPriceLookup | null {
  const target = ymIndex(month.year, month.month)
  let best: FuelPriceRow | null = null
  for (const r of rows) {
    if (r.vehicle_type_id !== vehicleTypeId) continue
    const idx = ymIndex(r.year, r.month)
    if (idx > target) continue
    if (!best || idx > ymIndex(best.year, best.month)) best = r
  }
  if (!best) return null
  return {
    price: best.price,
    fromYear: best.year,
    fromMonth: best.month,
    carried: ymIndex(best.year, best.month) !== target,
  }
}

export type FuelPriceSource = 'vehicle' | 'manual' | 'none'

export interface ResolvedFuelPrice {
  price: number | null
  source: FuelPriceSource
  /** source가 'vehicle'일 때 단가표 조회 결과 */
  lookup: FuelPriceLookup | null
}

/**
 * 내 정산에 쓸 km당 단가.
 *   차종을 골랐으면 그 차종의 월별 단가표 값, 차종이 없으면 직접 입력한 값.
 *   차종을 골랐는데 단가표에 값이 없으면(관리자가 아직 입력하지 않음) price는 null이다.
 */
export function resolveFuelUnitPrice(
  prices: FuelPriceRow[],
  vehicleTypeId: string | null,
  manualPrice: number | null,
  month: SettlementMonth
): ResolvedFuelPrice {
  if (vehicleTypeId) {
    const lookup = pickFuelPrice(prices, vehicleTypeId, month)
    return { price: lookup?.price ?? null, source: 'vehicle', lookup }
  }
  if (manualPrice !== null) return { price: manualPrice, source: 'manual', lookup: null }
  return { price: null, source: 'none', lookup: null }
}
