import Holidays from 'date-holidays'
import { supabase } from './supabase'
import { toDateStr } from './dates'

// date-holidays 인스턴스 생성 비용이 있어 모듈 단위로 한 번만 만든다.
const hd = new Holidays('KR')

/** 법정 공휴일 여부 (주말은 포함하지 않음) */
export function isPublicHoliday(date: Date): boolean {
  return !!hd.isHoliday(date)
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
