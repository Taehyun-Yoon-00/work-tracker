'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import '../lib/dates'
import { supabase } from '../lib/supabase'
import { getWeeksOfMonth, getSettlementPeriod } from '../lib/dates'
import { fetchSubstituteHolidays } from '../lib/holidays'
import {
  getDashboardUnits,
  buildStatRows,
  groupLogsByUser,
  DETAIL_UNIT_NOUN,
  WEEKLY_UNIT_NOUN,
  UNIT_NAME_HEADER,
  type ScopeLevel,
  type DashboardUnitLevel,
  type DashboardUnit,
  type DashboardMemberRow,
} from '../lib/dashboardStats'
import OrgScopeSelect, { OrgScopeOption } from '../components/ui/OrgScopeSelect'
import SectionHeader from '../components/ui/SectionHeader'
import UnitStatBarRow from '../components/ui/UnitStatBarRow'

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
//
// ScopeLevel 자체(및 그 아래 상세 표시 단위 계산)는 lib/dashboardStats로 옮겼다 —
// "선택한 조직 전체 통계 + 한 단계 아래 조직 단위 비교"라는 원칙을 이 페이지와 무관하게
// 재사용할 수 있게 하기 위함이다(요구사항 6, 7).

// 월간 통계 집계 기준.
// - calendar: 달력상 1일 ~ 말일
// - settlement: 정산 기준(전월 16일 ~ 당월 15일). 팀 상세/리포트 페이지와 같은 규칙(lib/dates.ts).
// 주간 통계는 이 값과 무관하게 항상 월~일 단위로 고정된다.
type MonthPeriodMode = 'calendar' | 'settlement'

interface WeekRange {
  label: string
  start: string
  end: string
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

  // 상세 표시 단위(개인/팀/부서/부문)와 그 목록, 그리고 선택한 조직 전체 구성원.
  // scope가 바뀌면 fetchStats에서 세 값을 함께 갱신한다(lib/dashboardStats.getDashboardUnits).
  const [unitLevel, setUnitLevel] = useState<DashboardUnitLevel>('member')
  const [units, setUnits] = useState<DashboardUnit[]>([])
  const [allMembers, setAllMembers] = useState<DashboardMemberRow[]>([])
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

