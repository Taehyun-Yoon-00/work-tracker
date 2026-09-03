import { supabase } from './supabase'
import { displayName } from './labels'

/**
 * 조직관리(org/page.tsx)에서 정한 순서(display_order)를 조직관리 화면, 대시보드,
 * 내소속(팀/부서 상세) 화면이 모두 동일하게 따르도록 하는 공용 모듈.
 *
 * 규칙(요구사항 그대로):
 * - 팀장은 팀 안에서 항상 최상단
 * - 부서장은 부서 안에서 항상 최상단
 * - 부문장은 부문 안에서 항상 최상단
 * - 그 외 인원은 조직관리에서 지정한 display_order 순서를 그대로 유지
 *
 * 이 파일 하나의 정렬/조회 로직만 바꾸면 모든 화면에 동일하게 반영된다.
 */

export type OrgMember = {
  user_id: string
  name: string
  position: string | null
  /** 이 목록이 속한 조직 단위(팀/부서/부문)의 리더인지 — 팀장/부서장/부문장 */
  isHead: boolean
}

export type TeamMemberGroup = {
  id: string
  name: string
  members: OrgMember[]
}

export type DepartmentScope = {
  headUserId: string | null
  /** 부서장 포함, 부서 직속 인원 (부서장이 항상 최상단) */
  directMembers: OrgMember[]
  /** 팀별 그룹. 팀 순서는 teams.display_order, 각 팀 내부는 팀장이 항상 최상단 */
  teamGroups: TeamMemberGroup[]
  /** 표시 순서: 부서 직속(부서장 포함) → 각 팀 순서대로 이어붙인 전체 목록 */
  allMembers: OrgMember[]
}

const toMember = (userId: string, profile: any, isHead: boolean): OrgMember => ({
  user_id: userId,
  name: displayName(profile),
  position: profile?.position || null,
  isHead,
})

/**
 * 리더(팀장/부서장/부문장)를 항상 맨 위로 고정하고, 나머지는 원래 순서(=display_order로 이미
 * 정렬된 순서)를 그대로 유지한다. Array.prototype.sort는 안정 정렬이므로 리더가 아닌 인원끼리는
 * 서로 순서가 바뀌지 않는다.
 */
export function pinHeadFirst<T extends { isHead: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.isHead) - Number(a.isHead))
}

/** 팀 소속 인원 (팀장이 항상 최상단). team_members.display_order 기준으로 정렬한다. */
export async function fetchTeamMembers(teamId: string): Promise<OrgMember[]> {
  const { data } = await supabase
    .from('team_members')
    .select('user_id, role, profiles(id, email, name, position, is_master)')
    .eq('team_id', teamId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  const list = (data || [])
    .filter((m: any) => !m.profiles?.is_master)
    .map((m: any) => toMember(m.user_id, m.profiles, m.role === 'admin'))

  return pinHeadFirst(list)
}

/**
 * 부서 전체 소속 인원 — 부서장 고정 + 부서 직속 + 팀별(팀장 고정) 그룹을,
 * 조직관리와 동일한 순서(부서 직속 → 팀 순서대로)로 구성한다.
 */
export async function fetchDepartmentScope(departmentId: string): Promise<DepartmentScope> {
  const [{ data: dept }, { data: teams }, { data: directDept }] = await Promise.all([
    supabase.from('departments').select('id, head_user_id').eq('id', departmentId).single(),
    supabase
      .from('teams')
      .select('id, name')
      .eq('department_id', departmentId)
      .order('display_order', { ascending: true }),
    supabase
      .from('department_memberships')
      .select('user_id, profiles(id, email, name, position, is_master)')
      .eq('department_id', departmentId)
      .order('display_order', { ascending: true }),
  ])

  const headUserId = dept?.head_user_id || null

  // 부서 직속 (부서장은 department_memberships에 없을 수도 있으므로 별도로 항상 포함시킨다)
  const directList: OrgMember[] = (directDept || [])
    .filter((m: any) => !m.profiles?.is_master && m.user_id !== headUserId)
    .map((m: any) => toMember(m.user_id, m.profiles, false))

  if (headUserId) {
    const existingHead: any = (directDept || []).find((m: any) => m.user_id === headUserId)
    if (existingHead) {
      directList.unshift(toMember(existingHead.user_id, existingHead.profiles, true))
    } else {
      // department_memberships에는 없고 "자리"만 있는 부서장도 목록에 노출
      const { data: headProfile } = await supabase
        .from('profiles')
        .select('id, name, email, position, is_master')
        .eq('id', headUserId)
        .single()
      if (headProfile && !(headProfile as any).is_master) {
        directList.unshift(toMember(headProfile.id, headProfile, true))
      }
    }
  }

  const teamGroups: TeamMemberGroup[] = []
  for (const t of teams || []) {
    const members = await fetchTeamMembers((t as any).id)
    teamGroups.push({ id: (t as any).id, name: (t as any).name, members })
  }

  const map = new Map<string, OrgMember>()
  directList.forEach((m) => map.set(m.user_id, m))
  teamGroups.forEach((g) =>
    g.members.forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, m)
    })
  )

  return {
    headUserId,
    directMembers: directList,
    teamGroups,
    allMembers: Array.from(map.values()),
  }
}

/** 부문 전체 소속 인원 — 부문장 고정 + 산하 부서들을 부서 순서(display_order)대로 이어붙인다. */
export async function fetchDivisionMembers(divisionId: string): Promise<OrgMember[]> {
  const [{ data: division }, { data: depts }] = await Promise.all([
    supabase.from('divisions').select('head_user_id').eq('id', divisionId).single(),
    supabase
      .from('departments')
      .select('id')
      .eq('division_id', divisionId)
      .order('display_order', { ascending: true }),
  ])

  const map = new Map<string, OrgMember>()
  if (division?.head_user_id) {
    const { data: headProfile } = await supabase
      .from('profiles')
      .select('id, name, email, position, is_master')
      .eq('id', division.head_user_id)
      .single()
    if (headProfile && !(headProfile as any).is_master) {
      map.set(headProfile.id, toMember(headProfile.id, headProfile, true))
    }
  }
  for (const d of depts || []) {
    const scope = await fetchDepartmentScope((d as any).id)
    scope.allMembers.forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, m)
    })
  }
  return Array.from(map.values())
}

/** 전사 전체 소속 인원 — 부문을 조직관리에서 정한 순서(display_order)대로 이어붙인다. */
export async function fetchCompanyMembers(): Promise<OrgMember[]> {
  const { data: divisions } = await supabase
    .from('divisions')
    .select('id')
    .order('display_order', { ascending: true })
  const map = new Map<string, OrgMember>()
  for (const d of divisions || []) {
    const members = await fetchDivisionMembers((d as any).id)
    members.forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, m)
    })
  }
  return Array.from(map.values())
}
