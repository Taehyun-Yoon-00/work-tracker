'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { getSettlementPeriod } from '../lib/dates'

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

interface TemplateInfo {
  filename: string
  uploadedAt: string
  uploadedBy: string
}

export default function ReportPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const today = useMemo(() => dayjs(), [])
  const [targetYear, setTargetYear] = useState(today.year())
  const [targetMonth, setTargetMonth] = useState(today.month() + 1) // 1-12
  const [summary, setSummary] = useState<MatterSummary[]>([])
  const [loading, setLoading] = useState(false)

  // 엑셀 출력(서포트리스트) 관련 상태
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  // 서포트리스트 양식 업로드는 총괄 관리자/마스터만 볼 수 있다.
  const [canManageTemplate, setCanManageTemplate] = useState(false)
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')

  const fetchTemplateInfo = async () => {
    const res = await fetch('/api/admin/report-template')
    const data = await res.json()
    if (res.ok) setTemplateInfo(data.template)
  }

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      // 총괄 관리자/마스터 여부 확인 — 서포트리스트 양식 업로드 카드 노출 여부에만 쓴다.
      const [{ data: profileData }, { data: generalAdminRow }] = await Promise.all([
        supabase.from('profiles').select('is_master').eq('id', user.id).single(),
        supabase.from('general_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      ])
      const isAllowed = !!profileData?.is_master || !!generalAdminRow
      setCanManageTemplate(isAllowed)
      if (isAllowed) fetchTemplateInfo()
    }
    getUser()
  }, [])

  const handleTemplateUpload = async (file: File) => {
    setUploadingTemplate(true)
    setTemplateMessage('')
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/admin/report-template', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok || data.error) {
      setTemplateMessage(data.error ? data.error : '업로드 실패: 알 수 없는 오류')
    } else {
      setTemplateMessage('서포트리스트 양식이 업로드됐어요!')
      fetchTemplateInfo()
    }
    setUploadingTemplate(false)
  }

  const handleExport = async () => {
    setExporting(true)
    setExportMessage('')
    const res = await fetch('/api/report/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: targetYear, month: targetMonth }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setExportMessage(data.error || '출력에 실패했어요.')
      setExporting(false)
      return
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/)
    const filename = match
      ? decodeURIComponent(match[1])
      : `서포트리스트_${targetYear}_${targetMonth}.xlsx`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // 선택한 "당월"을 기준으로 전월 16일 ~ 당월 15일 범위를 계산.
  // 이 규칙은 팀 상세 페이지와도 같아서 lib/dates.ts의 getSettlementPeriod를 함께 쓴다.
  const { periodStart, periodEnd } = useMemo(() => {
    const targetMonthStart = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)
    const { start, end } = getSettlementPeriod(targetMonthStart)
    return { periodStart: start, periodEnd: end }
  }, [targetYear, targetMonth])

  useEffect(() => {
    if (user) fetchSummary()
  }, [user, periodStart, periodEnd])

  const fetchSummary = async () => {
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
    ;(data || []).forEach((row: any) => {
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
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
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

          {/* 서포트리스트(엑셀) 출력 — 총괄 관리자가 올려둔 양식에 이 기간 근무시간을 채워 넣는다 */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full mt-3 bg-blue-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {exporting ? '엑셀 만드는 중...' : '엑셀로 출력'}
          </button>
          {exportMessage && (
            <p className="text-xs text-red-500 text-center mt-2">{exportMessage}</p>
          )}
        </div>

        {/* 서포트리스트 양식 관리 (총괄 관리자/마스터 전용) */}
        {canManageTemplate && (
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
            <h2 className="font-semibold mb-1 dark:text-white">서포트리스트 양식 관리</h2>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
              서포트리스트 엑셀 양식(.xlsx)이에요. 
              새로 업로드하면 그 다음 출력부터 바로 최신 양식이 적용돼요.
            </p>
            {templateInfo ? (
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
                현재 양식: <span className="font-medium">{templateInfo.filename}</span>
                <br />
                {dayjs(templateInfo.uploadedAt).format('YYYY.MM.DD HH:mm')} ·{' '}
                {templateInfo.uploadedBy} 업로드
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
                아직 업로드된 양식이 없어요.
              </p>
            )}
            <input
              type="file"
              accept=".xlsx"
              disabled={uploadingTemplate}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleTemplateUpload(file)
                e.target.value = ''
              }}
              className="text-sm text-gray-600 dark:text-zinc-300"
            />
            {uploadingTemplate && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">업로드 중...</p>
            )}
            {templateMessage && (
              <p className="text-xs text-blue-500 mt-2">{templateMessage}</p>
            )}
          </div>
        )}

        {/* 안건별 합계시간 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4">
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
        </div>
      </div>
    </div>
  )
}
