// DB 행 ↔ 화면/출력 상태 변환 (순수 함수).
// 브라우저(domesticRepo.ts)와 서버(엑셀 출력 API)가 같은 변환을 쓰도록 supabase 클라이언트와
// 분리해 두었다. 이 파일은 브라우저 전용 코드를 import하지 않는다.

import {
  TRANSPORT_MODES,
  emptyDay,
  type DateStr,
  type LodgingType,
  type RankLevel,
  type TransportModeKey,
  type TripDayEntry,
} from './domestic'

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

/** domestic_trip_days 행 목록 → 날짜별 입력 */
export function dayRowsToEntries(rows: DayRow[]): Record<DateStr, TripDayEntry> {
  const entries: Record<DateStr, TripDayEntry> = {}
  for (const row of rows) entries[row.date] = dayRowToEntry(row)
  return entries
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
