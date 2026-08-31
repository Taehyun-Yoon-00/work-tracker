import type { Metadata } from 'next'

// 페이지가 'use client'라 여기서 제목을 붙인다. 없으면 모든 탭이
// 루트 레이아웃의 '근무관리 시스템'으로만 보인다.
export const metadata: Metadata = {
  title: '팀',
  description: '팀 목록과 가입 신청',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
