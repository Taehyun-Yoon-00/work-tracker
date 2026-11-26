// 국내 출장 정산 저장소 — Supabase와 화면 상태 사이의 호출만 맡는다.
// 테이블/RPC 정의: supabase/migrations/030_domestic_trip_settlements.sql, 031_domestic_trip_pricing.sql
//
// 읽기는 테이블 직접 조회(RLS가 본인 것만 돌려준다), 쓰기는 RPC 한 번(월 단위 트랜잭션)이다.
// 근무시간(work_logs)과는 아무 관계가 없다.
// 행 ↔ 화면 상태 변환은 domesticMapping.ts(서버와 공용)에 있다.

import { supabase } from '../supabase'
import { isDayFilled, type DateStr, type RankLevel, type SettlementMonth, type TripDayEntry } from './domestic'
import {
  dayRowsToEntries,
  entryToDayPayload,
  toRankLevel,
  type DayRow,
} from './domesticMapping'
import type { DomesticPricing, FuelPriceRow, RateRow, VehicleType } from './pricing'

export { dayRowToEntry, dayRowsToEntries, entryToDayPayload, toRankLevel } from './domesticMapping'
export type { DayRow } from './domesticMapping'

/** 화면이 한 달 동안 들고 있는 정산 데이터 */
export interface DomesticMonthData {
  /** 이 달에 저장된 직급. null이면 마이페이지 직급을 따른다. */
  rank: RankLevel | null
  odometerStart: number | null
  /** 차종. 있으면 km당 단가는 월별 유류 단가표에서 가져온다. */
  vehicleTypeId: string | null
  /** 차종이 없을 때 직접 입력한 km당 단가 */
  fuelUnitPrice: number | null
  entries: Record<DateStr, TripDayEntry>
}

export function emptyMonthData(): DomesticMonthData {
  return { rank: null, odometerStart: null, vehicleTypeId: null, fuelUnitPrice: null, entries: {} }
}

// ---------- 단가표 (모든 사용자가 읽을 수 있다) ----------

/** 직급별 단가 버전 · 차종 · 월별 유류 단가를 한 번에 읽는다. 양이 적어서 통째로 가져와 화면에서 고른다. */
export async function loadDomesticPricing(): Promise<DomesticPricing> {
  const [rates, types, prices] = await Promise.all([
    supabase.from('domestic_trip_rates').select('*'),
    supabase.from('domestic_trip_vehicle_types').select('*').order('sort_order').order('label'),
    supabase.from('domestic_trip_fuel_prices').select('year, month, vehicle_type_id, price'),
  ])
  const error = rates.error ?? types.error ?? prices.error
  if (error) throw new Error(error.message)
  return {
    rates: (rates.data ?? []) as RateRow[],
    vehicleTypes: (types.data ?? []) as VehicleType[],
    fuelPrices: (prices.data ?? []) as FuelPriceRow[],
  }
}

// ---------- 내 정산 ----------

export async function loadDomesticMonth(month: SettlementMonth): Promise<DomesticMonthData> {
  const { data, error } = await supabase
    .from('domestic_trip_settlements')
    .select(
      'rank_level, odometer_start, vehicle_type_id, fuel_unit_price, domestic_trip_days(date, lodging, from_place, to_place, route_s1, route_s2, route_s3, modes, fare, toll, parking, purpose, km, round_trip)'
    )
    .eq('year', month.year)
    .eq('month', month.month)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (!data) {
    // 아직 저장한 적 없는 달: 가장 최근에 쓴 차량 정보를 기본값으로 가져온다 (차는 매달 바뀌지 않으므로).
    const { data: last } = await supabase
      .from('domestic_trip_settlements')
      .select('vehicle_type_id, fuel_unit_price')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    return {
      ...emptyMonthData(),
      vehicleTypeId: last?.vehicle_type_id ?? null,
      fuelUnitPrice: last?.vehicle_type_id ? null : (last?.fuel_unit_price ?? null),
    }
  }

  return {
    rank: toRankLevel(data.rank_level),
    odometerStart: data.odometer_start,
    vehicleTypeId: data.vehicle_type_id ?? null,
    fuelUnitPrice: data.fuel_unit_price ?? null,
    entries: dayRowsToEntries((data.domestic_trip_days ?? []) as DayRow[]),
  }
}

/**
 * 한 달치를 통째로 저장한다. 입력된 날(isDayFilled)만 보내고, 서버는 그 목록을 정답으로 본다
 * (목록에 없는 날짜는 삭제). defaultRank는 이 달에 직급을 따로 고르지 않았을 때 저장할
 * 마이페이지 직급이다.
 */
export async function saveDomesticMonth(
  month: SettlementMonth,
  data: DomesticMonthData,
  defaultRank: RankLevel | null
): Promise<void> {
  const days = Object.entries(data.entries)
    .filter(([, e]) => isDayFilled(e))
    .map(([date, e]) => entryToDayPayload(date, e))

  const { error } = await supabase.rpc('save_domestic_trip_settlement', {
    p_year: month.year,
    p_month: month.month,
    p_rank_level: data.rank ?? defaultRank,
    p_odometer_start: data.odometerStart,
    p_vehicle_type_id: data.vehicleTypeId,
    p_fuel_unit_price: data.vehicleTypeId ? null : data.fuelUnitPrice,
    p_days: days,
  })
  if (error) throw new Error(error.message)
}