  // ---- scope에 따른 상세 표시 단위 + 전체 구성원 조회 ----
  // 조직 조회 자체(정렬 규칙, 직속 인원 처리 등)는 lib/dashboardStats.getDashboardUnits로
  // 옮겼다. 이 페이지는 그 결과(units, allMembers)를 가지고 화면을 그리는 데만 집중한다.
  const fetchStats = async (level: ScopeLevel, entityId: string, start: string, end: string) => {
    setLoadingStats(true)

    const result = await getDashboardUnits(level, entityId)
    setUnitLevel(result.unitLevel)
    setUnits(result.units)
    setAllMembers(result.allMembers)

    if (result.allMembers.length === 0) {
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
        result.allMembers.map((m) => m.userId)
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
  const monthlyLogsByUser = useMemo(() => groupLogsByUser(monthlyLogs), [monthlyLogs])
  const logsByUser = useMemo(() => groupLogsByUser(logs), [logs])

  // 조직 전체 통계(요구사항 7의 "선택한 조직 전체") — allMembers 전체를 unit 하나로 묶어
  // buildStatRows에 넘기면 상세 단위와 완전히 같은 계산 로직으로 총합을 얻을 수 있다.
  const totalUnit = useMemo<DashboardUnit[]>(
    () => [{ id: '__total__', name: '전체', members: allMembers }],
    [allMembers]
  )
  const totalStats = useMemo(
    () => buildStatRows(totalUnit, monthlyLogsByUser, [], substituteHolidays)[0],
    [totalUnit, monthlyLogsByUser, substituteHolidays]
  )

  // 상세 통계: 선택한 scope 한 단계 아래 조직 단위(개인/팀/부서/부문)별 월간 합계.
  // units는 조직관리 순서(display_order 기준)를 그대로 따르므로 여기서 다시 정렬하지 않는다.
  const detailStatRows = useMemo(
    () => buildStatRows(units, monthlyLogsByUser, [], substituteHolidays),
    [units, monthlyLogsByUser, substituteHolidays]
  )
  const maxHours = Math.max(1, ...detailStatRows.map((r) => r.totalHours))

  // 주간 통계: 이번 달에 걸친 각 주(월~일) 전체 범위 기준, 상세 통계와 같은 단위(unit)로 집계한다.
  // 월 경계를 넘나드는 주도 그 주에 속한 모든 날짜의 로그를 합산하므로, 어느 달에서 보든 같은 합계로 나온다.
  const weeklyStatRows = useMemo(
    () => buildStatRows(units, logsByUser, weeks, substituteHolidays),
    [units, logsByUser, weeks, substituteHolidays]
  )

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
          <h1 className="text-xl font-semibold dark:text-white">대시보드</h1>
        </div>

        {/* 조직 단위 필터 — 통계 기간과 독립된, 가장 상단의 별도 섹션 */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 mb-4">
          <OrgScopeSelect
            options={scopeOptions}
            value={selectedScope}
            onChange={(opt) => setSelectedScope(opt)}
          />
        </div>

        {/* ===================== 월간 통계 ===================== */}
        <SectionHeader size="base" className="mb-2 px-1">
          월간 통계
        </SectionHeader>

        {/* 통계 기간 (연/월 선택 + 집계 기준 토글, 한 행에 배치) */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 mb-4">
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

        {/* 전체 요약 — 선택한 조직 "전체" 기준 총합을 하나의 통계 영역으로 묶어서 보여준다
           (요구사항 2~5, 7: 상세 단위와는 분리된 값). 항목마다 독립된 카드로 나누지 않고
           총 근무시간을 중심 지표로, 인원/평일/휴일을 보조 지표 행으로 배치한다. */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 mb-4">
          <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">총 근무시간</p>
          <p className="text-2xl font-semibold dark:text-white mb-4">
            {(totalStats?.totalHours ?? 0).toLocaleString()}h
          </p>
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-zinc-700 border-t border-gray-100 dark:border-zinc-700 pt-3">
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">인원</p>
              <p className="text-sm font-semibold dark:text-white">
                {(totalStats?.memberCount ?? 0)}명
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">평일 근무</p>
              <p className="text-sm font-semibold text-blue-500">
                {(totalStats?.weekdayHours ?? 0).toLocaleString()}h
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">휴일 근무</p>
              <p className="text-sm font-semibold text-orange-500">
                {(totalStats?.holidayHours ?? 0).toLocaleString()}h
              </p>
            </div>
          </div>
        </div>

        {loadingStats ? (
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 mb-4 text-center text-sm text-gray-400 dark:text-zinc-500">
            불러오는 중...
          </div>
        ) : (
          <>
            {/* 상세 통계 — scope에 따라 개인/팀/부서/부문 중 한 단계 아래 단위를 보여준다(요구사항 6, 11) */}
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold dark:text-white">
                  {DETAIL_UNIT_NOUN[unitLevel]}별 근무시간
                </h3>
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
              {detailStatRows.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  표시할 데이터가 없어요.
                </p>
              ) : (
                <div className="space-y-3 sm:space-y-2.5">
                  {detailStatRows.map((row) => {
                    // 그래프 계산 로직은 그대로 유지 — maxHours 대비 상대적인 막대 폭만 여기서 구하고,
                    // 실제 렌더링(라벨 폭, Desktop/Mobile 레이아웃)은 UnitStatBarRow가 담당한다.
                    const barPct =
                      row.totalHours > 0 ? Math.max(4, (row.totalHours / maxHours) * 100) : 0
                    const weekdayPct =
                      row.totalHours > 0 ? (row.weekdayHours / row.totalHours) * barPct : 0
                    const holidayPct =
                      row.totalHours > 0 ? (row.holidayHours / row.totalHours) * barPct : 0
                    return (
                      <UnitStatBarRow
                        key={row.id}
                        unitLevel={unitLevel}
                        name={row.name}
                        totalHours={row.totalHours}
                        weekdayHours={row.weekdayHours}
                        holidayHours={row.holidayHours}
                        weekdayPct={weekdayPct}
                        holidayPct={holidayPct}
                        memberCount={row.memberCount}
                        averageHours={row.averageHours}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* ===================== 주간 통계 ===================== */}
            <SectionHeader size="base" className="mb-2 px-1">
              주간 통계
            </SectionHeader>

            {/* 주차별 근무시간 — 1주(월~일) 단위. 월 경계에 걸친 주는 실제 날짜 범위로 표시하고,
               양쪽 달의 근무 기록을 합산해서 보여준다. */}
            <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold dark:text-white">
                  {WEEKLY_UNIT_NOUN[unitLevel]}별 주차별 근무시간
                </h3>
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
              {weeklyStatRows.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
                  표시할 데이터가 없어요.
                </p>
              ) : (
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b dark:border-zinc-700 text-gray-400 dark:text-zinc-500">
                      <th className="py-2 text-left font-medium">{UNIT_NAME_HEADER[unitLevel]}</th>
                      {weeks.map((w) => (
                        <th key={w.start} className="py-2 text-right font-medium whitespace-nowrap">
                          {w.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyStatRows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 dark:border-zinc-700">
                        <td
                          className="py-2 dark:text-zinc-200 whitespace-nowrap max-w-[7rem] truncate"
                          title={row.name}
                        >
                          {row.name}
                        </td>
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
