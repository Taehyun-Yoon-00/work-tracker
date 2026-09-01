'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import '../lib/dates'
import { supabase } from '../lib/supabase'
import { calcWorkHours } from '../lib/workTime'
import { getWeeksOfMonth } from '../lib/dates'

interface TeamOption {
  id: string
  name: string
}

interface MemberRow {
  userId: string
  name: string
}

interface WeekRange {
  label: string
  start: string
  end: string
}

function calcHours(log: any): number {
  return calcWorkHours(log)
}

function getMonthWeekRanges(monthDate: dayjs.Dayjs): WeekRange[] {
  return getWeeksOfMonth(monthDate).map((weekStart, i) => ({
    label: `${i + 1}주`,
    start: weekStart.format('YYYY-MM-DD'),
    end: weekStart.endOf('isoWeek').format('YYYY-MM-DD'),
  }))
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')

  const today = useMemo(() => dayjs(), [])
  const [targetYear, setTargetYear] = useState(today.year())
  const [targetMonth, setTargetMonth] = useState(today.month() + 1)

  const [members, setMembers] = useState<MemberRow[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_master')
        .eq('id', user.id)
        .single()
      const isMaster = !!profileData?.is_master

      let options: TeamOption[] = []
      if (isMaster) {
        const { data: allTeams } = await supabase
          .from('teams')
          .select('id, name')
          .order('name', { ascending: true })
        options = allTeams || []
      } else {
        const { data: adminTeams } = await supabase
          .from('team_members')
          .select('team_id, teams(id, name)')
          .eq('user_id', user.id)
          .eq('role', 'admin')
        options = (adminTeams || []).map((t: any) => t.teams).filter(Boolean)
      }

      if (options.length === 0) {
        // 팀장 권한이 있는 팀이 없으면 대시보드에 접근할 수 없음
        router.replace('/')
        return
      }

      setTeamOptions(options)
      setSelectedTeamId(options[0].id)
      setChecking(false)
    }
    init()
  }, [])

  const { periodStart, periodEnd } = useMemo(() => {
    const monthStart = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)
    return {
      periodStart: monthStart.startOf('month').format('YYYY-MM-DD'),
      periodEnd: monthStart.endOf('month').format('YYYY-MM-DD'),
    }
  }, [targetYear, targetMonth])

  const weeks = useMemo(
    () => getMonthWeekRanges(dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)),
    [targetYear, targetMonth]
  )

  useEffect(() => {
    if (selectedTeamId) fetchStats(selectedTeamId, periodStart, periodEnd)
  }, [selectedTeamId, periodStart, periodEnd])

  const fetchStats = async (teamId: string, start: string, end: string) => {
    setLoadingStats(true)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('user_id, profiles(name, email, is_master)')
      .eq('team_id', teamId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    const memberRows: MemberRow[] = (memberData || [])
      .filter((m: any) => !m.profiles?.is_master)
      .map((m: any) => ({
        userId: m.user_id,
        name: m.profiles?.name || m.profiles?.email?.split('@')[0] || '알 수 없음',
      }))
    setMembers(memberRows)

    if (memberRows.length === 0) {
      setLogs([])
      setLoadingStats(false)
      return
    }

    const { data: logData } = await supabase
      .from('work_logs')
      .select('user_id, date, start_time, end_time, break_minutes, is_next_day')
      .in(
        'user_id',
        memberRows.map((m) => m.userId)
      )
      .gte('date', start)
      .lte('date', end)

    setLogs(logData || [])
    setLoadingStats(false)
  }

  const perMemberHours = useMemo(() => {
    const map = new Map<string, number>()
    members.forEach((m) => map.set(m.userId, 0))
    logs.forEach((log) => {
      map.set(log.user_id, (map.get(log.user_id) || 0) + calcHours(log))
    })
    return members
      .map((m) => ({ ...m, hours: Math.round((map.get(m.userId) || 0) * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours)
  }, [members, logs])

  const totalHours = Math.round(perMemberHours.reduce((acc, m) => acc + m.hours, 0) * 100) / 100
  const avgHours =
    perMemberHours.length > 0 ? Math.round((totalHours / perMemberHours.length) * 100) / 100 : 0
  const maxHours = Math.max(1, ...perMemberHours.map((m) => m.hours))

  const weeklyMatrix = useMemo(() => {
    const result: { userId: string; name: string; weekHours: number[] }[] = []
    for (const m of perMemberHours) {
      const weekHours = weeks.map((w) => {
        const sum = logs
          .filter((log) => log.user_id === m.userId && log.date >= w.start && log.date <= w.end)
          .reduce((acc, log) => acc + calcHours(log), 0)
        return Math.round(sum * 100) / 100
      })
      result.push({ userId: m.userId, name: m.name, weekHours })
    }
    return result
  }, [perMemberHours, logs, weeks])

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

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">대시보드</h1>
        </div>

        {/* 팀 선택 + 기간 선택 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-semibold dark:text-white">팀 통계 기간</span>

            {teamOptions.length > 1 && (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              >
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">팀원</p>
            <p className="text-lg font-bold dark:text-white">{perMemberHours.length}명</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">총 근무시간</p>
            <p className="text-lg font-bold text-blue-500">{totalHours.toLocaleString()}h</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">평균 근무</p>
            <p className="text-lg font-bold dark:text-white">{avgHours}h</p>
          </div>
        </div>

        {loadingStats ? (
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4 text-center text-sm text-gray-400 dark:text-zinc-500">
            불러오는 중...
          </div>
        ) : (
          <>
            {/* 팀원별 근무시간 */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
              <h2 className="font-semibold mb-3 dark:text-white">팀원별 근무시간</h2>
              {perMemberHours.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  팀원이 없어요.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {perMemberHours.map((m) => (
                    <div key={m.userId} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-sm dark:text-zinc-200 truncate">
                        {m.name}
                      </span>
                      <div className="flex-1 h-4 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.max(4, (m.hours / maxHours) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-sm text-right font-medium dark:text-zinc-200">
                        {m.hours}h
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 주차별 근무시간 */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 overflow-x-auto">
              <h2 className="font-semibold mb-3 dark:text-white">주차별 근무시간</h2>
              {weeklyMatrix.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  팀원이 없어요.
                </p>
              ) : (
                <table className="w-full text-sm min-w-[360px]">
                  <thead>
                    <tr className="border-b dark:border-zinc-700 text-gray-400 dark:text-zinc-500">
                      <th className="py-2 text-left font-medium">팀원</th>
                      {weeks.map((w) => (
                        <th key={w.label} className="py-2 text-right font-medium">
                          {w.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyMatrix.map((row) => (
                      <tr key={row.userId} className="border-b last:border-0 dark:border-zinc-700">
                        <td className="py-2 dark:text-zinc-200 whitespace-nowrap">{row.name}</td>
                        {row.weekHours.map((h, i) => (
                          <td
                            key={i}
                            className="py-2 text-right dark:text-zinc-200 whitespace-nowrap"
                          >
                            {h}h
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
