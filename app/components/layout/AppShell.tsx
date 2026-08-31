'use client'

import TopNav from '../TopNav'
import BottomNav from '../BottomNav'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <TopNav />
      {/* 페이지가 grow로 남은 높이를 채울 수 있도록 세로 flex 컨테이너로 둔다. */}
      <div className="flex-1 md:pl-64 flex flex-col">{children}</div>
      <BottomNav />
    </>
  )
}
