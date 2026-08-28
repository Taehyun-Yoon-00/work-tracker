import type { ReactNode } from 'react'

type Tone = 'blue' | 'green' | 'orange' | 'red'

// Tailwind는 클래스명을 정적으로 스캔하므로 `bg-${tone}-50` 같은 조합은 쓸 수 없다.
const TONE_CLASS: Record<Tone, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-500 dark:text-blue-300' },
  green: { bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-500 dark:text-green-300' },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-500 dark:text-orange-300',
  },
  red: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-500 dark:text-red-300' },
}

const VALUE_SIZE_CLASS = {
  lg: 'text-lg',
  xl: 'text-xl',
} as const

interface StatCardProps {
  label: string
  value: ReactNode
  tone: Tone
  /** 값 글자 크기. 근무시간 통계는 lg, 휴가 현황은 xl을 쓴다. */
  valueSize?: keyof typeof VALUE_SIZE_CLASS
}

/** 나란히 놓이는 숫자 요약 타일 (주간 근무시간, 휴가 현황 등) */
export default function StatCard({ label, value, tone, valueSize = 'lg' }: StatCardProps) {
  const { bg, text } = TONE_CLASS[tone]
  return (
    <div className={`flex-1 ${bg} rounded-lg p-3 text-center`}>
      <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">{label}</p>
      <p className={`${VALUE_SIZE_CLASS[valueSize]} font-bold ${text}`}>{value}</p>
    </div>
  )
}
