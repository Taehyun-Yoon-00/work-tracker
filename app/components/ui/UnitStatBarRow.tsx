'use client'

import type { DashboardUnitLevel } from '../../lib/dashboardStats'

export interface UnitStatBarRowProps {
  unitLevel: DashboardUnitLevel
  name: string
  totalHours: number
  weekdayHours: number
  holidayHours: number
  weekdayPct: number
  holidayPct: number
  memberCount?: number
  averageHours?: number
}

export default function UnitStatBarRow({
  unitLevel,
  name,
  totalHours,
  weekdayHours,
  holidayHours,
  weekdayPct,
  holidayPct,
  memberCount,
  averageHours,
}: UnitStatBarRowProps) {
  const isGroupUnit = unitLevel !== 'member'

  return (
    <div className="w-full">
      {/* 1행: 이름 + 총 근무시간 */}
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 text-sm dark:text-zinc-200">
          {name}
        </span>

        <span className="shrink-0 text-sm font-medium tabular-nums dark:text-zinc-200">
          {totalHours}h
        </span>
      </div>

      {/* 2행: 고정 폭 통계 영역 + 동일한 최대 폭의 막대그래프 */}
      <div className="mt-1.5 flex items-center">
        {/* 그래프 영역: 오른쪽 통계 영역과 항상 동일하게 분리 */}
        <div className="min-w-0 flex-1 pr-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-700">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${weekdayPct}%` }}
            />
            <div
              className="h-full bg-orange-400"
              style={{ width: `${holidayPct}%` }}
            />
          </div>
        </div>

        {/* 통계 영역: 내용 길이와 관계없이 항상 동일한 폭 */}
        <div className="w-25 shrink-0 text-right text-[10px] leading-tight">
          <p className="whitespace-nowrap text-gray-400 dark:text-zinc-500">
            <span className="text-blue-500">평일 {weekdayHours}h</span>
            <span className="text-gray-400 dark:text-zinc-500">{' · '}</span>
            <span className="text-orange-500">휴일 {holidayHours}h</span>
          </p>

          {isGroupUnit && (
            <p className="mt-0.5 whitespace-nowrap text-gray-400 dark:text-zinc-500">
              {memberCount}명 · 평균 {averageHours}h
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
