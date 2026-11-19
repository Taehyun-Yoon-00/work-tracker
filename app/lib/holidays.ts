import { supabase } from './supabase'
import { toDateStr } from './dates'
import { KR_HOLIDAY_TABLE, KR_HOLIDAY_TABLE_FROM_YEAR, KR_HOLIDAY_TABLE_TO_YEAR } from './koreanHolidayTable'

// 한국 법정 공휴일은 date-holidays 패키지로 미리 계산해 둔 표(koreanHolidayTable.ts)에서 찾는다.
// 패키지를 브라우저 번들에 그대로 넣으면 모든 페이지의 초기 로딩이 무거워지기 때문이다.
// (표 재생성: scripts/generate-holidays.mjs)
let publicHolidaySet: Set<string> | null = null
function getPublicHolidaySet(): Set<string> {
  if (publicHolidaySet) return publicHolidaySet
  const set = new Set<string>()
  for (let y = KR_HOLIDAY_TABLE_FROM_YEAR; y <= KR_HOLIDAY_TABLE_TO_YEAR; y++) {
    const days = KR_HOLIDAY_TABLE[y]
    if (!days) continue
    for (const mmdd of days.split(' ')) set.add(`${y}-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`)
  }
  publicHolidaySet = set
  return set
}

// date-holidays('KR')와 같이 한국 시간(Asia/Seoul) 기준의 날짜로 바꿔서 조회한다.
const seoulDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 법정 공휴일 여부 (주말은 포함하지 않음) */
export function isPublicHoliday(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false
  return getPublicHolidaySet().has(seoulDateFormat.format(date))
}

/** 근무 집계에서 "휴일"로 볼지 여부 — 주말 + 법정 공휴일 + 사내 대체공휴일 */
export function isHoliday(date: Date, substituteHolidays: string[] = []): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return true
  if (substituteHolidays.includes(toDateStr(date))) return true
  return isPublicHoliday(date)
}

/** 관리자가 등록한 사내 대체공휴일 목록 ('YYYY-MM-DD' 배열) */
export async function fetchSubstituteHolidays(): Promise<string[]> {
  const { data } = await supabase.from('substitute_holidays').select('date')
  return data?.map((h) => h.date as string) ?? []
}
