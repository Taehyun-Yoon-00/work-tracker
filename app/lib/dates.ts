import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

// isoWeek(월요일 시작) 플러그인은 여기서 한 번만 등록한다.
// 주간 계산이 필요한 곳은 이 모듈을 거치므로 각 페이지에서 따로 extend하지 않아도 된다.
dayjs.extend(isoWeek)

export type DateLike = Date | string | dayjs.Dayjs

export interface DateRange {
  start: string
  end: string
}

/** Supabase의 date 컬럼과 맞는 'YYYY-MM-DD' 문자열로 변환 */
export function toDateStr(date: DateLike): string {
  return dayjs(date).format('YYYY-MM-DD')
}

/** 오늘 날짜 문자열 */
export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD')
}

/** 해당 날짜가 속한 달의 1일 ~ 말일 */
export function getMonthRange(date: DateLike): DateRange {
  const d = dayjs(date)
  return {
    start: d.startOf('month').format('YYYY-MM-DD'),
    end: d.endOf('month').format('YYYY-MM-DD'),
  }
}

/** 해당 날짜가 속한 주의 월요일 ~ 일요일 */
export function getWeekRange(date: DateLike): DateRange {
  const d = dayjs(date)
  return {
    start: d.startOf('isoWeek').format('YYYY-MM-DD'),
    end: d.endOf('isoWeek').format('YYYY-MM-DD'),
  }
}

/**
 * 근무시간 정산 기간: 기준 날짜가 속한 달의 "전월 16일 ~ 당월 15일".
 * 리포트 페이지와 팀 상세 페이지가 같은 규칙을 쓴다.
 */
export function getSettlementPeriod(date: DateLike): DateRange {
  const monthStart = dayjs(date).startOf('month')
  return {
    start: monthStart.subtract(1, 'month').date(16).format('YYYY-MM-DD'),
    end: monthStart.date(15).format('YYYY-MM-DD'),
  }
}

/**
 * 토요일은 파란색, 일요일은 빨간색으로 강조하는 스타일 클래스.
 * 근무관리 달력(react-calendar)과 결재 달력(react-multi-date-picker)이 같은 규칙을 쓴다.
 */
export function weekendClassName(date: Date): string {
  const day = date.getDay()
  if (day === 0) return '!text-red-500 font-semibold'
  if (day === 6) return '!text-blue-500 font-semibold'
  return ''
}

/**
 * 해당 달이 걸쳐 있는 주들의 시작일(월요일) 목록.
 * 주차별 출근계획 UI에서 몇 개의 주 버튼을 그릴지 결정하는 데 쓴다.
 */
export function getWeeksOfMonth(date: DateLike): dayjs.Dayjs[] {
  const monthEnd = dayjs(date).endOf('month')
  const weeks: dayjs.Dayjs[] = []
  let current = dayjs(date).startOf('month').startOf('isoWeek')
  while (current.isBefore(monthEnd) || current.isSame(monthEnd, 'day')) {
    weeks.push(current)
    current = current.add(1, 'week')
  }
  return weeks
}

/**
 * 월요일 시작 월간 달력 그리드: 이번 달 1일이 속한 주의 월요일부터, 말일이 속한 주의
 * 일요일까지를 7일씩 주 단위로 묶어 반환한다. 팀/부서 일정 캘린더(TeamMonthCalendar)가
 * Google 캘린더 스타일의 월간 뷰를 그릴 때 쓴다. 근무기록 페이지의 react-calendar와는
 * 별개 — 그쪽은 단순 날짜 선택용이라 그대로 둔다.
 */
export function getMonthGrid(date: DateLike): dayjs.Dayjs[][] {
  const start = dayjs(date).startOf('month').startOf('isoWeek')
  const end = dayjs(date).endOf('month').endOf('isoWeek')
  const weeks: dayjs.Dayjs[][] = []
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const week: dayjs.Dayjs[] = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor)
      cursor = cursor.add(1, 'day')
    }
    weeks.push(week)
  }
  return weeks
}
