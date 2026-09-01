import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '리포트',
  description: '월별 안건별 근무 시간 통계',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
