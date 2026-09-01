import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '팀 상세',
  description: '팀/부서 근무 현황',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
