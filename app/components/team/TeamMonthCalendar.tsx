'use client'

import dayjs from 'dayjs'
import { getMonthGrid } from '../../lib/dates'
import { isPublicHoliday } from '../../lib/holidays'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CalendarEntry {
  id: string
  label: string
  colorClass: string
}

interface TeamMonthCalendarProps {
  month: Date
  onMonthChange: (date: Date) => void
  getEntriesForDate: (date: Date) => CalendarEntry[]
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  substituteHolidays: string[]
  /** 한 셀에 표시할 최대 막대 수. 넘치면 "+N개 더보기"로 접는다. */
  maxVisible?: number
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 팀/부서 일정 캘린더. 근무기록 페이지의 react-calendar(단순 날짜 선택용)와 달리,
 * 한 달치 팀원 현황을 Google 캘린더 스타일로 한눈에 훑어보는 게 목적이라 직접 그린다.
 * 날짜를 누르면 그 날의 전체 목록은 이 컴포넌트를 쓰는 화면이 아래쪽에 따로 보여준다.
 */
export default function TeamMonthCalendar({
  month,
  onMonthChange,
  getEntriesForDate,
  selectedDate,
  onSelectDate,
  substituteHolidays,
  maxVisible = 3,
}: TeamMonthCalendarProps) {
  const weeks = getMonthGrid(month)
  const days = weeks.flat()
  const monthNum = dayjs(month).month()
  const todayStr = dayjs().format('YYYY-MM-DD')
  const selectedStr = selectedDate ? dayjs(selectedDate).format('YYYY-MM-DD') : null

  const dateColorClass = (d: dayjs.Dayjs, inMonth: boolean) => {
    if (!inMonth) return 'text-gray-300 dark:text-zinc-600'
    const dateStr = d.format('YYYY-MM-DD')
    const isSubstitute = substituteHolidays.includes(dateStr)
    if (d.day() === 0 || isPublicHoliday(d.toDate()) || isSubstitute) return 'text-red-500'
    if (d.day() === 6) return 'text-blue-500'
    return 'text-gray-700 dark:text-zinc-300'
  }

  return (
    <div>
      {/* 월 이동 */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <button
          onClick={() => onMonthChange(dayjs(month).subtract(1, 'month').toDate())}
          className="p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label="이전 달"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold dark:text-white">{dayjs(month).format('YYYY년 M월')}</p>
        <button
          onClick={() => onMonthChange(dayjs(month).add(1, 'month').toDate())}
          className="p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label="다음 달"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-zinc-700 pb-1.5 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-[11px] font-medium ${
              i === 0
                ? 'text-red-500'
                : i === 6
                  ? 'text-blue-500'
                  : 'text-gray-400 dark:text-zinc-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 dark:bg-zinc-700 border border-gray-100 dark:border-zinc-700 rounded-md overflow-hidden">
        {days.map((d) => {
          const inMonth = d.month() === monthNum
          const dateStr = d.format('YYYY-MM-DD')
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedStr
          const entries = inMonth ? getEntriesForDate(d.toDate()) : []
          const visible = entries.slice(0, maxVisible)
          const hiddenCount = entries.length - visible.length

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(d.toDate())}
              className={`min-h-[84px] sm:min-h-[112px] flex flex-col items-stretch text-left p-1 bg-white dark:bg-zinc-800 transition-colors ${
                inMonth ? 'hover:bg-gray-50 dark:hover:bg-zinc-700/50' : 'bg-gray-50/60 dark:bg-zinc-900/40'
              } ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}`}
            >
              <span
                className={`text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full ${dateColorClass(d, inMonth)} ${
                  isToday ? 'bg-blue-500 !text-white font-semibold' : ''
                }`}
              >
                {d.date()}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                {visible.map((e) => (
                  <span
                    key={e.id}
                    className={`text-[11px] leading-[15px] text-white rounded px-1 truncate ${e.colorClass}`}
                  >
                    {e.label}
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className="text-[11px] leading-[15px] text-gray-400 dark:text-zinc-500 px-1">
                    +{hiddenCount}개 더보기
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
