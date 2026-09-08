import { supabase } from './supabase'
import { displayName } from './labels'
import { calcWorkHours } from './workTime'
import { isHoliday as isHolidayShared } from './holidays'
import {
  fetchTeamMembers,
  fetchDepartmentScope,
  fetchDivisionMembers,
  type OrgMember,
} from './orgOrder'

/**
 * 대시보드의 "조직 단위 집계"를 담당하는 공용 모듈.
 *
 * 핵심 아이디어(요구사항 6, 7): 대시보드는 언제나
 *   1) 선택한 조직(scope) 전체를 기준으로 한 "전체 통계" 한 덩어리
 *   2) 그 바로 한 단계 아래 조직 단위로 나눈 "상세 통계" 여러 덩어리
 * 를 함께 보여준다. 이 두 통계 모두 결국 "구성원 집합 하나 → 근무시간 합계"라는
 * 같은 계산을 반복하는 것뿐이므로, 개인/팀/부서/부문을 DashboardUnit이라는 동일한
 * 모양으로 표현하고 buildStatRows() 하나로 통계를 뽑아낸다.
 *
 * dashboard/page.tsx는 이 모듈이 반환한 unit 목록을 그대로 렌더링 단위로 쓰면 되고,
 * scope(team/department/division/company)에 따른 분기 처리(조직 조회, 직속 인원
 * 처리 등)는 모두 이 파일 안에 모아둔다.
 */

// 대시보드 조회 범위 — 사용자가 OrgScopeSelect에서 고르는 값.
export type ScopeLevel = 'team' | 'department' | 'division' | 'company'

// 상세 통계 한 행이 실제로 어떤 조직 단위를 나타내는지.
// team 선택 -> member 단위, department 선택 -> team 단위, division 선택 -> department 단위,
// company 선택 -> division 단위로 "한 단계 아래" 조직을 보여준다(요구사항 6).
export type DashboardUnitLevel = 'member' | 'team' | 'department' | 'division'

export const DETAIL_UNIT_LEVEL: Record<ScopeLevel, DashboardUnitLevel> = {
  team: 'member',
  department: 'team',
  division: 'department',
  company: 'division',
}

// scope 값에 따라 "상세 통계" 카드 제목에 쓸 말 (예: "팀별 근무시간") — 요구사항 11.
export const DETAIL_UNIT_NOUN: Record<DashboardUnitLevel, string> = {
  member: '인원',
  team: '팀',
  department: '부서',
  division: '부문',
}

// "주차별 근무시간" 카드 제목에 쓸 말 (예: "개인별 주차별 근무시간") — 요구사항 11의 예시 문구를 그대로 따른다.
export const WEEKLY_UNIT_NOUN: Record<DashboardUnitLevel, string> = {
  member: '개인',
  team: '팀',
  department: '부서',
  division: '부문',
}

// 주차별 표의 첫 번째 열 헤더.
export const UNIT_NAME_HEADER: Record<DashboardUnitLevel, string> = {
  member: '이름',
  team: '팀명',
  department: '부서명',
  division: '부문명',
}

export interface DashboardMemberRow {
  userId: string
  name: string
}

/** 평일/휴일로 나눈 근무시간 */
export interface HourSplit {
  weekday: number
  holiday: number
  total: number
}

export interface SimpleDateRange {
  start: string
  end: string
}

/**
 * 상세 통계의 한 단위(개인/팀/부서/부문 무엇이든) — 이 단위에 속한 구성원 목록만 있으면
 * 근무시간 집계는 buildStatRows()가 동일하게 처리한다.
 */
export interface DashboardUnit {
  id: string
  name: string
  members: DashboardMemberRow[]
}

export interface DashboardUnitsResult {
  /** 이 unit 목록이 실제로 어떤 조직 단위인지 (UI 제목 결정에 사용) */
  unitLevel: DashboardUnitLevel
  /** 상세 통계에 표시할 단위 목록 (한 단계 아래 조직) */
  units: DashboardUnit[]
  /** 선택한 조직 전체에 속한 구성원(중복 없이) — 전체 통계 카드와 로그 조회 범위에 사용 */
  allMembers: DashboardMemberRow[]
}

