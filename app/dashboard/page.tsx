'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import '../lib/dates'
import { supabase } from '../lib/supabase'
import { calcWorkHours } from '../lib/workTime'
import { getWeeksOfMonth, getSettlementPeriod } from '../lib/dates'
import { isHoliday as isHolidayShared, fetchSubstituteHolidays } from '../lib/holidays'
import {
  fetchTeamMembers,
  fetchDepartmentScope,
  fetchDivisionMembers,
  fetchCompanyMembers,
} from '../lib/orgOrder'
import OrgScopeSelect, { OrgScopeOption } from '../components/ui/OrgScopeSelect'

// 대시보드 조회 범위 (req 6).
// - team: 팀장(team_members.role='admin') 기본 범위. 팀 하나.
// - department: 부서장 기본 범위. 이 부서(부서 직속 + 산하 모든 팀).
// - division: 부문장 기본 범위. 이 부문(산하 모든 부서).
// - company: 총괄 관리자/마스터 기본 범위. 회사 전체.
//
// 역할별로 선택 가능한 옵션(조직 단위 콤보박스 하나에 모두 담긴다):
//   팀장            → 본인이 팀장인 팀들
//   부서장          → 부서 전체 + 그 산하 팀들
//   부문장          → 부문 전체 + 그 산하 부서들
//   총괄 관리자     → 회사 전체 + 산하 부문들
//   마스터(시스템)  → 회사 전체 + 전체 부문 · 부서 · 팀 트리
type ScopeLevel = 'team' | 'department' | 'division' | 'company'

// 월간 통계 집계 기준.
// - calendar: 달력상 1일 ~ 말일
// - settlement: 정산 기준(전월 16일 ~ 당월 15일). 팀 상세/리포트 페이지와 같은 규칙(lib/dates.ts).
// 주간 통계는 이 값과 무관하게 항상 월~일 단위로 고정된다.
type MonthPeriodMode = 'calendar' | 'settlement'

interface MemberRow {
  userId: string
  name: string
}

interface WeekRange {
  label: string
  start: string
  end: string
}

// 평일/휴일로 나눈 근무시간
interface HourSplit {
  weekday: number
  holiday: number
  total: number
}

