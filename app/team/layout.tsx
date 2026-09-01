import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '내 소속',
  description: '소속된 팀 또는 부서로 이동',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
