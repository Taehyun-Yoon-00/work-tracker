import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '결재',
  description: '휴가·원격근무·휴일근무 결재',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