// 요구사항 6의 공용 통계 구조. 개인/팀/부서/부문을 가능한 한 동일하게 다룬다.
export interface DashboardStatRow {
  id: string
  name: string
  memberCount: number
  weekdayHours: number
  holidayHours: number
  totalHours: number
  averageHours: number
  weekStats: HourSplit[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toRow(m: OrgMember): DashboardMemberRow {
  return { userId: m.user_id, name: m.name }
}

/** userId 기준 중복 제거. 먼저 나온 항목(이름)을 우선한다. */
function dedupeMembers(rows: DashboardMemberRow[]): DashboardMemberRow[] {
  const map = new Map<string, DashboardMemberRow>()
  rows.forEach((r) => {
    if (!map.has(r.userId)) map.set(r.userId, r)
  })
  return Array.from(map.values())
}

/** 로그 목록을 평일/휴일로 나눠 합산한다. (lib/workTime, lib/holidays의 기존 규칙 그대로 사용) */
export function splitHoursByHoliday(logs: any[], substituteHolidays: string[]): HourSplit {
  let weekday = 0
  let holiday = 0
  logs.forEach((log) => {
    const hours = calcWorkHours(log)
    if (isHolidayShared(new Date(log.date), substituteHolidays)) holiday += hours
    else weekday += hours
  })
  return { weekday: round2(weekday), holiday: round2(holiday), total: round2(weekday + holiday) }
}

/**
 * 부문 산하 부서 목록과, 부서 어디에도 속하지 않은 "부문 직속" 인원(있다면 부문장 본인)을
 * 함께 담아 반환한다. 현재 데이터 모델에는 부문 직속 인원을 담는 별도 테이블이 없고,
 * divisions.head_user_id만 있으므로 — 부문장이 산하 어느 부서에도 속해 있지 않을 때만
 * "부문 직속" 가상 그룹을 만든다(요구사항 8).
 */
async function getDivisionDepartmentUnits(divisionId: string): Promise<{
  units: DashboardUnit[]
  allMembers: DashboardMemberRow[]
}> {
  const [{ data: division }, { data: depts }] = await Promise.all([
    supabase.from('divisions').select('head_user_id').eq('id', divisionId).single(),
    supabase
      .from('departments')
      .select('id, name')
      .eq('division_id', divisionId)
      .order('display_order', { ascending: true }),
  ])

  const units: DashboardUnit[] = []
  const coveredUserIds = new Set<string>()
  for (const d of depts || []) {
    const scope = await fetchDepartmentScope((d as any).id)
    const members = dedupeMembers(scope.allMembers.map(toRow))
    members.forEach((m) => coveredUserIds.add(m.userId))
    units.push({ id: (d as any).id, name: (d as any).name, members })
  }

  const headUserId = division?.head_user_id || null
  if (headUserId && !coveredUserIds.has(headUserId)) {
    const { data: headProfile } = await supabase
      .from('profiles')
      .select('id, name, email, is_master')
      .eq('id', headUserId)
      .single()
    if (headProfile && !(headProfile as any).is_master) {
      units.unshift({
        id: `${divisionId}-direct`,
        name: '부문 직속',
        members: [{ userId: headProfile.id, name: displayName(headProfile) }],
      })
    }
  }

  return { units, allMembers: dedupeMembers(units.flatMap((u) => u.members)) }
}

/**
 * 선택한 scope(level, entityId)에 대해 "한 단계 아래 조직 단위" 목록과, 그 조직 전체
 * 구성원 목록을 함께 계산한다. 구성원 조회 자체는 lib/orgOrder의 기존 함수를 그대로 쓰고,
 * 여기서는 그 결과를 조직 단위(team/department/division)로 묶기만 한다.
 */
export async function getDashboardUnits(
  level: ScopeLevel,
  entityId: string
): Promise<DashboardUnitsResult> {
  const unitLevel = DETAIL_UNIT_LEVEL[level]

  if (level === 'team') {
    if (!entityId) return { unitLevel, units: [], allMembers: [] }
    const members = (await fetchTeamMembers(entityId)).map(toRow)
    // 팀 단위에서는 상세 표시 단위 = 개인이므로, 구성원 한 명이 곧 unit 하나다.
    const units: DashboardUnit[] = members.map((m) => ({ id: m.userId, name: m.name, members: [m] }))
    return { unitLevel, units, allMembers: members }
  }

  if (level === 'department') {
    if (!entityId) return { unitLevel, units: [], allMembers: [] }
    const scope = await fetchDepartmentScope(entityId)
    const units: DashboardUnit[] = scope.teamGroups.map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.map(toRow),
    }))
    // 팀에 속하지 않고 부서에 직접 소속된 인원(부서장 포함) — department_memberships가
    // 이미 이 관계를 표현하고 있으므로(lib/orgOrder.fetchDepartmentScope.directMembers) 그대로 재사용한다.
    if (scope.directMembers.length > 0) {
      units.unshift({
        id: `${entityId}-direct`,
        name: '부서 직속',
        members: scope.directMembers.map(toRow),
      })
    }
    return { unitLevel, units, allMembers: dedupeMembers(scope.allMembers.map(toRow)) }
  }

  if (level === 'division') {
    if (!entityId) return { unitLevel, units: [], allMembers: [] }
    const { units, allMembers } = await getDivisionDepartmentUnits(entityId)
    return { unitLevel, units, allMembers }
  }

  // company: 부문별로 묶는다. fetchDivisionMembers는 이미 부문장 고정 + 산하 부서 전체를
  // 합쳐서 반환하므로(직속 인원 포함) 별도의 "회사 직속" 가상 그룹은 필요하지 않다.
  const { data: divisions } = await supabase
    .from('divisions')
    .select('id, name')
    .order('display_order', { ascending: true })
  const units: DashboardUnit[] = []
  for (const d of divisions || []) {
    const members = dedupeMembers((await fetchDivisionMembers((d as any).id)).map(toRow))
    units.push({ id: (d as any).id, name: (d as any).name, members })
  }
  return { unitLevel, units, allMembers: dedupeMembers(units.flatMap((u) => u.members)) }
}

