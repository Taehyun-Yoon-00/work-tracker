import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '대시보드',
  description: '팀/부서 단위 근무 통계',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
