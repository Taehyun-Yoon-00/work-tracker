'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import DepartmentAffiliationView from '../../../components/team/DepartmentAffiliationView'

export default function DepartmentDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const departmentId = String(id)
  // null = 확인 중, true = 열람 가능, false = 접근 불가
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase.from('profiles').select('is_master').eq('id', user.id).single()
      if (profileData?.is_master) { setAuthorized(true); return }

      const { data: generalAdminRow } = await supabase
        .from('general_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      if (generalAdminRow) { setAuthorized(true); return }

      const { data: dept } = await supabase
        .from('departments')
        .select('id, head_user_id, division_id, divisions(head_user_id)')
        .eq('id', departmentId)
        .single()
      if (!dept) { setAuthorized(false); return }

      if (dept.head_user_id === user.id) { setAuthorized(true); return }
      if ((dept as any).divisions?.head_user_id === user.id) { setAuthorized(true); return }

      const { data: directMembership } = await supabase
        .from('department_memberships')
        .select('id')
        .eq('department_id', departmentId)
        .eq('user_id', user.id)
        .maybeSingle()
      setAuthorized(!!directMembership)
    }
    checkAccess()
  }, [departmentId])

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-zinc-400">이 부서의 정보를 볼 수 있는 권한이 없어요.</p>
            <button onClick={() => router.push('/team')} className="text-sm text-blue-500 hover:underline mt-3">
              내 소속으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <DepartmentAffiliationView departmentId={departmentId} />
}
