import type { Metadata } from 'next'
import './globals.css'
import AppShell from './components/layout/AppShell'

export const metadata: Metadata = {
  title: '근무관리 시스템',
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
    <html lang="ko" className="h-full antialiased">
      <head>
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/*
          Tailwind v4의 @import 'tailwindcss'가 빌드 시 실제 규칙으로 풀리기 때문에,
          globals.css 안에서 폰트를 또 @import하면 "다른 규칙보다 뒤에 오는 @import"가 되어
          CSS 스펙 위반으로 빌드가 깨진다. 그래서 폰트는 별도 <link>로 불러온다.
        */}
        <link rel="stylesheet" href="/fonts/pretendard-jp/pretendardvariable-jp-dynamic-subset.css" />
      </head>
      <body className="min-h-full flex flex-col pt-11 pb-20 md:pb-0">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
