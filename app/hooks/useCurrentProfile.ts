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
  /** true면 총괄 관리자/부문장/부서장이거나 마스터 계정 (조직 관리 화면 접근 가능) */
  isOrgManager: boolean
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
      const { data } = await supabase
        .from('profiles')
        .select('name, is_master')
        .eq('id', userId)
        .single()
      if (data) {
        setName(data.name || null)
        setIsMaster(!!data.is_master)
      }

      const { data: generalAdminRow } = await supabase
        .from('general_admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      setIsGeneralAdmin(!!generalAdminRow)

      const { data: adminTeams } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .limit(1)
      setIsTeamAdmin(!!adminTeams && adminTeams.length > 0)

      const [{ data: headDivisions }, { data: headDepartments }] = await Promise.all([
        supabase.from('divisions').select('id').eq('head_user_id', userId).limit(1),
        supabase.from('departments').select('id').eq('head_user_id', userId).limit(1),
      ])
      setIsOrgManager((headDivisions?.length ?? 0) > 0 || (headDepartments?.length ?? 0) > 0)
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
