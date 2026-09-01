import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '부서 상세',
  description: '부서 직속 인원 근무 현황',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
