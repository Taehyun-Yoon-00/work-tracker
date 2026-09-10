import type { ReactNode } from 'react'

interface SectionHeaderProps {
  children: ReactNode
  /** 대부분 sm(패널 안 소제목: 계정, 비밀번호 등). 페이지 상단 섹션 구분(월간/주간 통계 등)에는 base. */
  size?: 'sm' | 'base'
  className?: string
  /** 헤더 오른쪽에 붙는 액션(버튼/링크) 한 개. 있으면 자동으로 좌우 정렬한다. */
  action?: ReactNode
}

/** 페이지 곳곳에서 반복되는 무채색 섹션 제목 스타일 (아이콘 없이, neutral gray) */
export default function SectionHeader({
  children,
  size = 'sm',
  className = '',
  action,
}: SectionHeaderProps) {
  const textClass = size === 'base' ? 'text-base' : 'text-sm'
  const heading = (
    <h2 className={`${textClass} font-semibold text-gray-500 dark:text-zinc-400`}>{children}</h2>
  )

  if (!action) {
    return <div className={className}>{heading}</div>
  }

  return (
    <div className={`flex items-center justify-between ${className}`.trim()}>
      {heading}
      {action}
    </div>
  )
}
