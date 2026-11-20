'use client'

import { useEffect } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface DayScheduleModalProps {
  date: Date
  /** 이 날짜가 속한 달의 일정을 아직 불러오는 중이면 true (목록 대신 안내를 보여준다). */
  loading?: boolean
  vacations: { id: string; name: string; label: string }[]
  remotes: { id: string; name: string }[]
  onClose: () => void
  onPrevDay: () => void
  onNextDay: () => void
}

/**
 * 팀/부서 캘린더에서 날짜를 눌렀을 때 그 날의 휴가·원격근무 목록을 띄우는 모달.
 * 예전에는 캘린더 아래에 목록이 붙어서, 날짜를 누른 뒤 스크롤을 내려야 볼 수 있었다.
 * 모달 안쪽 좌우의 < > 버튼으로 하루씩 넘겨 볼 수 있고, 바깥 영역 · X · ESC로 닫는다.
 */
export default function DayScheduleModal({
  date,
  loading = false,
  vacations,
  remotes,
  onClose,
  onPrevDay,
  onNextDay,
}: DayScheduleModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // 화살표 버튼은 모달 카드 안쪽 양 끝에, 카드 높이의 가운데에 둔다. 버튼 모양이 따로 보이지 않도록
  // 배경을 모달 배경색과 같게 하고, 폭이 좁은 직사각형으로 만들어 < > 모양만 보이게 한다.
  const navButtonClass =
    'absolute top-1/2 -translate-y-1/2 w-6 h-12 rounded-none bg-white dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 flex items-center justify-center hover:text-gray-700 dark:hover:text-zinc-200'

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${dayjs(date).format('M월 D일')} 일정`}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-800 rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onPrevDay} className={`${navButtonClass} left-1`} aria-label="전날">
          <ChevronLeft size={20} />
        </button>
        <button onClick={onNextDay} className={`${navButtonClass} right-1`} aria-label="다음날">
          <ChevronRight size={20} />
        </button>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
          aria-label="닫기"
        >
          <X size={16} />
        </button>

        {/* 좌우 화살표 자리를 비워 두려고 안쪽 여백(px-9)을 준다. 날짜는 가운데 정렬. */}
        <div className="max-h-[80vh] overflow-y-auto px-9 py-4">
          <p className="text-sm font-semibold text-center mb-3 dark:text-zinc-200">
            {dayjs(date).format('MM월 DD일')}
          </p>

          {loading ? (
            <p className="text-xs text-gray-500 dark:text-zinc-400 py-4 text-center">
              불러오는 중…
            </p>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-orange-500 mb-1">휴가</p>
                {vacations.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">없음</p>
                ) : (
                  vacations.map((v) => (
                    <div key={v.id} className="flex items-center gap-1 mb-1">
                      <p className="text-base font-medium dark:text-zinc-200">{v.name}</p>
                      <p className="text-[13px] text-orange-400">{v.label}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-indigo-500 mb-1">원격근무</p>
                {remotes.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-zinc-400">없음</p>
                ) : (
                  remotes.map((r) => (
                    <p key={r.id} className="text-base py-0.5 dark:text-zinc-200">
                      {r.name}
                    </p>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
