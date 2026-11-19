import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ProfileSummary {
  userId: string | undefined
  name: string | null
  email: string | null
  /** 시스템 관리자(계정/시스템 운영 권한). 조직 관리 권한 체계와는 별개 트랙이지만, 조직 관리 화면에서도 항상 모든 권한을 가진다. */
  isMaster: boolean
  /** 조직 관리 권한 트랙의 최상위(전체 조직 관리자). MASTER와 별개로 지정되는 역할. */
  isGeneralAdmin: boolean
  /** true면 최소 한 팀 이상에서 팀장(role='admin')이거나 마스터 계정 */
  isTeamLeaderOrAbove: boolean
  /** true면 총괄 관리자/부문장/부장이거나 마스터 계정 (조직 관리 화면 접근 가능) */
  isOrgManager: boolean
}

interface ProfileFlags {
  name: string | null
  isMaster: boolean
  hasProfile: boolean
  isGeneralAdmin: boolean
  isTeamAdmin: boolean
  isOrgManager: boolean
}

// 사이드바 · 메뉴 드로어 등 여러 컴포넌트가 이 훅을 동시에 쓰기 때문에, 같은 사용자에 대한
// 조회가 진행 중이면 새로 요청하지 않고 그 결과를 같이 받는다. (끝나면 바로 비우므로
// 캐시처럼 오래된 값이 남지 않는다.)
const inflightFlags = new Map<string, Promise<ProfileFlags>>()

function loadProfileFlags(userId: string): Promise<ProfileFlags> {
  const existing = inflightFlags.get(userId)
  if (existing) return existing

  const promise = (async (): Promise<ProfileFlags> => {
    // 서로 의존하지 않는 조회라 모두 동시에 실행한다.
    const [
      { data: profileRow },
      { data: generalAdminRow },
      { data: adminTeams },
      { data: headDivisions },
      { data: headDepartments },
    ] = await Promise.all([
      supabase.from('profiles').select('name, is_master').eq('id', userId).single(),
      supabase.from('general_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .limit(1),
      supabase.from('divisions').select('id').eq('head_user_id', userId).limit(1),
      supabase.from('departments').select('id').eq('head_user_id', userId).limit(1),
    ])
    return {
      name: profileRow?.name || null,
      isMaster: !!profileRow?.is_master,
      hasProfile: !!profileRow,
      isGeneralAdmin: !!generalAdminRow,
      isTeamAdmin: !!adminTeams && adminTeams.length > 0,
      isOrgManager: (headDivisions?.length ?? 0) > 0 || (headDepartments?.length ?? 0) > 0,
    }
  })().finally(() => {
    inflightFlags.delete(userId)
  })

  inflightFlags.set(userId, promise)
  return promise
}

export function useCurrentProfile(): ProfileSummary {
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [isMaster, setIsMaster] = useState(false)
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false)
  const [isTeamAdmin, setIsTeamAdmin] = useState(false)
  const [isOrgManager, setIsOrgManager] = useState(false)

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id)
      setEmail(session?.user?.email ?? null)
      if (!session?.user) {
        setName(null)
        setIsMaster(false)
        setIsGeneralAdmin(false)
        setIsTeamAdmin(false)
        setIsOrgManager(false)
      }
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    const fetchProfile = async () => {
      const flags = await loadProfileFlags(userId)
      if (flags.hasProfile) {
        setName(flags.name)
        setIsMaster(flags.isMaster)
      }
      setIsGeneralAdmin(flags.isGeneralAdmin)
      setIsTeamAdmin(flags.isTeamAdmin)
      setIsOrgManager(flags.isOrgManager)
    }
    fetchProfile()
  }, [userId])

  return {
    userId,
    name,
    email,
    isMaster,
    isGeneralAdmin,
    isTeamLeaderOrAbove: isMaster || isTeamAdmin,
    isOrgManager: isMaster || isGeneralAdmin || isOrgManager,
  }
}
