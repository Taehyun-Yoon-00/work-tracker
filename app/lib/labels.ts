import type { ApprovalStatus, ApprovalType, Profile, VacationType } from './types'

// 화면과 메일/푸시에서 함께 쓰는 표시 문구.
// 같은 값을 여러 곳에 하드코딩하면 문구가 갈리므로 여기만 고친다.

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  vacation: '휴가',
  remote: '원격근무',
  holiday: '휴일근무',
}

export const VACATION_TYPE_LABEL: Record<VacationType, string> = {
  annual: '연차',
  morning: '오전반차',
  afternoon: '오후반차',
  special: '특휴/대휴',
}

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: '승인 대기중',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소됨',
}

const APPROVAL_TYPE_STYLE: Record<ApprovalType, string> = {
  vacation: 'bg-orange-50 text-orange-500',
  remote: 'bg-purple-50 text-purple-500',
  holiday: 'bg-red-50 text-red-500',
}

const APPROVAL_STATUS_STYLE: Record<ApprovalStatus, string> = {
  pending: 'text-yellow-500 bg-yellow-50',
  approved: 'text-green-500 bg-green-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-gray-400 bg-gray-100',
}

/** 결재 종류 배지 (문구 + Tailwind 클래스). 모르는 값이면 원문을 회색으로 보여준다. */
export function approvalTypeBadge(type: string): { text: string; style: string } {
  const known = type as ApprovalType
  return APPROVAL_TYPE_LABEL[known]
    ? { text: APPROVAL_TYPE_LABEL[known], style: APPROVAL_TYPE_STYLE[known] }
    : { text: type, style: 'bg-gray-100 text-gray-500' }
}

/** 결재 상태 배지 (문구 + Tailwind 클래스) */
export function approvalStatusBadge(status: string): { text: string; color: string } {
  const known = status as ApprovalStatus
  return APPROVAL_STATUS_LABEL[known]
    ? { text: APPROVAL_STATUS_LABEL[known], color: APPROVAL_STATUS_STYLE[known] }
    : { text: status, color: '' }
}

/** 휴가 종류 문구. 모르는 값이면 원문 그대로. */
export function vacationTypeLabel(type: string): string {
  return VACATION_TYPE_LABEL[type as VacationType] ?? type
}

/** 결재 종류 문구. 모르는 값이면 원문 그대로. */
export function approvalTypeLabel(type: string): string {
  return APPROVAL_TYPE_LABEL[type as ApprovalType] ?? type
}

/**
 * 사용자 표시 이름: 이름 → 이메일 아이디 → fallback 순.
 * 화면 맥락에 따라 fallback이 달라서 인자로 받는다 ('알 수 없음' / '팀원' 등).
 */
export function displayName(
  profile: Partial<Pick<Profile, 'name' | 'email'>> | null | undefined,
  fallback = '알 수 없음'
): string {
  return profile?.name || profile?.email?.split('@')[0] || fallback
}
