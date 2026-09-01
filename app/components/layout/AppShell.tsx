'use client'

import TopNav from '../TopNav'
import BottomNav from '../BottomNav'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <TopNav />
      <div className="flex-1 md:pl-64">{children}</div>
      <BottomNav />
    </>
  )
}
