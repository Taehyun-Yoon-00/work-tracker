import type { ReactNode } from 'react'

// Panel(Level 2) 기본값은 shadow 없는 flat이다. 정말 떠 있는 UI(모달/드롭다운/팝오버)에만
// elevated를 쓴다 — 일반 정보 패널에 그림자를 반복해서 쓰지 않는다는 디자인 시스템 규칙.
const SURFACE_CLASS = {
  flat: 'border border-gray-200 dark:border-zinc-700',
  elevated: 'border border-gray-200 dark:border-zinc-700 shadow-md',
} as const

interface CardProps {
  children: ReactNode
  /** 바깥 여백 등 호출부에서 덧붙일 클래스 */
  className?: string
  /** 안쪽 여백. Tailwind는 같은 속성이 겹치면 결과가 불확실해서 override 대신 값으로 받는다. */
  padding?: 'p-3' | 'p-4'
  /** 표면 단계. 일반 Panel은 flat(기본값), 드롭다운처럼 정말 떠 있는 경우에만 elevated를 쓴다. */
  surface?: keyof typeof SURFACE_CLASS
}

/** 페이지를 구성하는 Panel 한 장 (border + rounded-lg, 기본은 그림자 없음) */
export default function Card({
  children,
  className = '',
  padding = 'p-4',
  surface = 'flat',
}: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-zinc-800 rounded-lg ${SURFACE_CLASS[surface]} ${padding} ${className}`.trim()}
    >
      {children}
    </div>
  )
}
