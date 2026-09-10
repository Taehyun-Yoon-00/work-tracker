// 조직 관리 권한 체계
//
// 시스템 권한(MASTER)과 조직 관리 권한은 서로 다른 트랙이다:
//   [시스템 권한]   MASTER
//   [조직 관리 권한] 총괄 관리자 > 부문장 > 부서장 > 팀장 > 팀원
//
// MASTER는 시스템 관리자이므로 조직 관리 화면에서도 항상 모든 권한을 갖지만,
// 이는 "총괄 관리자"라서가 아니라 "시스템 관리자라 무엇이든 할 수 있다"는
// 별도 성격이다. 조직 관리 권한만 놓고 보면 그 트랙의 최상위는 총괄 관리자다.
//
// RLS 없이 UI 레벨에서만 사용 — 상위 권한은 하위 권한을 자동으로 포함한다.

export interface DivisionRow {
  id: string
  name: string
  head_user_id: string | null
  display_order: number
}

export interface DepartmentRow {
  id: string
  division_id: string
  name: string
  head_user_id: string | null
}

/** team_members 한 행 — 팀장 여부 판별에 필요한 최소 필드만 */
export interface TeamMemberLite {
  team_id: string
  user_id: string
  role: string
}

/**
 * 조직 관리 권한 트랙에서 "전체 조직"에 대한 최상위 권한을 가졌는지.
 * MASTER(시스템 관리자) 또는 총괄 관리자면 true.
 */
export function hasTopOrgAccess(isMaster: boolean, isGeneralAdmin: boolean): boolean {
  return isMaster || isGeneralAdmin
}

export function isDivisionHead(
  userId: string,
  division: DivisionRow,
  hasTopAccess: boolean
): boolean {
  return hasTopAccess || division.head_user_id === userId
}

export function isDepartmentHead(
  userId: string,
  department: DepartmentRow,
  divisions: DivisionRow[],
  hasTopAccess: boolean
): boolean {
  if (hasTopAccess || department.head_user_id === userId) return true
  const division = divisions.find((d) => d.id === department.division_id)
  return division ? isDivisionHead(userId, division, hasTopAccess) : false
}

/** 특정 부서 안에서 팀/구성원을 관리할 수 있는지 (부서장 이상) */
export function canManageDepartment(
  userId: string,
  departmentId: string,
  departments: DepartmentRow[],
  divisions: DivisionRow[],
  hasTopAccess: boolean
): boolean {
  const department = departments.find((d) => d.id === departmentId)
  return department ? isDepartmentHead(userId, department, divisions, hasTopAccess) : false
}

/** 특정 부문 안에서 부서를 관리할 수 있는지 (부문장 이상) */
export function canManageDivision(
  userId: string,
  divisionId: string,
  divisions: DivisionRow[],
  hasTopAccess: boolean
): boolean {
  const division = divisions.find((d) => d.id === divisionId)
  return division ? isDivisionHead(userId, division, hasTopAccess) : false
}

/**
 * 이 사람이 특정 팀의 팀장인지.
 * 조직 관리 권한 트랙의 최상위(hasTopAccess)면 자동으로 포함된다.
 */
export function isTeamLead(
  userId: string,
  teamId: string,
  teamMembers: TeamMemberLite[],
  hasTopAccess: boolean
): boolean {
  if (hasTopAccess) return true
  return teamMembers.some((m) => m.team_id === teamId && m.user_id === userId && m.role === 'admin')
}

/**
 * 특정 팀 안에서 팀장급 권한(자기 팀의 권한 관리·구성원 관리)을 행사할 수 있는지.
 * 부서장 이상(canManageDepartment)이거나, 그 팀의 팀장이면 true.
 * 팀장 변경/팀 삭제 등 팀 자체에 대한 구조 변경 권한은 여전히 부서장 이상만 가진다 —
 * 이 함수는 "자기 팀"의 결재권자 위임·구성원 관리에만 쓰인다.
 */
export function canManageTeam(
  userId: string,
  teamId: string,
  departmentId: string,
  teamMembers: TeamMemberLite[],
  departments: DepartmentRow[],
  divisions: DivisionRow[],
  hasTopAccess: boolean
): boolean {
  return (
    canManageDepartment(userId, departmentId, departments, divisions, hasTopAccess) ||
    isTeamLead(userId, teamId, teamMembers, hasTopAccess)
  )
}