/**
 * unit 목록 + 로그 + 주차 목록으로 공용 통계 구조(DashboardStatRow)를 만든다.
 * "전체 통계" 카드도 결국 unit 하나짜리 목록으로 이 함수를 호출해서 얻는다(요구사항 7).
 */
export function buildStatRows(
  units: DashboardUnit[],
  logsByUser: Map<string, any[]>,
  weeks: SimpleDateRange[],
  substituteHolidays: string[]
): DashboardStatRow[] {
  return units.map((unit) => {
    const logs = unit.members.flatMap((m) => logsByUser.get(m.userId) || [])
    const split = splitHoursByHoliday(logs, substituteHolidays)
    const weekStats = weeks.map((w) =>
      splitHoursByHoliday(
        logs.filter((log) => log.date >= w.start && log.date <= w.end),
        substituteHolidays
      )
    )
    const memberCount = unit.members.length
    return {
      id: unit.id,
      name: unit.name,
      memberCount,
      weekdayHours: split.weekday,
      holidayHours: split.holiday,
      totalHours: split.total,
      averageHours: memberCount > 0 ? round2(split.total / memberCount) : 0,
      weekStats,
    }
  })
}

/** logs(work_logs row 배열)를 user_id 기준으로 묶는다. */
export function groupLogsByUser(logs: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>()
  logs.forEach((log) => {
    const arr = map.get(log.user_id)
    if (arr) arr.push(log)
    else map.set(log.user_id, [log])
  })
  return map
}
