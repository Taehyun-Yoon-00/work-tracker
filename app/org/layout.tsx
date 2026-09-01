import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '조직 관리',
  description: '부문·부서·팀 구조와 인원 배치 관리',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
