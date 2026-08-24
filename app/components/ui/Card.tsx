import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  /** 바깥 여백 등 호출부에서 덧붙일 클래스 */
  className?: string
  /** 안쪽 여백. Tailwind는 같은 속성이 겹치면 결과가 불확실해서 override 대신 값으로 받는다. */
  padding?: 'p-3' | 'p-4'
}

/** 페이지를 구성하는 흰 카드 한 장 */
export default function Card({ children, className = '', padding = 'p-4' }: CardProps) {
  return (
    <div className={`bg-white dark:bg-zinc-800 rounded-xl shadow ${padding} ${className}`.trim()}>
      {children}
    </div>
  )
}
