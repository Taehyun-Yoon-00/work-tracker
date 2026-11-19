'use client'

import { useState } from 'react'
import { Calendar, DateObject } from 'react-multi-date-picker'
import { weekendClassName } from '@/app/lib/dates'
import Button from '../ui/Button'

interface DateRangePopupProps {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  onApply: (startDate: string, endDate: string) => void
  onClose: () => void
}

/**
 * DateRangeFilter가 열릴 때만 불러오는 기간 선택 팝업.
 * react-multi-date-picker가 꽤 큰 라이브러리라, 필터 버튼만 보이는 평소에는 번들에 넣지 않고
 * 팝업을 열 때 따로 불러온다. 화면과 동작은 이전과 같다(열 때마다 현재 기간으로 초기화).
 */
export default function DateRangePopup({
  startDate,
  endDate,
  onApply,
  onClose,
}: DateRangePopupProps) {
  const [range, setRange] = useState<DateObject[]>([
    new DateObject(startDate),
    new DateObject(endDate),
  ])

  const handleApply = () => {
    if (range.length === 2) {
      const [s, e] = range
      onApply(s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD'))
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-4 max-w-full overflow-x-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-3 dark:text-white">기간 선택</p>
        <Calendar
          value={range}
          onChange={(dates: any) => setRange(dates)}
          range
          numberOfMonths={2}
          shadow={false}
          weekStartDayIndex={1}
          mapDays={({ date }) => ({ className: weekendClassName(date.toDate()) })}
          className="!shadow-none"
        />
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            취소
          </Button>
          <Button className="flex-1" onClick={handleApply} disabled={range.length < 2}>
            적용
          </Button>
        </div>
      </div>
    </div>
  )
}
