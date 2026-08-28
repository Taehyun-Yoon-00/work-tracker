import type { ReactNode } from 'react'

const SURFACE_CLASS = {
  raised: 'shadow',
  flat: 'border border-gray-200 dark:border-zinc-700',
} as const

interface CardProps {
  children: ReactNode
  /** 바깥 여백 등 호출부에서 덧붙일 클래스 */
  className?: string
  /** 안쪽 여백. Tailwind는 같은 속성이 겹치면 결과가 불확실해서 override 대신 값으로 받는다. */
  padding?: 'p-3' | 'p-4'
  /** 표면 단계. 주 내용은 raised, 필터·설정 같은 보조 영역은 flat을 쓴다. */
  surface?: keyof typeof SURFACE_CLASS
}

/** 페이지를 구성하는 흰 카드 한 장 */
export default function Card({
  children,
  className = '',
  padding = 'p-4',
  surface = 'raised',
}: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-zinc-800 rounded-xl ${SURFACE_CLASS[surface]} ${padding} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
