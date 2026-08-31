'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import DepartmentAffiliationView from '../components/team/DepartmentAffiliationView'

type DivisionDept = { id: string; name: string; divisionName: string }

/**
 * "내 소속" 진입점.
 * - 소속된 팀이 있으면 그 팀 페이지로 이동
 * - 팀 없이 부서 직속이면 그 부서 화면을 바로 보여줌
 * - 부서장으로만 임명돼 있고 별도 소속이 없으면 해당 부서로 이동
 * - 부문장으로만 임명돼 있고 별도 소속이 없으면, 부문 산하 부서가 하나뿐이면 그 부서로 바로 이동하고
 *   여러 개면 선택할 수 있는 목록을 보여준다 (부문장은 부문 내 모든 부서의 캘린더를 열람할 수 있어야 함)
 * - 아무 소속도 없으면 안내 문구만 표시
 *
 * 여러 소속을 가진 사용자는 사이드바의 "내 소속" 하위 탭에서 다른 소속으로 바로 이동할 수 있다.
 */
export default function MyOrgEntryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'unassigned' | 'department' | 'divisionHeadOnly'>('unassigned')
  const [directDeptId, setDirectDeptId] = useState<string | null>(null)
  const [divisionDepts, setDivisionDepts] = useState<DivisionDept[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // 팀에 소속돼 있으면 바로 그 팀 페이지로 이동 (기존 UX 유지)
      const { data: myTeamData } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)

      if (myTeamData && myTeamData.length > 0) {
        router.replace(`/team/${myTeamData[0].team_id}`)
        return
      }

      // 부서 직접 소속인지 확인
      const { data: myDeptData } = await supabase
        .from('department_memberships')
        .select('department_id')
        .eq('user_id', user.id)
        .limit(1)

      if (myDeptData && myDeptData.length > 0) {
        setDirectDeptId(myDeptData[0].department_id)
        setStatus('department')
        setLoading(false)
        return
      }

      // 팀/부서 직속 소속은 없지만 부서장으로 임명된 경우 (보통은 임명 시 자동으로 부서 직속이 함께
      // 생기지만, 드문 예외 상황을 대비해 한 번 더 확인한다)
      const { data: headDept } = await supabase
        .from('departments')
        .select('id')
        .eq('head_user_id', user.id)
        .limit(1)
      if (headDept && headDept.length > 0) {
        router.replace(`/team/dept/${headDept[0].id}`)
        return
      }

      // 부문장인 경우: 부문 산하 부서들의 캘린더를 열람할 수 있어야 하므로
      // 부서가 하나뿐이면 바로 이동, 여러 개면 선택 목록을 보여준다.
      const { data: headDivisions } = await supabase
        .from('divisions')
        .select('id, name')
        .eq('head_user_id', user.id)
      if (headDivisions && headDivisions.length > 0) {
        const deptResults = await Promise.all(
          headDivisions.map((d) =>
            supabase.from('departments').select('id, name').eq('division_id', d.id).order('display_order', { ascending: true })
          )
        )
        const depts: DivisionDept[] = []
        deptResults.forEach((res, idx) => {
          ;(res.data || []).forEach((dept: any) => {
            depts.push({ id: dept.id, name: dept.name, divisionName: headDivisions[idx].name })
          })
        })

        if (depts.length === 1) {
          router.replace(`/team/dept/${depts[0].id}`)
          return
        }
        if (depts.length > 1) {
          setDivisionDepts(depts)
          setStatus('divisionHeadOnly')
          setLoading(false)
          return
        }
        // 부문에 부서가 하나도 없는 경우 아래 '소속 없음' 화면으로 자연스럽게 이어짐
      }

      setStatus('unassigned')
      setLoading(false)
    }
    init()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  if (status === 'department' && directDeptId) {
    return <DepartmentAffiliationView departmentId={directDeptId} />
  }

  if (status === 'divisionHeadOnly') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-1 dark:text-white">내 소속</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mb-6">
            총괄하시는 부문의 부서를 선택하면 해당 부서의 캘린더를 볼 수 있어요.
          </p>
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow divide-y dark:divide-zinc-700">
            {divisionDepts.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/team/dept/${d.id}`)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm dark:text-white truncate">{d.name}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 truncate">{d.divisionName}</p>
                </div>
                <span className="text-gray-300 dark:text-zinc-600 shrink-0 ml-2">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 dark:text-white">내 소속</h1>
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            소속된 조직이 없습니다.<br />관리자에게 조직 배정을 요청해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
