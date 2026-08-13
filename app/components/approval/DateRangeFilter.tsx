'use client'

import { useState } from 'react'
import { Calendar, DateObject } from 'react-multi-date-picker'
import dayjs from 'dayjs'

interface DateRangeFilterProps {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  onApply: (startDate: string, endDate: string) => void
}

export default function DateRangeFilter({ startDate, endDate, onApply }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateObject[]>([new DateObject(startDate), new DateObject(endDate)])

  const openPicker = () => {
    setRange([new DateObject(startDate), new DateObject(endDate)])
    setOpen(true)
  }

  const handleApply = () => {
    if (range.length === 2) {
      const [s, e] = range
      onApply(s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD'))
    }
    setOpen(false)
  }

  return (
    <div className="mb-4">
      <button
        onClick={openPicker}
        className="w-full sm:w-auto flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 bg-white"
      >
        <span>
          {dayjs(startDate).format('YYYY.MM.DD')} - {dayjs(endDate).format('YYYY.MM.DD')}
        </span>
        <span aria-hidden="true">📅</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-800 rounded-xl p-4 max-w-full overflow-x-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-3 dark:text-white">기간 선택</p>
            <Calendar
              value={range}
              onChange={(dates: any) => setRange(dates)}
              range
              numberOfMonths={2}
              shadow={false}
              className="!shadow-none"
              months={Array.from({ length: 12 }, (_, i) => String(i + 1))}
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 py-2 rounded-lg text-sm"
              >
                취소
              </button>
              <button
                onClick={handleApply}
                disabled={range.length < 2}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm disabled:opacity-50"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
