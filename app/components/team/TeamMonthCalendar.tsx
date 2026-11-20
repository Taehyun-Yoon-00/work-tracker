'use client'

import { useState } from 'react'
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

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

/**
 * 팀/부서 일정 캘린더. 근무기록 페이지의 react-calendar(단순 날짜 선택용)와 달리,
 * 한 달치 팀원 현황을 Google 캘린더 스타일로 한눈에 훑어보는 게 목적이라 직접 그린다.
 * 날짜를 누르면 그 날의 전체 목록은 이 컴포넌트를 쓰는 화면이 모달(DayScheduleModal)로 보여준다.
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
  const [pickerOpen, setPickerOpen] = useState(false)

  // 년/월 직접 선택: 한 달씩만 넘기면 예전 이력을 찾기 번거로워서, 상단 라벨을 누르면
  // 바로 연도/월을 골라 이동할 수 있게 한다. 근무기록 페이지(react-calendar)의 년/월 표시와
  // 화살표 디자인에 맞춰 평소에는 "‹ YYYY년 M월 ›"만 보이고, 라벨을 눌렀을 때만 선택
  // 드롭다운이 뜬다. 1년 단위로 넘기는 화살표는 두지 않는다.
  const nowYear = dayjs().year()
  const yearOptions: number[] = []
  for (let y = nowYear; y >= nowYear - 5; y--) yearOptions.push(y)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  const handleYearChange = (year: number) => {
    onMonthChange(dayjs(month).year(year).toDate())
  }
  const handleMonthSelect = (m: number) => {
    onMonthChange(dayjs(month).month(m - 1).toDate())
  }

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
      {/* 월 이동 + 년/월 선택 (근무기록 페이지 캘린더와 같은 화살표 + 라벨 구성) */}
      <div className="flex items-center justify-center gap-1 mb-2 px-0.5">
        <button
          onClick={() => onMonthChange(dayjs(month).subtract(1, 'month').toDate())}
          className="w-9 h-9 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
          aria-label="이전 달"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="relative">
          <button
            onClick={() => setPickerOpen((open) => !open)}
            className="px-2 py-1.5 rounded text-sm font-semibold dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            {dayjs(month).format('YYYY년 M월')}
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 flex gap-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg p-2">
                <select
                  value={dayjs(month).year()}
                  onChange={(e) => {
                    handleYearChange(Number(e.target.value))
                    setPickerOpen(false)
                  }}
                  className="border rounded-lg px-2 py-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  aria-label="연도 선택"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <select
                  value={monthNum + 1}
                  onChange={(e) => {
                    handleMonthSelect(Number(e.target.value))
                    setPickerOpen(false)
                  }}
                  className="border rounded-lg px-2 py-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  aria-label="월 선택"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => onMonthChange(dayjs(month).add(1, 'month').toDate())}
          className="w-9 h-9 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
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
              i === 6
                ? 'text-red-500'
                : i === 5
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
              className={`min-h-[84px] sm:min-h-[112px] flex flex-col items-stretch text-left p-0.5 sm:p-1 bg-white dark:bg-zinc-800 transition-colors ${
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
                    // 모바일은 칸이 좁아 "홍길…"처럼 두 글자에서 잘렸다. 좌우 여백을 줄이고 말줄임표(…)
                    // 대신 그냥 잘라서(clip) 이름 세 글자가 보이게 한다. 뒤의 휴가 종류는 막대 색으로
                    // 구분된다. sm 이상(넓은 화면)은 기존처럼 말줄임표를 쓴다.
                    className={`text-[11px] leading-[15px] text-white rounded px-0.5 sm:px-1 overflow-hidden whitespace-nowrap text-clip sm:text-ellipsis ${e.colorClass}`}
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
