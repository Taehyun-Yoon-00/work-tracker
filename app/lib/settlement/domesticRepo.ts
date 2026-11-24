// 국내 출장 정산 저장소 — Supabase와 화면 상태 사이의 변환만 맡는다.
// 테이블/RPC 정의: supabase/migrations/030_domestic_trip_settlements.sql
//
// 읽기는 테이블 직접 조회(RLS가 본인 것만 돌려준다), 쓰기는 RPC 한 번(월 단위 트랜잭션)이다.
// 근무시간(work_logs)과는 아무 관계가 없다.

import { supabase } from '../supabase'
import {
  DEFAULT_FUEL_UNIT_PRICE,
  TRANSPORT_MODES,
  emptyDay,
  isDayFilled,
  type DateStr,
  type LodgingType,
  type RankLevel,
  type SettlementMonth,
  type TransportModeKey,
  type TripDayEntry,
} from './domestic'

/** 화면이 한 달 동안 들고 있는 정산 데이터 */
export interface DomesticMonthData {
  /** 이 달에 저장된 직급. null이면 마이페이지 직급을 따른다. */
  rank: RankLevel | null
  odometerStart: number | null
  fuelUnitPrice: number
  entries: Record<DateStr, TripDayEntry>
}

export function emptyMonthData(): DomesticMonthData {
  return { rank: null, odometerStart: null, fuelUnitPrice: DEFAULT_FUEL_UNIT_PRICE, entries: {} }
}

// ---------- 행 ↔ 화면 상태 변환 (순수 함수) ----------

/** domestic_trip_days 한 행 (PostgREST가 돌려주는 모양) */
export interface DayRow {
  date: string
  lodging: number
  from_place: string | null
  to_place: string | null
  route_s1: boolean | null
  route_s2: boolean | null
  route_s3: boolean | null
  modes: string[] | null
  fare: number | null
  toll: number | null
  parking: number | null
  purpose: string | null
  km: number | string | null
  round_trip: boolean | null
}

const MODE_KEYS = new Set<string>(TRANSPORT_MODES.map((m) => m.key))

export function toRankLevel(v: number | null | undefined): RankLevel | null {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : null
}

export function dayRowToEntry(row: DayRow): TripDayEntry {
  const base = emptyDay()
  const showRoute: TripDayEntry['showRoute'] = {}
  if (row.route_s1 !== null) showRoute.s1 = row.route_s1
  if (row.route_s2 !== null) showRoute.s2 = row.route_s2
  if (row.route_s3 !== null) showRoute.s3 = row.route_s3
  return {
    ...base,
    lodging: (row.lodging === 1 || row.lodging === 2 ? row.lodging : 0) as LodgingType,
    from: row.from_place ?? '',
    to: row.to_place ?? '',
    showRoute,
    modes: (row.modes ?? []).filter((m): m is TransportModeKey => MODE_KEYS.has(m)),
    fare: row.fare,
    toll: row.toll,
    parking: row.parking,
    purpose: row.purpose ?? '',
    // numeric 컬럼은 환경에 따라 문자열로 올 수 있다
    km: row.km === null ? null : Number(row.km),
    roundTrip: row.round_trip ?? true,
  }
}

/** RPC의 p_days 원소. 직접 지정하지 않은(자동) 시트 표시는 null로 보낸다. */
export function entryToDayPayload(date: DateStr, e: TripDayEntry) {
  return {
    date,
    lodging: e.lodging,
    from_place: e.from.trim(),
    to_place: e.to.trim(),
    route_s1: e.showRoute.s1 ?? null,
    route_s2: e.showRoute.s2 ?? null,
    route_s3: e.showRoute.s3 ?? null,
    modes: e.modes,
    fare: e.fare,
    toll: e.toll,
    parking: e.parking,
    purpose: e.purpose.trim(),
    km: e.km,
    round_trip: e.roundTrip,
  }
}

// ---------- Supabase 호출 ----------

export async function loadDomesticMonth(month: SettlementMonth): Promise<DomesticMonthData> {
  const { data, error } = await supabase
    .from('domestic_trip_settlements')
    .select(
      'rank_level, odometer_start, fuel_unit_price, domestic_trip_days(date, lodging, from_place, to_place, route_s1, route_s2, route_s3, modes, fare, toll, parking, purpose, km, round_trip)'
    )
    .eq('year', month.year)
    .eq('month', month.month)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return emptyMonthData()

  const entries: Record<DateStr, TripDayEntry> = {}
  for (const row of (data.domestic_trip_days ?? []) as DayRow[]) {
    entries[row.date] = dayRowToEntry(row)
  }
  return {
    rank: toRankLevel(data.rank_level),
    odometerStart: data.odometer_start,
    fuelUnitPrice: data.fuel_unit_price,
    entries,
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
    p_fuel_unit_price: data.fuelUnitPrice,
    p_days: days,
  })
  if (error) throw new Error(error.message)
}
