// Supabase 테이블의 row 타입.
// 스키마 근거: supabase/migrations/001_init.sql 및 002~018
// (컬럼을 추가/변경하는 마이그레이션을 쓸 때 이 파일도 함께 갱신할 것)

export type UUID = string
/** 'YYYY-MM-DD' */
export type DateStr = string
/** ISO 8601 timestamp */
export type Timestamp = string

// ---------- 도메인 열거값 ----------

export type ApprovalType = 'vacation' | 'remote' | 'holiday'
export type VacationType = 'annual' | 'morning' | 'afternoon' | 'special'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type TeamRole = 'admin' | 'member'
export type TeamRequestStatus = 'pending' | 'approved' | 'rejected'

export const FIXED_CATEGORIES = ['수주', '자사업무', '타부서업무', '영업지원'] as const
export type FixedCategory = (typeof FIXED_CATEGORIES)[number]
export type WorkCategory = FixedCategory | '청구안건'
export const ALL_CATEGORIES: WorkCategory[] = [...FIXED_CATEGORIES, '청구안건']

// ---------- 테이블 ----------
//
// FK 컬럼(user_id, team_id, requester_id 등)은 DDL에 NOT NULL이 없지만
// 앱이 항상 값을 채워 넣고, 참조가 끊기면 ON DELETE CASCADE로 행 자체가 지워진다.
// null인 행이 실제로 존재하지 않으므로 non-null로 둔다.

export interface Profile {
  id: UUID
  email: string | null
  name: string | null
  created_at: Timestamp | null
  total_vacation: number | null
  avatar_url: string | null
  is_master: boolean | null
  /** 직급 (012) */
  position: string | null
}

/** 조직 최상위 단위 (010). 부문장은 head_user_id로 표현한다. */
export interface Division {
  id: UUID
  name: string
  head_user_id: UUID | null
  created_at: Timestamp
  updated_at: Timestamp
}

/** 부문 아래 단위 (010). 부서장은 head_user_id로 표현한다. */
export interface Department {
  id: UUID
  division_id: UUID
  name: string
  head_user_id: UUID | null
  created_at: Timestamp
  updated_at: Timestamp
  /** 부문 안에서의 표시 순서 (015) */
  display_order: number
}

/** 팀 없이 부서에 직접 소속된 인원 (010). 팀이 있으면 teams.department_id로 유도된다. */
export interface DepartmentMembership {
  id: UUID
  department_id: UUID
  user_id: UUID
  created_at: Timestamp
  /** 부서 안에서의 표시 순서 (015) */
  display_order: number
}

/** 부서장이 위임한 추가 결재권자 (011). 부서장 본인은 이 테이블에 없어도 항상 결재권자다. */
export interface DepartmentApprover {
  id: UUID
  department_id: UUID
  user_id: UUID
  can_vacation: boolean
  can_remote: boolean
  can_holiday: boolean
  created_at: Timestamp
}

/** 전체 조직을 관리할 수 있는 총괄 관리자 (014). is_master(시스템 권한)와는 별개 트랙이다. */
export interface GeneralAdmin {
  user_id: UUID
  created_at: Timestamp
  created_by: UUID | null
}

export interface Team {
  id: UUID
  name: string
  created_by: UUID | null
  created_at: Timestamp | null
  /** 배치 전에는 null (010, 013) */
  department_id: UUID | null
  /** 부서 안에서의 표시 순서 (015) */
  display_order: number
}

export interface TeamMember {
  id: UUID
  team_id: UUID
  user_id: UUID
  role: TeamRole | null
  created_at: Timestamp | null
  display_order: number | null
}

export interface TeamRequest {
  id: UUID
  team_id: UUID
  user_id: UUID
  status: TeamRequestStatus | null
  created_at: Timestamp | null
}

export interface WorkLog {
  id: UUID
  user_id: UUID
  date: DateStr
  /** 'HH:mm:ss' */
  start_time: string
  end_time: string
  break_minutes: number
  memo: string | null
  created_at: Timestamp | null
  is_next_day: boolean | null
}

export interface WorkLogMatter {
  id: UUID
  work_log_id: UUID
  category: WorkCategory
  hours: number
  /** matter_* 필드는 category가 '청구안건'일 때만 채워진다 (DB CHECK 제약) */
  matter_place: string | null
  matter_division: string | null
  matter_content: string | null
  matter_cost_code: string | null
  sort_order: number
  created_at: Timestamp
}

