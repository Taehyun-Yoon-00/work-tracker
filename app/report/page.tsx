'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import Card from '@/app/components/ui/Card'
import LoadError from '@/app/components/ui/LoadError'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import { getSettlementPeriod } from '@/app/lib/dates'

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
  const [failed, setFailed] = useState(false)

  // 선택한 "당월"을 기준으로 전월 16일 ~ 당월 15일 범위를 계산 (팀 상세 페이지와 같은 규칙)
  const { start: periodStart, end: periodEnd } = useMemo(
    () => getSettlementPeriod(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`),
    [targetYear, targetMonth]
  )

  useEffect(() => {
    if (user) fetchSummary()
  }, [user, periodStart, periodEnd])

  const fetchSummary = async () => {
    if (!user) return
    setLoading(true)
    setFailed(false)
    const { data, error } = await supabase
      .from('work_log_matters')
      .select(
        'category, hours, matter_place, matter_division, matter_content, matter_cost_code, work_logs!inner(date, user_id)'
      )
      .eq('work_logs.user_id', user.id)
      .gte('work_logs.date', periodStart)
      .lte('work_logs.date', periodEnd)

    if (error) {
      // 조회 실패를 "기록 없음"으로 보여주면 권한 오류가 조용히 묻힌다.
      console.error('리포트 조회 실패:', error.message)
      setSummary([])
      setFailed(true)
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

  const navButtonClass =
    'w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-zinc-400 ' +
    'transition hover:bg-gray-100 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-white ' +
    'active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'

  const selectClass =
    'border border-gray-300 rounded-lg px-2 py-1.5 text-sm transition ' +
    'hover:border-gray-400 dark:hover:border-zinc-500 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ' +
    'dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200'

  return (
    <main className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          {/* 이 페이지는 하단 탭에 없어서 돌아갈 곳이 브라우저 뒤로가기뿐이었다. */}
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 transition hover:text-gray-700 dark:hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            근무기록
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight dark:text-white">리포트</h1>
        </header>

        {/* 년/월 선택 */}
        <Card className="mb-4" surface="flat">
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => moveMonth(-1)} aria-label="이전 달" className={navButtonClass}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <select
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value))}
              aria-label="년도 선택"
              className={selectClass}
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
              aria-label="월 선택"
              className={selectClass}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>

            <button onClick={() => moveMonth(1)} aria-label="다음 달" className={navButtonClass}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-gray-500 dark:text-zinc-500 mt-2 tabular-nums">
            {dayjs(periodStart).format('YYYY.MM.DD')} ~ {dayjs(periodEnd).format('YYYY.MM.DD')}
          </p>
        </Card>

        {/* 안건별 합계시간 */}
        <Card>
          {loading ? (
            <>
              <p className="sr-only" role="status">
                리포트를 불러오는 중입니다
              </p>
              <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
                <div className="flex justify-between border-b dark:border-zinc-700 pb-2">
                  <div className="h-3 w-14 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="h-3 w-20 rounded bg-gray-200 dark:bg-zinc-700" />
                </div>
                {[40, 28, 36, 24].map((w, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center border-b last:border-0 dark:border-zinc-700 py-3"
                  >
                    <div
                      className="h-3 rounded bg-gray-200 dark:bg-zinc-700"
                      style={{ width: `${w}%` }}
                    />
                    <div className="h-3 w-16 rounded bg-gray-200 dark:bg-zinc-700" />
                  </div>
                ))}
              </div>
            </>
          ) : failed ? (
            <LoadError message="리포트를 불러오지 못했습니다." onRetry={fetchSummary} />
          ) : summary.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                이 기간에 기록된 근무가 없습니다.
              </p>
              <Link
                href="/"
                className="mt-3 inline-block rounded-lg border border-gray-300 dark:border-zinc-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-zinc-200 transition hover:bg-gray-100 dark:hover:bg-zinc-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                근무 기록하러 가기
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                {dayjs(periodStart).format('YYYY.MM.DD')} ~ {dayjs(periodEnd).format('YYYY.MM.DD')}{' '}
                안건별 합계 시간
              </caption>
              <thead>
                <tr className="border-b dark:border-zinc-700 text-left text-gray-500 dark:text-zinc-500">
                  <th scope="col" className="py-2 font-medium">
                    안건명
                  </th>
                  <th scope="col" className="py-2 font-medium text-right">
                    합계 시간
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.key} className="border-b last:border-0 dark:border-zinc-700">
                    <td className="py-2.5 pr-2 dark:text-zinc-200 break-words">{row.name}</td>
                    <td className="py-2.5 text-right font-medium dark:text-zinc-200 whitespace-nowrap tabular-nums">
                      {row.hours.toFixed(2)}시간
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-zinc-600">
                  <td className="pt-3 font-semibold dark:text-white">합계</td>
                  <td className="pt-3 text-right font-semibold dark:text-white whitespace-nowrap tabular-nums">
                    {totalHours.toFixed(2)}시간
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    </main>
  )
}
