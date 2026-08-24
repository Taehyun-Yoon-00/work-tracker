'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import Card from '@/app/components/ui/Card'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'

interface MatterRow {
  category: string
  hours: number
  matter_place: string | null
  matter_division: string | null
  matter_content: string | null
  matter_cost_code: string | null
}

interface MatterSummary {
  key: string
  name: string
  hours: number
}

function matterDisplayName(row: MatterRow): string {
  if (row.category !== '청구안건') return row.category
  const label = row.matter_content?.trim() || row.matter_place?.trim() || '청구 안건'
  return row.matter_cost_code?.trim() ? `${label} (${row.matter_cost_code.trim()})` : label
}

export default function ReportPage() {
  const { user } = useCurrentUser()
  const today = useMemo(() => dayjs(), [])
  const [targetYear, setTargetYear] = useState(today.year())
  const [targetMonth, setTargetMonth] = useState(today.month() + 1) // 1-12
  const [summary, setSummary] = useState<MatterSummary[]>([])
  const [loading, setLoading] = useState(false)

  // 선택한 "당월"을 기준으로 전월 16일 ~ 당월 15일 범위를 계산
  const { periodStart, periodEnd } = useMemo(() => {
    const targetMonthStart = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)
    const start = targetMonthStart.subtract(1, 'month').date(16)
    const end = targetMonthStart.date(15)
    return {
      periodStart: start.format('YYYY-MM-DD'),
      periodEnd: end.format('YYYY-MM-DD'),
    }
  }, [targetYear, targetMonth])

  useEffect(() => {
    if (user) fetchSummary()
  }, [user, periodStart, periodEnd])

  const fetchSummary = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('work_log_matters')
      .select(
        'category, hours, matter_place, matter_division, matter_content, matter_cost_code, work_logs!inner(date, user_id)'
      )
      .eq('work_logs.user_id', user.id)
      .gte('work_logs.date', periodStart)
      .lte('work_logs.date', periodEnd)

    if (error) {
      console.error('리포트 조회 실패:', error.message)
      setSummary([])
      setLoading(false)
      return
    }

    const grouped = new Map<string, number>()
    ;(data || []).forEach((row: MatterRow) => {
      const name = matterDisplayName(row)
      grouped.set(name, (grouped.get(name) || 0) + Number(row.hours))
    })

    const rows: MatterSummary[] = Array.from(grouped.entries())
      .map(([name, hours]) => ({ key: name, name, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours)

    setSummary(rows)
    setLoading(false)
  }

  const totalHours = Math.round(summary.reduce((acc, r) => acc + r.hours, 0) * 100) / 100

  const moveMonth = (diff: number) => {
    const next = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`).add(
      diff,
      'month'
    )
    setTargetYear(next.year())
    setTargetMonth(next.month() + 1)
  }

  const yearOptions = useMemo(() => {
    const nowYear = today.year()
    const years: number[] = []
    for (let y = nowYear; y >= nowYear - 5; y--) years.push(y)
    return years
  }, [today])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">리포트</h1>
        </div>

        {/* 년/월 선택 */}
        <Card className="mb-4">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
            >
              ‹
            </button>

            <select
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value))}
              className="border rounded-lg px-2 py-1.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>

            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(Number(e.target.value))}
              className="border rounded-lg px-2 py-1.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>

            <button
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
            >
              ›
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-zinc-500 mt-2">
            {dayjs(periodStart).format('YYYY.MM.DD')} ~ {dayjs(periodEnd).format('YYYY.MM.DD')}
          </p>
        </Card>

        {/* 안건별 합계시간 */}
        <Card>
          {loading ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">
              불러오는 중...
            </p>
          ) : summary.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">
              해당 기간에 기록된 근무가 없어요.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-zinc-700 text-left text-gray-400 dark:text-zinc-500">
                  <th className="py-2 font-medium">안건명</th>
                  <th className="py-2 font-medium text-right">합계 시간</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.key} className="border-b last:border-0 dark:border-zinc-700">
                    <td className="py-2.5 pr-2 dark:text-zinc-200 break-words">{row.name}</td>
                    <td className="py-2.5 text-right font-medium dark:text-zinc-200 whitespace-nowrap">
                      {row.hours.toFixed(2)}시간
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 font-semibold dark:text-white">합계</td>
                  <td className="pt-3 text-right font-semibold dark:text-white whitespace-nowrap">
                    {totalHours.toFixed(2)}시간
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