export interface Vacation {
  id: UUID
  user_id: UUID
  date: DateStr
  type: VacationType
  created_at: Timestamp | null
}

export interface RemoteWork {
  id: UUID
  user_id: UUID
  date: DateStr
  created_at: Timestamp | null
}

export interface CommutePlan {
  id: UUID
  user_id: UUID
  week_start: DateStr | null
  commute_time: string
  created_at: Timestamp | null
  week_number: number | null
}

/** 결재 요청의 날짜 1건. vacationType은 type이 'vacation'일 때만 의미가 있다. */
export interface DateEntry {
  date: DateStr
  vacationType?: VacationType
}

export interface ApprovalRequest {
  id: UUID
  requester_id: UUID
  approver_id: UUID
  /** 팀 소속으로 올린 요청에만 채워진다. 부서 직속이면 null (011) */
  team_id: UUID | null
  /** 요청이 올라온 부서 맥락 (011). 팀 소속이면 팀의 부서가 들어간다. */
  department_id: UUID | null
  type: ApprovalType
  /** 대표 날짜 (dates의 첫 번째 값) */
  date: DateStr
  vacation_type: VacationType | null
  status: ApprovalStatus
  memo: string | null
  created_at: Timestamp | null
  dates: DateStr[] | null
  date_entries: DateEntry[] | null
  approved_at: Timestamp | null
  rejected_at: Timestamp | null
  cc_emails: string[] | null
  /** 승인된 건에 대해 요청자가 취소를 요청한 상태 (008) */
  cancel_requested: boolean
  cancel_requested_at: Timestamp | null
  cancelled_at: Timestamp | null
}

/**
 * profiles를 조인해 함께 가져온 행. 화면에서 쓰는 값은 이름/이메일뿐이다.
 * (supabase-js는 조인 결과를 배열로 추론하므로 조회 시 `.returns<T[]>()`로 덮어써야 한다)
 */
export type WithProfile<T> = T & { profiles: Pick<Profile, 'name' | 'email'> | null }

/** 내가 속한 팀 목록 (team_members + teams 조인). role은 조회하는 화면에서만 채워진다. */
export interface MyTeamOption {
  team_id: UUID
  role?: TeamRole | null
  teams: Pick<Team, 'id' | 'name'> | null
}

/** 조직 화면에서 인원 목록을 만들 때 필요한 profiles 컬럼 */
export type OrgProfile = Pick<Profile, 'id' | 'email' | 'name' | 'position' | 'is_master'>

/**
 * team_members / department_memberships / department_approvers에 profiles를
 * 조인한 행. 세 테이블 모두 조직도에서 "사람 한 명"으로 같게 다룬다.
 * (supabase-js는 조인 결과를 배열로 추론하므로 조회 시 `.returns<T[]>()`로 덮어쓴다)
 */
export interface OrgMemberRow {
  user_id: UUID
  team_id?: UUID
  profiles: OrgProfile | null
}

/**
 * 결재를 올릴 수 있는 내 소속 하나. 팀에 속해 있으면 팀, 팀 없이 부서에
 * 직접 소속돼 있으면 그 부서다. 결재권자는 어느 쪽이든 부서를 기준으로 찾는다.
 */
export interface MyApprovalSource {
  /** `team:<teamId>` 또는 `dept:<departmentId>` */
  key: string
  label: string
  teamId: UUID | null
  departmentId: UUID
}

/** 결재 요청 모달의 결재권자 선택 목록 (team_members + profiles 조인) */
export type ApproverOption = WithProfile<{ user_id: UUID }>

/** 결재 목록 조회 시 profiles/teams/departments를 조인해서 함께 가져온 형태 */
export interface ApprovalRequestWithRelations extends ApprovalRequest {
  requester: Pick<Profile, 'name' | 'email'> | null
  approver: Pick<Profile, 'name' | 'email'> | null
  teams: Pick<Team, 'name'> | null
  departments: Pick<Department, 'name'> | null
}

export interface SubstituteHoliday {
  id: UUID
  date: DateStr
  name: string
  created_at: Timestamp | null
}

export type NotificationType = 'REQUEST' | 'APPROVED' | 'REJECTED' | 'CANCEL_REQUEST' | 'CANCELLED'

export interface Notification {
  id: UUID
  receiver_id: UUID
  approval_id: UUID | null
  type: NotificationType
  title: string
  message: string | null
  is_read: boolean
  created_at: Timestamp
}