function calcHours(log: any): number {
  return calcWorkHours(log)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 주간 라벨: "1주"가 아닌 실제 날짜 범위("7/28~8/3")로 표시. 연도가 다르면 시작일에 연도를 붙인다. */
function formatWeekLabel(start: dayjs.Dayjs, end: dayjs.Dayjs): string {
  const startLabel = start.year() === end.year() ? start.format('M/D') : start.format('YY.M/D')
  return `${startLabel}~${end.format('M/D')}`
}

/**
 * 해당 달이 걸쳐 있는 주(월요일~일요일) 목록.
 * 월의 시작/끝 주가 이전 달·다음 달과 겹치는 경우 그 주 전체(양쪽 달의 날짜 포함)를 그대로 담는다 —
 * 예) 7월 마지막 주가 8월 1~3일까지 걸쳐 있으면 그 주의 범위는 7/28~8/3이 된다.
 * 이 범위를 기준으로 로그를 조회하면 7월/8월 어느 쪽에서 보더라도 같은 주는 같은 합계로 보인다.
 */
function getMonthWeekRanges(monthDate: dayjs.Dayjs): WeekRange[] {
  return getWeeksOfMonth(monthDate).map((weekStart) => {
    const weekEnd = weekStart.endOf('isoWeek')
    return {
      label: formatWeekLabel(weekStart, weekEnd),
      start: weekStart.format('YYYY-MM-DD'),
      end: weekEnd.format('YYYY-MM-DD'),
    }
  })
}

/** 로그 목록을 평일/휴일로 나눠 합산한다. */
function splitHoursByHoliday(logs: any[], substituteHolidays: string[]): HourSplit {
  let weekday = 0
  let holiday = 0
  logs.forEach((log) => {
    const hours = calcHours(log)
    if (isHolidayShared(new Date(log.date), substituteHolidays)) holiday += hours
    else weekday += hours
  })
  return { weekday: round2(weekday), holiday: round2(holiday), total: round2(weekday + holiday) }
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  // 조직 단위 선택 — 레벨(팀/부서/부문/전체)과 항목을 나눈 2단계 선택 대신,
  // 역할에 맞게 미리 평탄화한 옵션 목록에서 한 번만 고르는 단일 콤보박스를 쓴다.
  const [scopeOptions, setScopeOptions] = useState<OrgScopeOption[]>([])
  const [selectedScope, setSelectedScope] = useState<OrgScopeOption | null>(null)

  const today = useMemo(() => dayjs(), [])
  const [targetYear, setTargetYear] = useState(today.year())
  const [targetMonth, setTargetMonth] = useState(today.month() + 1)
  const [periodMode, setPeriodMode] = useState<MonthPeriodMode>('calendar')

  const [members, setMembers] = useState<MemberRow[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])
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

      const [
        { data: profileData },
        { data: generalAdminRow },
        { data: headDivs },
        { data: headDepts },
        { data: adminTeamRows },
        substituteHolidayDates,
      ] = await Promise.all([
        supabase.from('profiles').select('is_master').eq('id', user.id).single(),
        supabase.from('general_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('divisions').select('id, name').eq('head_user_id', user.id),
        supabase
          .from('departments')
          .select('id, name, division_id, divisions(name)')
          .eq('head_user_id', user.id),
        supabase
          .from('team_members')
          .select('team_id, teams(id, name, department_id, departments(name, division_id, divisions(name)))')
          .eq('user_id', user.id)
          .eq('role', 'admin'),
        fetchSubstituteHolidays(),
      ])
      setSubstituteHolidays(substituteHolidayDates)
      const isMasterFlag = !!profileData?.is_master
      const isGeneralAdmin = !!generalAdminRow

      // 조직 단위 콤보박스 옵션 — 역할에 따라 접근 가능한 범위를, 상위 조직부터 이어붙인
      // 경로 형태의 라벨("기술부문", "기술부문 > 제어기술부")로 평탄화한다. 경로 자체가
      // "그 조직 전체"를 의미하므로 별도의 "전체" 표시는 회사 최상위 옵션에만 붙인다.
      //
      // 한 사람이 여러 조직장을 겸임할 수 있으므로(예: 부문장이면서 동시에 다른 부서의
      // 부서장), 역할별 옵션을 배타적으로 고르지 않고 해당되는 역할을 모두 합쳐서 보여준다.
      // 마스터는 이미 전체 트리를 보므로 예외적으로 다른 역할과 합치지 않는다.
      const opts: OrgScopeOption[] = []
      const seen = new Set<string>()
      const addOpt = (opt: OrgScopeOption) => {
        const key = `${opt.level}:${opt.entityId}`
        if (seen.has(key)) return
        seen.add(key)
        opts.push(opt)
      }

      if (isMasterFlag) {
        // 마스터: 회사 전체 + 전체 부문 · 부서 · 팀 트리
        const [{ data: allDivs }, { data: allDepts }, { data: allTeams }] = await Promise.all([
          supabase.from('divisions').select('id, name').order('display_order', { ascending: true }),
          supabase
            .from('departments')
            .select('id, name, division_id')
            .order('division_id', { ascending: true })
            .order('display_order', { ascending: true }),
          supabase
            .from('teams')
            .select('id, name, department_id')
            .order('department_id', { ascending: true })
            .order('display_order', { ascending: true }),
        ])
        const deptsByDivision = new Map<string, any[]>()
        ;(allDepts || []).forEach((d: any) => {
          const arr = deptsByDivision.get(d.division_id) || []
          arr.push(d)
          deptsByDivision.set(d.division_id, arr)
        })
        const teamsByDepartment = new Map<string, any[]>()
        ;(allTeams || []).forEach((t: any) => {
          const arr = teamsByDepartment.get(t.department_id) || []
          arr.push(t)
          teamsByDepartment.set(t.department_id, arr)
        })

        addOpt({ level: 'company', entityId: '', label: '전체' })
        ;(allDivs || []).forEach((div: any) => {
          addOpt({ level: 'division', entityId: div.id, label: div.name })
          ;(deptsByDivision.get(div.id) || []).forEach((dept: any) => {
            const deptLabel = `${div.name} > ${dept.name}`
            addOpt({ level: 'department', entityId: dept.id, label: deptLabel })
            ;(teamsByDepartment.get(dept.id) || []).forEach((team: any) => {
              addOpt({
                level: 'team',
                entityId: team.id,
                label: `${deptLabel} > ${team.name}`,
              })
            })
          })
        })
      } else {
        // 마스터가 아니면 겸임 중인 역할을 모두 합친다.
        if (isGeneralAdmin) {
          // 총괄 관리자: 회사 전체 + 산하 부문들
          const { data: allDivs } = await supabase
            .from('divisions')
            .select('id, name')
            .order('display_order', { ascending: true })
          addOpt({ level: 'company', entityId: '', label: '전체' })
          ;(allDivs || []).forEach((div: any) => {
            addOpt({ level: 'division', entityId: div.id, label: div.name })
          })
        }

        if ((headDivs?.length ?? 0) > 0) {
          // 부문장: 부문 전체 + 그 산하 부서들
          for (const div of headDivs || []) {
            addOpt({ level: 'division', entityId: div.id, label: div.name })
            const { data: depts } = await supabase
              .from('departments')
              .select('id, name')
              .eq('division_id', div.id)
              .order('display_order', { ascending: true })
            ;(depts || []).forEach((dept: any) => {
              addOpt({
                level: 'department',
                entityId: dept.id,
                label: `${div.name} > ${dept.name}`,
              })
            })
          }
        }

        if ((headDepts?.length ?? 0) > 0) {
          // 부서장: 부서 전체 + 그 산하 팀들
          for (const dept of headDepts || []) {
            const divName = (dept as any).divisions?.name
            const deptLabel = divName ? `${divName} > ${dept.name}` : dept.name
            addOpt({ level: 'department', entityId: dept.id, label: deptLabel })
            const { data: teams } = await supabase
              .from('teams')
              .select('id, name')
              .eq('department_id', dept.id)
              .order('display_order', { ascending: true })
            ;(teams || []).forEach((team: any) => {
              addOpt({
                level: 'team',
                entityId: team.id,
                label: `${deptLabel} > ${team.name}`,
              })
            })
          }
        }

        // 팀장: 본인이 팀장인 팀들 (다른 역할과 함께 겸임 중이어도 항상 포함)
        ;(adminTeamRows || [])
          .map((row: any) => row.teams)
          .filter(Boolean)
          .forEach((team: any) => {
            const dept = team.departments
            const divName = dept?.divisions?.name
            const label = [divName, dept?.name, team.name].filter(Boolean).join(' > ')
            addOpt({ level: 'team', entityId: team.id, label })
          })
      }

      if (opts.length === 0) {
        // 대시보드를 조회할 권한(팀장 이상)이 없으면 접근 차단
        router.replace('/')
        return
      }

      setScopeOptions(opts)
      setSelectedScope(opts[0])
      setChecking(false)
    }
    init()
  }, [])

  // 월간 통계 기간: 토글에 따라 "달력 1일~말일" 또는 "정산 기준 전월16일~당월15일"을 쓴다.
  // 선택한 연/월을 "당월"로 보고, 정산 기준은 report/team 상세 페이지와 같은 규칙(lib/dates.ts)을 따른다.
  const { periodStart, periodEnd } = useMemo(() => {
    const monthStart = dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)
    if (periodMode === 'settlement') {
      const { start, end } = getSettlementPeriod(monthStart)
      return { periodStart: start, periodEnd: end }
    }
    return {
      periodStart: monthStart.startOf('month').format('YYYY-MM-DD'),
      periodEnd: monthStart.endOf('month').format('YYYY-MM-DD'),
    }
  }, [targetYear, targetMonth, periodMode])

  // 주간 통계는 통계 기준 토글과 무관하게 항상 달력상 해당 월에 걸친 주(월~일) 기준이다.
  const weeks = useMemo(
    () => getMonthWeekRanges(dayjs(`${targetYear}-${String(targetMonth).padStart(2, '0')}-01`)),
    [targetYear, targetMonth]
  )

  // 실제 로그 조회 범위: "이번 달에 걸친 주(월~일) 전체 범위"와 "월간 통계 기간(달력 또는 정산 기준)"을
  // 모두 포함하도록 넓게 잡는다. 정산 기준(16~15일)은 주 범위보다 이전 달까지 더 거슬러 올라갈 수 있어서
  // 둘 중 더 이른 시작일 / 더 늦은 종료일을 사용해야 두 통계 모두 정확하게 계산된다.
  const { fetchRangeStart, fetchRangeEnd } = useMemo(() => {
    if (weeks.length === 0) return { fetchRangeStart: periodStart, fetchRangeEnd: periodEnd }
    const weekRangeStart = weeks[0].start
    const weekRangeEnd = weeks[weeks.length - 1].end
    return {
      fetchRangeStart: weekRangeStart < periodStart ? weekRangeStart : periodStart,
      fetchRangeEnd: weekRangeEnd > periodEnd ? weekRangeEnd : periodEnd,
    }
  }, [weeks, periodStart, periodEnd])

  // ---- 범위별 구성원 조회 ----
  // 정렬/조회 규칙은 lib/orgOrder에 모아둔 공용 로직을 그대로 쓴다 — 조직관리, 내소속 화면과
  // 항상 같은 순서(팀장/부서장/부문장이 각 조직 단위에서 최상단, 나머지는 display_order 순서)를 보장한다.
  const fetchTeamScopeMembers = async (teamId: string): Promise<MemberRow[]> =>
    (await fetchTeamMembers(teamId)).map((m) => ({ userId: m.user_id, name: m.name }))

  const fetchDepartmentScopeMembers = async (departmentId: string): Promise<MemberRow[]> =>
    (await fetchDepartmentScope(departmentId)).allMembers.map((m) => ({
      userId: m.user_id,
      name: m.name,
    }))

  const fetchDivisionScopeMembers = async (divisionId: string): Promise<MemberRow[]> =>
    (await fetchDivisionMembers(divisionId)).map((m) => ({ userId: m.user_id, name: m.name }))

  const fetchCompanyScopeMembers = async (): Promise<MemberRow[]> =>
    (await fetchCompanyMembers()).map((m) => ({ userId: m.user_id, name: m.name }))

  const fetchStats = async (level: ScopeLevel, entityId: string, start: string, end: string) => {
    setLoadingStats(true)

    let memberRows: MemberRow[] = []
    if (level === 'team') memberRows = entityId ? await fetchTeamScopeMembers(entityId) : []
    else if (level === 'department')
      memberRows = entityId ? await fetchDepartmentScopeMembers(entityId) : []
    else if (level === 'division')
      memberRows = entityId ? await fetchDivisionScopeMembers(entityId) : []
    else memberRows = await fetchCompanyScopeMembers()

    setMembers(memberRows)

    if (memberRows.length === 0) {
      setLogs([])
      setLoadingStats(false)
      return
    }

    // 월간 통계 기간뿐 아니라, 그 달에 걸친 주(週) 전체 범위까지 포함해서 조회한다.
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

  useEffect(() => {
    if (checking || !selectedScope) return
    fetchStats(
      selectedScope.level as ScopeLevel,
      selectedScope.entityId,
      fetchRangeStart,
      fetchRangeEnd
    )
  }, [checking, selectedScope, fetchRangeStart, fetchRangeEnd])

  // 월간 통계는 달력상 이번 달(periodStart~periodEnd)에 해당하는 로그만 사용한다.
  const monthlyLogs = useMemo(
    () => logs.filter((log) => log.date >= periodStart && log.date <= periodEnd),
    [logs, periodStart, periodEnd]
  )

  // members는 조직관리 페이지와 동일한 순서(display_order 기준)로 이미 정렬돼 있으므로
  // 여기서 근무시간 기준으로 다시 정렬하지 않는다 — 조직관리 페이지에서 정한 순서를 그대로 따른다.
  const perMemberHours = useMemo(() => {
    const map = new Map<string, any[]>()
    members.forEach((m) => map.set(m.userId, []))
    monthlyLogs.forEach((log) => {
      const arr = map.get(log.user_id)
      if (arr) arr.push(log)
    })
    return members.map((m) => {
      const split = splitHoursByHoliday(map.get(m.userId) || [], substituteHolidays)
      return { ...m, weekday: split.weekday, holiday: split.holiday, hours: split.total }
    })
  }, [members, monthlyLogs, substituteHolidays])

  const totalHours = round2(perMemberHours.reduce((acc, m) => acc + m.hours, 0))
  const totalWeekdayHours = round2(perMemberHours.reduce((acc, m) => acc + m.weekday, 0))
  const totalHolidayHours = round2(perMemberHours.reduce((acc, m) => acc + m.holiday, 0))
  const avgHours =
    perMemberHours.length > 0 ? round2(totalHours / perMemberHours.length) : 0
  const maxHours = Math.max(1, ...perMemberHours.map((m) => m.hours))

  // 주간 통계: 이번 달에 걸친 각 주(월~일) 전체 범위 기준. 월 경계를 넘나드는 주도
  // 그 주에 속한 모든 날짜의 로그를 합산하므로, 어느 달에서 보든 같은 합계로 나온다.
  const weeklyMatrix = useMemo(() => {
    return perMemberHours.map((m) => {
      const weekStats = weeks.map((w) => {
        const logsInWeek = logs.filter(
          (log) => log.user_id === m.userId && log.date >= w.start && log.date <= w.end
        )
        return splitHoursByHoliday(logsInWeek, substituteHolidays)
      })
      return { userId: m.userId, name: m.name, weekStats }
    })
  }, [perMemberHours, logs, weeks, substituteHolidays])

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

        {/* 조직 단위 필터 — 통계 기간과 독립된, 가장 상단의 별도 섹션 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
          <OrgScopeSelect
            options={scopeOptions}
            value={selectedScope}
            onChange={(opt) => setSelectedScope(opt)}
          />
        </div>

        {/* ===================== 월간 통계 ===================== */}
        <h2 className="text-base font-bold text-gray-500 dark:text-zinc-400 mb-2 px-1">
          월간 통계
        </h2>

        {/* 통계 기간 (연/월 선택 + 집계 기준 토글, 한 행에 배치) */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveMonth(-1)}
                aria-label="이전 달"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
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
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
              >
                ›
              </button>
            </div>

            <div className="inline-flex shrink-0 rounded-lg border border-gray-200 dark:border-zinc-600 overflow-hidden">
              <button
                onClick={() => setPeriodMode('calendar')}
                className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  periodMode === 'calendar'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-zinc-700 text-gray-500 dark:text-zinc-300'
                }`}
              >
                1~말일
              </button>
              <button
                onClick={() => setPeriodMode('settlement')}
                className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  periodMode === 'settlement'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-zinc-700 text-gray-500 dark:text-zinc-300'
                }`}
              >
                16~15일
              </button>
            </div>
          </div>
          <p className="text-right text-[11px] text-gray-400 dark:text-zinc-500 mt-1 pr-2">
            {periodMode === 'calendar'
              ? `${dayjs(periodStart).format('M/D')} ~ ${dayjs(periodEnd).format('M/D')}`
              : `${dayjs(periodStart).format('YY.M/D')} ~ ${dayjs(periodEnd).format('M/D')}`}
          </p>
        </div>

        {/* 통계 카드 — 근무시간은 평일/휴일로 나눠 표시 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">인원</p>
            <p className="text-lg font-bold dark:text-white">{perMemberHours.length}명</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">평일 근무</p>
            <p className="text-lg font-bold text-blue-500">{totalWeekdayHours.toLocaleString()}h</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">휴일 근무</p>
            <p className="text-lg font-bold text-orange-500">
              {totalHolidayHours.toLocaleString()}h
            </p>
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
            {/* 인원별 근무시간 */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold dark:text-white">인원별 근무시간</h3>
                <span className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    평일
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                    휴일
                  </span>
                </span>
              </div>
              {perMemberHours.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  인원이 없어요.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {perMemberHours.map((m) => {
                    const barPct =
                      m.hours > 0 ? Math.max(4, (m.hours / maxHours) * 100) : 0
                    const weekdayPct = m.hours > 0 ? (m.weekday / m.hours) * barPct : 0
                    const holidayPct = m.hours > 0 ? (m.holiday / m.hours) * barPct : 0
                    return (
                      <div key={m.userId} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-sm dark:text-zinc-200 truncate">
                          {m.name}
                        </span>
                        <div className="flex-1 h-4 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden flex">
                          <div className="h-full bg-blue-500" style={{ width: `${weekdayPct}%` }} />
                          <div
                            className="h-full bg-orange-400"
                            style={{ width: `${holidayPct}%` }}
                          />
                        </div>
                        {/* 합계와 평일/휴일 내역을 같은 오른쪽 열에 세로로 쌓아서 한눈에 읽히게 한다.
                           고정 폭(w-20)이라 자릿수가 달라져도 막대 폭은 흔들리지 않는다. */}
                        <div className="w-20 shrink-0 text-right">
                          <p className="text-sm font-medium dark:text-zinc-200">{m.hours}h</p>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">
                            <span className="text-blue-500">{m.weekday}h</span>
                            <span> · </span>
                            <span className="text-orange-500">{m.holiday}h</span>
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ===================== 주간 통계 ===================== */}
            <h2 className="text-base font-bold text-gray-500 dark:text-zinc-400 mb-2 px-1">
              주간 통계
            </h2>

            {/* 주차별 근무시간 — 1주(월~일) 단위. 월 경계에 걸친 주는 실제 날짜 범위로 표시하고,
               양쪽 달의 근무 기록을 합산해서 보여준다. */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold dark:text-white">주차별 근무시간</h3>
                <span className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    평일
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                    휴일
                  </span>
                </span>
              </div>
              {weeklyMatrix.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  인원이 없어요.
                </p>
              ) : (
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b dark:border-zinc-700 text-gray-400 dark:text-zinc-500">
                      <th className="py-2 text-left font-medium">이름</th>
                      {weeks.map((w) => (
                        <th key={w.start} className="py-2 text-right font-medium whitespace-nowrap">
                          {w.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyMatrix.map((row) => (
                      <tr key={row.userId} className="border-b last:border-0 dark:border-zinc-700">
                        <td className="py-2 dark:text-zinc-200 whitespace-nowrap">{row.name}</td>
                        {row.weekStats.map((stat, i) => (
                          <td
                            key={i}
                            className="py-2 text-right dark:text-zinc-200 whitespace-nowrap"
                          >
                            <div className="font-medium">{stat.total}h</div>
                            <div className="text-[10px] text-gray-400 dark:text-zinc-500">
                              (<span className="text-blue-500">{stat.weekday}h</span>
                              <span> · </span>
                              <span className="text-orange-500">{stat.holiday}h</span>)
                            </div>
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
