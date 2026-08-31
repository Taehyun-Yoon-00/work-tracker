import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import AppShell from './components/layout/AppShell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: { default: '근무관리 시스템', template: '%s · 근무관리 시스템' },
  description: '근무 기록 관리 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '근무관리',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      {/* pt/pb는 고정된 TopNav·BottomNav 높이를 비워두는 자리다. BottomNav는
          모바일에만 있으므로 pb도 md부터는 없앤다. 페이지는 min-h-screen 대신
          grow로 남은 높이를 채운다 — 100vh를 쓰면 이 padding만큼 항상 넘쳐서
          내용이 짧아도 스크롤이 생긴다. */}
      <body className="min-h-dvh flex flex-col pt-11 pb-20 md:pb-0">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
