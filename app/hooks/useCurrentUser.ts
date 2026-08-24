'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * 로그인한 사용자를 가져오고, 없으면 /login으로 보낸다.
 *
 * 페이지마다 반복되던 인증 가드를 한 곳으로 모은 것이다.
 * 데이터 조회는 user가 채워진 뒤에 해야 하므로, 호출부에서
 * `useEffect(() => { if (user) fetch...() }, [user])` 형태로 이어서 쓴다.
 */
export function useCurrentUser() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (data.user) setUser(data.user)
      else router.push('/login')
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [router])

  return { user, loading }
}
