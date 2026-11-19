'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-react'

// 기간 선택 팝업(react-multi-date-picker 포함)은 처음 열 때 불러온다.
const DateRangePopup = dynamic(() => import('./DateRangePopup'), { loading: () => null })

interface DateRangeFilterProps {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  onApply: (startDate: string, endDate: string) => void
}

export default function DateRangeFilter({ startDate, endDate, onApply }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)

  const openPicker = () => setOpen(true)

  return (
    <div>
      <button
        onClick={openPicker}
        className="w-full sm:w-auto flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 bg-white"
      >
        <span>
          {dayjs(startDate).format('YYYY.MM.DD')} - {dayjs(endDate).format('YYYY.MM.DD')}
        </span>
        <span aria-hidden="true">
          <CalendarDays size={16} strokeWidth={1.75} />
        </span>
      </button>

      {open && (
        <DateRangePopup
          startDate={startDate}
          endDate={endDate}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
