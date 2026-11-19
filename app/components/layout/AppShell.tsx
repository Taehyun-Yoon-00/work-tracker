'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import TopNav from '../TopNav'
import BottomNav from '../BottomNav'
import Sidebar from './Sidebar'

// 회원가입 후 첫 로그인 — 이름이 비어 있으면 마이페이지로 보내 이름부터 저장하게 한다.
// (이름 외 항목은 비워 둬도 된다. 이름 저장이 끝나야 미지정 인원 알림이 권한자들에게 간다.)
// 이 경로들에서는 보내지 않는다: 로그인 화면, 이름을 입력하는 마이페이지 자신.
const SKIP_PATH_PREFIXES = ['/login', '/mypage']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const pathnameRef = useRef(pathname)
<<<<<<< HEAD
  pathnameRef.current = pathname
=======
  // 렌더 중에 ref를 바꾸지 않고 effect에서 동기화한다. (아래 checkName effect보다 먼저 선언해야
  // 같은 커밋에서 checkName이 최신 경로를 읽는다.)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])
>>>>>>> feature/UI_Refactoring
  // 이름이 있는 걸 확인한 사용자는 다시 조회하지 않는다.
  const verifiedUserId = useRef<string | null>(null)

  const checkName = useCallback(async () => {
    const current = pathnameRef.current
    if (!current || SKIP_PATH_PREFIXES.some((p) => current.startsWith(p))) return

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId || verifiedUserId.current === userId) return

    const { data } = await supabase
      .from('profiles')
      .select('name, is_master')
      .eq('id', userId)
      .single()
    if (!data) return

    // 마스터(시스템 관리자) 계정은 조직 구성원이 아니라서 이름을 강제하지 않는다.
    if (data.is_master || data.name?.trim()) {
      verifiedUserId.current = userId
      return
    }
    router.replace('/mypage')
  }, [router])

  // 페이지를 이동할 때마다 확인한다 (로그인 직후 '/'로 이동하는 때도 여기서 잡힌다).
  useEffect(() => {
    checkName()
  }, [pathname, checkName])

  // 이메일 인증 링크로 들어오면 경로 이동 없이 세션만 뒤늦게 생기므로, 로그인 이벤트에서도 확인한다.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      // 콜백 안에서 바로 Supabase를 호출하면 교착될 수 있어 한 틱 미룬다.
      if (event === 'SIGNED_IN') setTimeout(checkName, 0)
    })
    return () => listener.subscription.unsubscribe()
  }, [checkName])

  return (
    <>
      <Sidebar />
      <TopNav />
      <div className="flex-1 md:pl-64">{children}</div>
      <BottomNav />
    </>
  )
}
