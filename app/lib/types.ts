// Supabase 테이블의 row 타입.
// 스키마 근거: supabase/migrations/001_init.sql, 002~008, 009_fix_work_log_matters_rls,
// 010_org_structure ~ 015_org_display_order, 019_division_team_approvers
// (컬럼을 추가/변경하는 마이그레이션을 쓸 때 이 파일도 함께 갱신할 것)
//
// refactoring 브랜치(main 기준)의 lib/types.ts를 renewal의 조직 구조
// (부문/부서/총괄 관리자/결재권자 위임)에 맞춰 확장한 버전이다.

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
  /** 직급 (012_profile_position) */
  position: string | null
}

export interface Team {
  id: UUID
  name: string
  created_by: UUID | null
  created_at: Timestamp | null
  /** 이 팀이 속한 부서 (010_org_structure). 재배치 전에는 null일 수 있다 */
  department_id: UUID | null
  /** 부서 안에서의 표시 순서 (015_org_display_order) */
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
  team_id: UUID | null
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
  /** 어느 부서 맥락에서 올라온 요청인지 (011_department_approvers). 팀이 있으면 team_id로도 유도 가능 */
  department_id: UUID | null
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

/** 결재 요청 모달의 결재권자 선택 목록 (team_members + profiles 조인) */
export type ApproverOption = WithProfile<{ user_id: UUID }>

/** 결재 목록 조회 시 profiles/teams를 조인해서 함께 가져온 형태 */
export interface ApprovalRequestWithRelations extends ApprovalRequest {
  requester: Pick<Profile, 'name' | 'email'> | null
  approver: Pick<Profile, 'name' | 'email'> | null
  teams: Pick<Team, 'name'> | null
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

// ---------- 조직 구조 (010_org_structure ~ 015_org_display_order) ----------

/** 부문 */
export interface Division {
  id: UUID
  name: string
  /** 부문장 (자리). 지정돼 있지 않으면 null */
  head_user_id: UUID | null
  created_at: Timestamp
  updated_at: Timestamp
}

/** 부서 */
export interface Department {
  id: UUID
  division_id: UUID
  name: string
  /** 부서장 (자리) */
  head_user_id: UUID | null
  created_at: Timestamp
  updated_at: Timestamp
  /** 부문 안에서의 표시 순서 */
  display_order: number
}

/** 부서 직접 소속 (팀이 없는 사용자 전용) */
export interface DepartmentMembership {
  id: UUID
  department_id: UUID
  user_id: UUID
  created_at: Timestamp
  /** 부서 안에서의 표시 순서 */
  display_order: number
}

/** 부서장이 위임한 결재권자 (부서장 본인은 여기 없어도 항상 결재권자다) */
export interface DepartmentApprover {
  id: UUID
  department_id: UUID
  user_id: UUID
  can_vacation: boolean
  can_remote: boolean
  can_holiday: boolean
  created_at: Timestamp
}

/** 부문장이 위임한 결재권자 (019_division_team_approvers). 부문장 본인은 여기 없어도 항상 결재권자다 */
export interface DivisionApprover {
  id: UUID
  division_id: UUID
  user_id: UUID
  can_vacation: boolean
  can_remote: boolean
  can_holiday: boolean
  created_at: Timestamp
}

/** 팀장이 위임한 결재권자 (019_division_team_approvers). 팀장 본인은 여기 없어도 항상 결재권자다 */
export interface TeamApprover {
  id: UUID
  team_id: UUID
  user_id: UUID
  can_vacation: boolean
  can_remote: boolean
  can_holiday: boolean
  created_at: Timestamp
}

/** 총괄 관리자 (부문장 위 계급, MASTER와는 별도 트랙) */
export interface GeneralAdmin {
  user_id: UUID
  created_at: Timestamp
  created_by: UUID | null
}
