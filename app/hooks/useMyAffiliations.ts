import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Department, Team, TeamRole, UUID } from '../lib/types'

/** team_members + teams 조인 (조인 결과는 배열로 추론되므로 .returns()로 덮어쓴다) */
type MyTeamRow = { team_id: UUID; role: TeamRole | null; teams: Pick<Team, 'id' | 'name'> | null }
/** department_memberships + departments 조인 */
type MyDeptRow = { department_id: UUID; departments: Pick<Department, 'id' | 'name'> | null }

export interface AffiliationItem {
  key: string
  label: string
  path: string
  /** 정렬 우선순위 낮을수록 위(부문장 > 부서장 > 팀장 > 팀원/직속) */
  rank: number
}

/**
 * 로그인한 사용자가 열람할 수 있는 "내 소속" 목적지 목록.
 * - 소속된 팀들
 * - 부서 직속인 경우 그 부서
 * - 부서장으로 임명된 부서
 * - 부문장으로 임명된 경우, 조직 관리로 보내는 대신 그 부문 산하 "각 부서"를 하나씩 노출한다
 *   (부문장은 부문 내 모든 부서의 캘린더를 열람할 수 있어야 하므로).
 *
 * 사이드바는 이 목록이 2개 이상일 때만 "내 소속" 아래에 하위 탭을 펼쳐서 보여준다.
 */
export function useMyAffiliations() {
  const [items, setItems] = useState<AffiliationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setItems([])
        setLoading(false)
        return
      }

      const [teamRes, deptMembershipRes, headDeptRes, headDivRes] = await Promise.all([
        supabase
          .from('team_members')
          .select('team_id, role, teams(id, name)')
          .eq('user_id', user.id)
          .returns<MyTeamRow[]>(),
        supabase
          .from('department_memberships')
          .select('department_id, departments(id, name)')
          .eq('user_id', user.id)
          .returns<MyDeptRow[]>(),
        supabase.from('departments').select('id, name').eq('head_user_id', user.id),
        supabase.from('divisions').select('id, name').eq('head_user_id', user.id),
      ])

      const list: AffiliationItem[] = []
      const seenPaths = new Set<string>()
      const add = (item: AffiliationItem) => {
        if (seenPaths.has(item.path)) return
        seenPaths.add(item.path)
        list.push(item)
      }

      ;(headDeptRes.data ?? []).forEach((d) => {
        add({
          key: `dept-head-${d.id}`,
          label: `${d.name} (부서장)`,
          path: `/team/dept/${d.id}`,
          rank: 1,
        })
      })

      // 부문장: 전용 조직관리 화면으로 보내지 않고, 부문 산하 각 부서를 개별 항목으로 노출해서
      // 사이드바 "내 소속" 하위 탭에서 바로 부서(및 그 캘린더)를 선택할 수 있게 한다.
      const headDivisions = headDivRes.data ?? []
      if (headDivisions.length > 0) {
        const divisionDeptResults = await Promise.all(
          headDivisions.map((d) =>
            supabase
              .from('departments')
              .select('id, name')
              .eq('division_id', d.id)
              .order('display_order', { ascending: true })
          )
        )
        divisionDeptResults.forEach((res) => {
          ;(res.data ?? []).forEach((dept) => {
            add({
              key: `div-dept-${dept.id}`,
              label: `${dept.name}`,
              path: `/team/dept/${dept.id}`,
              rank: 0,
            })
          })
        })
      }

      ;(deptMembershipRes.data ?? []).forEach((m) => {
        const dept = m.departments
        if (!dept) return
        add({ key: `dept-${dept.id}`, label: dept.name, path: `/team/dept/${dept.id}`, rank: 3 })
      })

      ;(teamRes.data ?? []).forEach((m) => {
        const team = m.teams
        if (!team) return
        const isLead = m.role === 'admin'
        add({
          key: `team-${team.id}`,
          label: isLead ? `${team.name} (팀장)` : team.name,
          path: `/team/${team.id}`,
          rank: isLead ? 2 : 4,
        })
      })

      list.sort((a, b) => a.rank - b.rank)

      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { items, loading }
}
