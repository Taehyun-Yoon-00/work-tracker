import type { ReactNode } from 'react'

// 색상은 "상태/경고"에만 의미를 갖는다는 디자인 규칙에 맞춰 의미를 5가지로 제한한다.
// 새로운 색 조합(bg-purple-50 등)을 페이지마다 만들지 말고 이 중에서 고른다.
export type BadgeTone = 'neutral' | 'info' | 'pending' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400',
  info: 'bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-300',
  pending: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/40 dark:text-yellow-300',
  success: 'bg-green-50 text-green-500 dark:bg-green-950/40 dark:text-green-300',
  warning: 'bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-300',
  danger: 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-300',
}

interface BadgeProps {
  children: ReactNode
  /** 5가지 공통 의미 중 하나. neutral이 기본값. */
  tone?: BadgeTone
  /**
   * 신청 타입처럼 6가지 tone으로 담을 수 없는, 실제로 구분이 필요한 값에 한해 쓰는 예외 통로
   * (예: 원격근무 = indigo). tone과 동시에 넘기지 않는다.
   */
  colorClassName?: string
  className?: string
}

/** 상태/타입 등을 나타내는 작은 pill. 페이지마다 색상 클래스를 새로 조합하지 않고 이걸 쓴다. */
export default function Badge({ children, tone, colorClassName, className = '' }: BadgeProps) {
  const colorClasses = colorClassName ?? TONE_CLASS[tone ?? 'neutral']
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${colorClasses} ${className}`.trim()}
    >
      {children}
    </span>
  )
}
