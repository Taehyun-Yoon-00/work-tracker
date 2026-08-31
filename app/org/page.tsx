'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { X, Search } from 'lucide-react'
import {
  DivisionRow,
  DepartmentRow,
  isDivisionHead,
  canManageDepartment,
  canManageDivision,
  hasTopOrgAccess,
} from '../lib/orgPermissions'

interface TeamRow {
  id: string
  department_id: string
  name: string
  display_order: number
}
interface MemberRow {
  user_id: string
  name: string
}
interface TeamMemberRow extends MemberRow {
  team_id: string
  role: string
}
// 조직 관리 화면 안에서만 쓰는 순서변경 모드 상태.
// 'departments': 부문의 부서 목록 순서, 'teams': 부서의 팀 목록 순서, 'deptMembers': 부서의 구성원 순서(부서 직속 + 팀별)
type ReorderState =
  | { kind: 'departments'; divisionId: string }
  | { kind: 'teams'; departmentId: string }
  | { kind: 'deptMembers'; departmentId: string }
  | null
interface ProfileOption {
  id: string
  name: string
}
interface ApproverDelegateRow {
  id: string
  department_id: string
  user_id: string
  name: string
  can_vacation: boolean
  can_remote: boolean
  can_holiday: boolean
}

type ModalState =
  | { kind: 'createDivision' }
  | { kind: 'createDepartment'; divisionId: string }
  | { kind: 'createTeam'; departmentId: string }
  | { kind: 'assignDivisionHead'; divisionId: string }
  | { kind: 'assignDepartmentHead'; departmentId: string }
  | { kind: 'assignTeamHead'; teamId: string; departmentId: string }
  | { kind: 'addApprover'; departmentId: string }
  | null

type Selection =
  | { type: 'division'; id: string }
  | { type: 'department'; id: string }
  | { type: 'team'; id: string }
  | { type: 'unassigned' }
  | null

type TabKey = 'structure' | 'members' | 'permissions'

export default function OrgPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isMaster, setIsMaster] = useState(false)
  const [isGeneralAdmin, setIsGeneralAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')

  const [divisions, setDivisions] = useState<DivisionRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [directMembers, setDirectMembers] = useState<(MemberRow & { department_id: string })[]>([])
  // 순서변경 모드 (req 6): null이면 평소대로, 값이 있으면 해당 목록만 드래그 가능하고 나머지는 비활성화
  const [reorder, setReorder] = useState<ReorderState>(null)
  const [approverDelegates, setApproverDelegates] = useState<ApproverDelegateRow[]>([])
  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([])

  // 사이드바 트리에서 펼쳐진 부문 목록 (기본은 모두 접힌 상태)
  const [expandedDiv, setExpandedDiv] = useState<Set<string>>(new Set())
  // 사이드바 트리에서 펼쳐진 부서 목록 (하위 팀을 보여줄지 여부, 기본은 모두 접힌 상태)
  const [expandedDept, setExpandedDept] = useState<Set<string>>(new Set())

  // 부서 상세의 "구조" 탭에서 펼쳐진 항목 ('direct' 또는 `team-${teamId}`)
  const [openStructureItem, setOpenStructureItem] = useState<string | null>(null)

  // 현재 메인 패널에 표시 중인 대상 (부문 또는 부서)
  const [selected, setSelected] = useState<Selection>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('structure')
  const [search, setSearch] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const [modal, setModal] = useState<ModalState>(null)
  const [modalInput, setModalInput] = useState('')
  const [modalUserId, setModalUserId] = useState('')
  const [modalChecks, setModalChecks] = useState({ can_vacation: true, can_remote: true, can_holiday: true })

  // 구성원 이동 인라인 폼
  const [movingKey, setMovingKey] = useState<string | null>(null)
  const [moveTargetDept, setMoveTargetDept] = useState<string>('')
  const [moveTargetTeam, setMoveTargetTeam] = useState<string>('')

  // 미지정 인원 배정 인라인 폼
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignTargetDept, setAssignTargetDept] = useState<string>('')
  const [assignTargetTeam, setAssignTargetTeam] = useState<string>('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      const { data: profileData } = await supabase
        .from('profiles').select('is_master').eq('id', user.id).single()
      const master = !!profileData?.is_master
      setIsMaster(master)

      const { data: generalAdminRow } = await supabase
        .from('general_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      const generalAdmin = !!generalAdminRow
      setIsGeneralAdmin(generalAdmin)

      const { data: headDivisions } = await supabase
        .from('divisions').select('id').eq('head_user_id', user.id)
      const { data: headDepartments } = await supabase
        .from('departments').select('id').eq('head_user_id', user.id)

      if (!master && !generalAdmin && (headDivisions?.length ?? 0) === 0 && (headDepartments?.length ?? 0) === 0) {
        router.replace('/')
        return
      }

      await fetchAll()
      setChecking(false)
    }
    init()
  }, [])

  const fetchAll = async () => {
    const [divRes, depRes, teamRes, tmRes, dmRes, apRes, profRes] = await Promise.all([
      supabase.from('divisions').select('id, name, head_user_id').order('name'),
      supabase.from('departments').select('id, division_id, name, head_user_id').order('division_id').order('display_order'),
      supabase.from('teams').select('id, department_id, name, display_order').order('department_id').order('display_order'),
      supabase.from('team_members').select('team_id, user_id, role, profiles(name, email, is_master)').order('team_id').order('display_order'),
      supabase.from('department_memberships').select('department_id, user_id, profiles(name, email, is_master)').order('department_id').order('display_order'),
      supabase.from('department_approvers').select('id, department_id, user_id, can_vacation, can_remote, can_holiday, profiles(name, email, is_master)'),
      // 마스터(시스템 관리자) 계정은 조직 관리 화면에 노출하지 않는다 — 별도 권한 트랙이라 조직 구성원 풀에서 제외
      supabase.from('profiles').select('id, name, email').or('is_master.eq.false,is_master.is.null').order('name'),
    ])

    const divs: DivisionRow[] = divRes.data || []
    setDivisions(divs)
    setDepartments(depRes.data || [])
    setTeams((teamRes.data || []).filter((t: any) => t.department_id))
    setTeamMembers(
      (tmRes.data || [])
        .filter((m: any) => !m.profiles?.is_master)
        .map((m: any) => ({
          team_id: m.team_id,
          user_id: m.user_id,
          role: m.role,
          name: m.profiles?.name || m.profiles?.email?.split('@')[0] || '이름없음',
        }))
    )
    setDirectMembers(
      (dmRes.data || [])
        .filter((m: any) => !m.profiles?.is_master)
        .map((m: any) => ({
          department_id: m.department_id,
          user_id: m.user_id,
          name: m.profiles?.name || m.profiles?.email?.split('@')[0] || '이름없음',
        }))
    )
    setApproverDelegates(
      (apRes.data || [])
        .filter((a: any) => !a.profiles?.is_master)
        .map((a: any) => ({
          id: a.id,
          department_id: a.department_id,
          user_id: a.user_id,
          name: a.profiles?.name || a.profiles?.email?.split('@')[0] || '이름없음',
          can_vacation: a.can_vacation,
          can_remote: a.can_remote,
          can_holiday: a.can_holiday,
        }))
    )
    setAllProfiles(
      (profRes.data || []).map((p: any) => ({ id: p.id, name: p.name || p.email?.split('@')[0] || '이름없음' }))
    )

    // 최초 로딩 시 첫 부문을 기본 선택 (이미 선택된 항목이 있으면 유지)
    setSelected((prev) => {
      if (prev) return prev
      return divs.length > 0 ? { type: 'division', id: divs[0].id } : null
    })
  }

  const profileName = (id: string | null) => (id ? allProfiles.find((p) => p.id === id)?.name || '알 수 없음' : null)

  const teamsInDept = (departmentId: string) => teams.filter((t) => t.department_id === departmentId)
  // 팀 구성원 목록: 팀장(admin)이 항상 최상단에 오도록 정렬한다
  const membersOfTeam = (teamId: string) =>
    teamMembers
      .filter((m) => m.team_id === teamId)
      .sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : 0))
  const directOfDept = (departmentId: string) => directMembers.filter((m) => m.department_id === departmentId)
  const approversOfDept = (departmentId: string) => approverDelegates.filter((a) => a.department_id === departmentId)
  const departmentsOfDivision = (divisionId: string) => departments.filter((d) => d.division_id === divisionId)

  // 부서/부문 인원수는 "고유 인원" 기준으로 센다.
  // - 팀장/부서장/부문장을 겸임해도 한 명은 한 번만 카운트한다 (Set으로 중복 제거)
  // - 부문장은 하위 부서/팀에 소속되어 있지 않아도 그 부문의 인원수에 포함된다
  const memberIdsOfDept = (departmentId: string): Set<string> => {
    const ids = new Set<string>()
    directOfDept(departmentId).forEach((m) => ids.add(m.user_id))
    teamsInDept(departmentId).forEach((t) => membersOfTeam(t.id).forEach((m) => ids.add(m.user_id)))
    const dept = departments.find((d) => d.id === departmentId)
    if (dept?.head_user_id) ids.add(dept.head_user_id)
    return ids
  }
  const headcountOfDept = (departmentId: string) => memberIdsOfDept(departmentId).size

  const memberIdsOfDivision = (divisionId: string): Set<string> => {
    const ids = new Set<string>()
    departmentsOfDivision(divisionId).forEach((d) => memberIdsOfDept(d.id).forEach((id) => ids.add(id)))
    const division = divisions.find((d) => d.id === divisionId)
    if (division?.head_user_id) ids.add(division.head_user_id)
    return ids
  }
  const headcountOfDivision = (divisionId: string) => memberIdsOfDivision(divisionId).size

  // ---------- 미지정 인원 ----------
  // 어느 팀에도, 어느 부서에도(직접 소속으로도) 속하지 않은 사람 = 미지정 인원.
  // 단, 부문장/부서장은 조직의 장으로 임명된 것 자체로 소속이 인정되므로
  // (부문장은 애초에 부서/팀에 소속될 필요가 없고, 부서장은 임명 시 자동으로
  // 해당 부서에 소속 처리된다) 미지정 인원 목록에서 제외한다.
  const unassignedProfiles = allProfiles.filter(
    (p) =>
      !teamMembers.some((m) => m.user_id === p.id) &&
      !directMembers.some((m) => m.user_id === p.id) &&
      !divisions.some((d) => d.head_user_id === p.id) &&
      !departments.some((d) => d.head_user_id === p.id)
  )

  // 이 사람이 배정 권한을 행사할 수 있는 부서 목록.
  // - 마스터: 전체 부서
  // - 부문장: 자신의 부문에 속한 모든 부서
  // - 부서장: 자신의 부서만
  // (canManageDepartment가 위 두 조건을 이미 포함해서 판별해준다)
  // 조직 관리 권한 트랙의 최상위 접근 여부 (시스템 관리자 또는 총괄 관리자)
  const hasTopAccess = hasTopOrgAccess(isMaster, isGeneralAdmin)

  const assignableDepartments = (): DepartmentRow[] =>
    hasTopAccess ? departments : departments.filter((d) => canManageDepartment(user.id, d.id, departments, divisions, hasTopAccess))

  const toggleExpand = (id: string) => {
    setExpandedDiv((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 사이드바에서 부문을 클릭했을 때: 선택 + 펼침/접힘 토글.
  // 오른쪽 메인 패널에 이미 이 부문이 표시되고 있는 상태에서 다시 누르면 접히고,
  // 그 외의 경우(다른 항목이 표시 중이거나 접혀 있는 경우)에는 이 부문을 선택하고 펼친다.
  const handleDivisionRowClick = (id: string) => {
    const isShowingThis = selected?.type === 'division' && selected.id === id
    if (isShowingThis && expandedDiv.has(id)) {
      setExpandedDiv((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      selectDivision(id)
    }
  }

  // 사이드바에서 부서를 클릭했을 때: 선택 + 하위 팀 펼침/접힘 토글.
  // 오른쪽 메인 패널에 이미 이 부서가 표시되고 있는 상태에서 다시 누르면 접히고,
  // 그 외의 경우에는 이 부서를 선택하고 하위 팀을 펼친다.
  const handleDepartmentRowClick = (id: string) => {
    const isShowingThis = selected?.type === 'department' && selected.id === id
    if (isShowingThis && expandedDept.has(id)) {
      setExpandedDept((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      selectDepartment(id)
    }
  }

  // ---------- 선택 ----------
  const selectDivision = (id: string) => {
    setSelected({ type: 'division', id })
    setActiveTab('structure')
    setMenuOpenId(null)
    setOpenStructureItem(null)
    setExpandedDiv((prev) => new Set(prev).add(id))
  }
  const selectDepartment = (id: string) => {
    setSelected({ type: 'department', id })
    setActiveTab('structure')
    setMenuOpenId(null)
    setOpenStructureItem(null)
    const dep = departments.find((d) => d.id === id)
    if (dep) setExpandedDiv((prev) => new Set(prev).add(dep.division_id))
    setExpandedDept((prev) => new Set(prev).add(id))
  }
  const selectTeam = (id: string) => {
    setSelected({ type: 'team', id })
    setActiveTab('members')
    setMenuOpenId(null)
    setOpenStructureItem(null)
    const team = teams.find((t) => t.id === id)
    const dept = team ? departments.find((d) => d.id === team.department_id) : null
    if (dept) {
      setExpandedDiv((prev) => new Set(prev).add(dept.division_id))
      setExpandedDept((prev) => new Set(prev).add(dept.id))
    }
  }

  // ---------- 검색 ----------
  const searchTerm = search.trim().toLowerCase()
  const matchesTerm = (name: string) => !searchTerm || name.toLowerCase().includes(searchTerm)
  const departmentMatchesSearch = (dept: DepartmentRow) =>
    matchesTerm(dept.name) || teamsInDept(dept.id).some((t) => matchesTerm(t.name))
  const divisionMatchesSearch = (division: DivisionRow) =>
    matchesTerm(division.name) || departmentsOfDivision(division.id).some(departmentMatchesSearch)
  const visibleDivisions = divisions.filter(divisionMatchesSearch)

  // ---------- 모달 열기/닫기 ----------
  const openModal = (m: ModalState) => {
    setModal(m)
    setModalInput('')
    setModalUserId('')
    setModalChecks({ can_vacation: true, can_remote: true, can_holiday: true })
    setMessage('')
  }
  const closeModal = () => setModal(null)

  const submitModal = async () => {
    if (!modal) return

    if (modal.kind === 'createDivision') {
      if (!modalInput.trim()) return
      const { error } = await supabase.from('divisions').insert({ name: modalInput.trim() })
      if (error) { setMessage('부문 생성 실패: ' + error.message); return }
    }

    if (modal.kind === 'createDepartment') {
      if (!modalInput.trim()) return
      const { error } = await supabase.from('departments').insert({ division_id: modal.divisionId, name: modalInput.trim() })
      if (error) { setMessage('부서 생성 실패: ' + error.message); return }
    }

    if (modal.kind === 'createTeam') {
      if (!modalInput.trim()) return
      // 팀 생성자를 자동으로 팀장으로 지정하지 않는다 — 생성과 팀장 지정은 별개 작업
      const { error } = await supabase.from('teams').insert({ name: modalInput.trim(), department_id: modal.departmentId, created_by: user.id })
      if (error) { setMessage('팀 생성 실패: ' + error.message); return }
    }

    if (modal.kind === 'assignDivisionHead') {
      const { error } = await supabase
        .from('divisions')
        .update({ head_user_id: modalUserId || null, updated_at: new Date().toISOString() })
        .eq('id', modal.divisionId)
      if (error) { setMessage('부문장 지정 실패: ' + error.message); return }
    }

    if (modal.kind === 'assignDepartmentHead') {
      // 교체되기 전의 부서장을 먼저 기억해둔다 (아래에서 그 사람의 겸임 잔여 소속을 정리하기 위함).
      const previousHeadId = departments.find((d) => d.id === modal.departmentId)?.head_user_id || null

      const { error } = await supabase
        .from('departments')
        .update({ head_user_id: modalUserId || null, updated_at: new Date().toISOString() })
        .eq('id', modal.departmentId)
      if (error) { setMessage('부서장 지정 실패: ' + error.message); return }

      // 부서장으로 임명되면 자동으로 그 부서 소속이 되어야 한다.
      // 이미 그 부서(팀 소속 포함)에 속해 있다면 중복으로 추가하지 않는다.
      if (modalUserId) {
        const alreadyBelongsToDept =
          directMembers.some((m) => m.department_id === modal.departmentId && m.user_id === modalUserId) ||
          teamsInDept(modal.departmentId).some((t) => membersOfTeam(t.id).some((m) => m.user_id === modalUserId))
        if (!alreadyBelongsToDept) {
          await supabase.from('department_memberships').insert({ department_id: modal.departmentId, user_id: modalUserId })
        }
      }

      // 방금 자리에서 물러난 이전 부서장이 이 부서가 속한 부문의 부문장을 겸임하고 있었다면,
      // 부서장 임명 시 자동으로 붙었던 "부서 직속" 잔여 소속을 함께 정리한다.
      // (부문장은 부서에 소속될 필요 없이도 산하 모든 부서에 접근 가능하므로, 부서장 자리에서
      //  내려온 뒤에는 부문장으로만 남아야 하고 부서 직속으로 남아있으면 안 된다.)
      if (previousHeadId && previousHeadId !== modalUserId) {
        const dept = departments.find((d) => d.id === modal.departmentId)
        const parentDivision = dept ? divisions.find((dv) => dv.id === dept.division_id) : null
        if (parentDivision?.head_user_id === previousHeadId) {
          await supabase
            .from('department_memberships')
            .delete()
            .eq('department_id', modal.departmentId)
            .eq('user_id', previousHeadId)
        }
      }
    }

    if (modal.kind === 'assignTeamHead') {
      if (modalUserId) {
        await performAssignTeamLead(modal.teamId, modal.departmentId, modalUserId)
      } else {
        const currentLeads = teamMembers.filter((m) => m.team_id === modal.teamId && m.role === 'admin')
        for (const lead of currentLeads) {
          await performDemoteTeamLead(modal.teamId, lead.user_id)
        }
      }
    }

    if (modal.kind === 'addApprover') {
      if (!modalUserId) { setMessage('결재권자로 위임할 사람을 선택해주세요.'); return }
      const { error } = await supabase.from('department_approvers').upsert({
        department_id: modal.departmentId,
        user_id: modalUserId,
        ...modalChecks,
      }, { onConflict: 'department_id,user_id' })
      if (error) { setMessage('결재권자 위임 실패: ' + error.message); return }
    }

    closeModal()
    fetchAll()
  }

  const handleRemoveApprover = async (id: string) => {
    if (!confirm('이 사람의 결재권자 위임을 해제할까요?')) return
    await supabase.from('department_approvers').delete().eq('id', id)
    fetchAll()
  }

  // ---------- 팀장 지정/해제 ----------
  // 팀장은 한 명만 가능 — 새로 지정하면 기존 팀장은 자동으로 해제된다.
  const performAssignTeamLead = async (teamId: string, departmentId: string, userId: string) => {
    const currentLeads = teamMembers.filter((m) => m.team_id === teamId && m.role === 'admin' && m.user_id !== userId)
    for (const lead of currentLeads) {
      await supabase.from('team_members').update({ role: 'member' }).eq('team_id', teamId).eq('user_id', lead.user_id)
    }

    const oldTeamMembership = teamMembers.find(
      (m) => m.user_id === userId && m.team_id !== teamId && teams.find((t) => t.id === m.team_id)?.department_id === departmentId
    )
    if (oldTeamMembership) {
      await supabase.from('team_members').delete().eq('team_id', oldTeamMembership.team_id).eq('user_id', userId)
    }
    await supabase.from('department_memberships').delete().eq('department_id', departmentId).eq('user_id', userId)

    const existing = teamMembers.find((m) => m.team_id === teamId && m.user_id === userId)
    if (existing) {
      await supabase.from('team_members').update({ role: 'admin' }).eq('team_id', teamId).eq('user_id', userId)
    } else {
      await supabase.from('team_members').insert({ team_id: teamId, user_id: userId, role: 'admin' })
    }
  }

  const performDemoteTeamLead = async (teamId: string, userId: string) => {
    await supabase.from('team_members').update({ role: 'member' }).eq('team_id', teamId).eq('user_id', userId)
  }

  // 이 팀의 현재 팀장(1명) 조회
  const teamLeadOf = (teamId: string) => teamMembers.find((m) => m.team_id === teamId && m.role === 'admin') || null

  // ---------- 구성원 이동 ----------
  const departmentsForActor = (division: DivisionRow, departmentIdHint: string): DepartmentRow[] => {
    if (hasTopAccess) return departments
    if (isDivisionHead(user.id, division, hasTopAccess)) return departments.filter((d) => d.division_id === division.id)
    return departments.filter((d) => d.id === departmentIdHint)
  }

  const openMove = (key: string, currentDepartmentId: string, currentTeamId: string | null) => {
    setMovingKey(key)
    setMoveTargetDept(currentDepartmentId)
    setMoveTargetTeam(currentTeamId || '')
  }
  const closeMove = () => { setMovingKey(null); setMoveTargetDept(''); setMoveTargetTeam('') }

  // ---------- 미지정 인원 배정 ----------
  const openAssign = (userId: string) => {
    const myDepts = assignableDepartments()
    setAssigningId(userId)
    setAssignTargetDept(myDepts[0]?.id || '')
    setAssignTargetTeam('')
  }
  const closeAssign = () => { setAssigningId(null); setAssignTargetDept(''); setAssignTargetTeam('') }

  const handleConfirmAssign = async (userId: string) => {
    if (!assignTargetDept) return
    if (assignTargetTeam) {
      const { error } = await supabase.from('team_members').insert({ team_id: assignTargetTeam, user_id: userId, role: 'member' })
      if (error) { setMessage('배정 실패: ' + error.message); return }
    } else {
      const { error } = await supabase.from('department_memberships').insert({ department_id: assignTargetDept, user_id: userId })
      if (error) { setMessage('배정 실패: ' + error.message); return }
    }
    closeAssign()
    fetchAll()
  }

  // ---------- 소속 해제 (내보내기) ----------
  // 내보내기는 "그 조작이 일어난 범위"만 해제한다. 겸임 중인 상위/별개 직위(예: 부문장)는
  // 이 부서·팀과 무관하게 유지되는 독립적인 자리이므로 함께 해제하지 않는다.
  // 예) 부문장을 겸임 중인 부서장을 부서에서 내보내면 그 부서 소속·부서장 자리만 사라지고
  //     부문장 지위는 그대로 남는다. (부문장 자리를 비우려면 "부문장 변경"에서 공석으로 지정)

  // 팀에서 내보내기: 그 팀 소속만 해제한다. 부서 직속/다른 팀/부서장·부문장 등은 그대로 유지된다.
  const handleUnassignFromTeam = async (teamId: string, userId: string) => {
    if (!confirm('이 사람을 이 팀에서 내보낼까요?')) return
    await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
    fetchAll()
  }

  // 부서에서 내보내기: 그 부서 직속 소속과 그 부서 산하 팀 소속을 모두 해제한다.
  // 내보내는 대상이 이 부서의 부서장이었다면 부서장 자리도 함께 비운다(부서에 속하지 않으면서
  // 부서장일 수는 없으므로). 다만 이 사람이 겸임 중인 부문장 등 다른 조직의 직위는 건드리지 않는다.
  const handleUnassignFromDept = async (departmentId: string, userId: string) => {
    if (!departmentId) return
    if (!confirm('이 사람을 이 부서에서 내보낼까요?')) return
    const deptTeamIds = teamsInDept(departmentId).map((t) => t.id)
    await Promise.all([
      supabase.from('department_memberships').delete().eq('department_id', departmentId).eq('user_id', userId),
      ...(deptTeamIds.length > 0
        ? [supabase.from('team_members').delete().eq('user_id', userId).in('team_id', deptTeamIds)]
        : []),
      supabase
        .from('departments')
        .update({ head_user_id: null, updated_at: new Date().toISOString() })
        .eq('id', departmentId)
        .eq('head_user_id', userId),
    ])
    fetchAll()
  }

  const handleConfirmMove = async (userId: string, fromTeamId: string | null, fromDepartmentId: string) => {
    if (!moveTargetDept) return
    if (fromTeamId) {
      await supabase.from('team_members').delete().eq('team_id', fromTeamId).eq('user_id', userId)
    } else {
      await supabase.from('department_memberships').delete().eq('department_id', fromDepartmentId).eq('user_id', userId)
    }
    if (moveTargetTeam) {
      await supabase.from('team_members').insert({ team_id: moveTargetTeam, user_id: userId, role: 'member' })
    } else {
      await supabase.from('department_memberships').insert({ department_id: moveTargetDept, user_id: userId })
    }
    closeMove()
    fetchAll()
  }

  // ---------- 부문/부서 삭제 (하위 항목이 없을 때만 허용) ----------
  const handleDeleteDivision = async (division: DivisionRow) => {
    if (departmentsOfDivision(division.id).length > 0) {
      alert('하위 부서가 있는 부문은 삭제할 수 없어요. 먼저 부서를 정리해주세요.')
      return
    }
    if (!confirm(`'${division.name}' 부문을 삭제할까요?`)) return
    const { error } = await supabase.from('divisions').delete().eq('id', division.id)
    if (error) { setMessage('부문 삭제 실패: ' + error.message); return }
    setSelected((prev) => (prev?.type === 'division' && prev.id === division.id ? null : prev))
    fetchAll()
  }

  const handleDeleteTeam = async (team: TeamRow) => {
    const hasMembers = membersOfTeam(team.id).length > 0
    if (hasMembers) {
      alert('소속된 구성원이 있는 팀은 삭제할 수 없어요. 먼저 인원을 정리해주세요.')
      return
    }
    if (!confirm(`'${team.name}' 팀을 삭제할까요?`)) return
    const { error } = await supabase.from('teams').delete().eq('id', team.id)
    if (error) { setMessage('팀 삭제 실패: ' + error.message); return }
    setOpenStructureItem((prev) => (prev === `team-${team.id}` ? null : prev))
    setSelected((prev) => (prev?.type === 'team' && prev.id === team.id ? { type: 'department', id: team.department_id } : prev))
    fetchAll()
  }

  const handleDeleteDepartment = async (department: DepartmentRow) => {
    const hasTeams = teamsInDept(department.id).length > 0
    const hasDirect = directOfDept(department.id).length > 0
    if (hasTeams || hasDirect) {
      alert('소속된 팀이나 구성원이 있는 부서는 삭제할 수 없어요. 먼저 인원을 정리해주세요.')
      return
    }
    if (!confirm(`'${department.name}' 부서를 삭제할까요?`)) return
    const { error } = await supabase.from('departments').delete().eq('id', department.id)
    if (error) { setMessage('부서 삭제 실패: ' + error.message); return }
    setSelected((prev) => (prev?.type === 'department' && prev.id === department.id
      ? { type: 'division', id: department.division_id }
      : prev))
    fetchAll()
  }

  // ── 순서 변경 (req 4, 5, 6, 8) ─────────────────────────────────────────
  // 특정 그룹(같은 부문 소속 부서들, 같은 부서 소속 팀들, 같은 부서 직속 인원, 같은 팀 인원)만
  // 새 순서로 갈아끼우고 나머지 항목은 원래 자리를 유지한다.
  function replaceGroup<T>(all: T[], inGroup: (item: T) => boolean, newGroupOrder: T[]): T[] {
    const result: T[] = []
    let inserted = false
    for (const item of all) {
      if (inGroup(item)) {
        if (!inserted) {
          result.push(...newGroupOrder)
          inserted = true
        }
      } else {
        result.push(item)
      }
    }
    if (!inserted) result.push(...newGroupOrder)
    return result
  }

  const startReorderDepartments = (divisionId: string) => {
    setSelected({ type: 'division', id: divisionId })
    setActiveTab('structure')
    setMenuOpenId(null)
    setReorder({ kind: 'departments', divisionId })
  }
  const startReorderTeams = (departmentId: string) => {
    setSelected({ type: 'department', id: departmentId })
    setActiveTab('structure')
    setMenuOpenId(null)
    setReorder({ kind: 'teams', departmentId })
  }
  const startReorderDeptMembers = (departmentId: string) => {
    setSelected({ type: 'department', id: departmentId })
    setActiveTab('members')
    setMenuOpenId(null)
    setReorder({ kind: 'deptMembers', departmentId })
  }
  const cancelReorder = () => {
    setReorder(null)
    fetchAll()
  }
  const finishReorder = async () => {
    if (!reorder) return
    try {
      if (reorder.kind === 'departments') {
        const group = departments.filter((d) => d.division_id === reorder.divisionId)
        await Promise.all(group.map((d, idx) => supabase.from('departments').update({ display_order: idx }).eq('id', d.id)))
      } else if (reorder.kind === 'teams') {
        const group = teams.filter((t) => t.department_id === reorder.departmentId)
        await Promise.all(group.map((t, idx) => supabase.from('teams').update({ display_order: idx }).eq('id', t.id)))
      } else if (reorder.kind === 'deptMembers') {
        const directGroup = directMembers.filter((m) => m.department_id === reorder.departmentId)
        const tasks = directGroup.map((m, idx) =>
          supabase.from('department_memberships').update({ display_order: idx }).eq('department_id', reorder.departmentId).eq('user_id', m.user_id)
        )
        const teamIds = teams.filter((t) => t.department_id === reorder.departmentId).map((t) => t.id)
        teamIds.forEach((teamId) => {
          const group = teamMembers.filter((m) => m.team_id === teamId)
          group.forEach((m, idx) => {
            tasks.push(supabase.from('team_members').update({ display_order: idx }).eq('team_id', teamId).eq('user_id', m.user_id))
          })
        })
        await Promise.all(tasks)
      }
    } finally {
      setReorder(null)
      fetchAll()
    }
  }
  // 순서변경 모드일 때 "지금 활성화된 그룹"이 아닌 나머지 UI에 적용할 비활성/저채도 스타일
  const dimClass = (active: boolean) =>
    active ? '' : 'opacity-40 pointer-events-none select-none transition-opacity'

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  const selectedDivision = selected?.type === 'division' ? divisions.find((d) => d.id === selected.id) || null : null
  const selectedDepartment = selected?.type === 'department' ? departments.find((d) => d.id === selected.id) || null : null
  const parentDivisionOfSelectedDept = selectedDepartment
    ? divisions.find((d) => d.id === selectedDepartment.division_id) || null
    : null
  const selectedTeam = selected?.type === 'team' ? teams.find((t) => t.id === selected.id) || null : null
  const parentDeptOfSelectedTeam = selectedTeam
    ? departments.find((d) => d.id === selectedTeam.department_id) || null
    : null
  const parentDivOfSelectedTeamDept = parentDeptOfSelectedTeam
    ? divisions.find((d) => d.id === parentDeptOfSelectedTeam.division_id) || null
    : null

  // ============ 상세 패널 렌더 함수 (데스크탑/모바일 공용) ============
  function renderUnassignedDetail() {
    const myDepts = assignableDepartments()
    return (
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="text-xl font-bold dark:text-white">미지정 인원</h2>
          <span className="text-sm text-gray-400 dark:text-zinc-500 shrink-0">
            {unassignedProfiles.length}명
          </span>
        </div>
        <p className="text-sm text-gray-400 dark:text-zinc-500 mb-4">
          어느 팀이나 부서에도 소속되지 않은 인원이에요. 내가 관리하는 조직으로 배정할 수 있어요.
        </p>

        {unassignedProfiles.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">미지정 인원이 없어요.</p>
        )}

        <div className="space-y-2">
          {unassignedProfiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-zinc-900/40 rounded-xl px-4 py-3">
              <span className="text-sm font-medium dark:text-white truncate">{p.name}</span>
              {myDepts.length === 0 ? (
                <span className="text-[11px] text-gray-300 dark:text-zinc-600 shrink-0">배정 권한 없음</span>
              ) : assigningId === p.id ? (
                <MoveForm
                  departmentsForActor={myDepts}
                  moveTargetDept={assignTargetDept}
                  setMoveTargetDept={setAssignTargetDept}
                  moveTargetTeam={assignTargetTeam}
                  setMoveTargetTeam={setAssignTargetTeam}
                  teamsInDept={teamsInDept}
                  onConfirm={() => handleConfirmAssign(p.id)}
                  onCancel={closeAssign}
                />
              ) : (
                <button onClick={() => openAssign(p.id)} className="text-xs text-blue-500 hover:underline font-medium shrink-0">
                  + 배정
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderDivisionDetail(division: DivisionRow, mobile = false) {
    const canManageThisDivision = canManageDivision(user.id, division.id, divisions, hasTopAccess)
    const deptList = departmentsOfDivision(division.id)
    const isReorderingDepts = reorder?.kind === 'departments' && reorder.divisionId === division.id
    const headKey = `div-head-${division.id}`

    return (
      <div>
        <div className="flex items-start justify-between mb-1 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold dark:text-white truncate">{division.name}</h2>
            </div>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
              {profileName(division.head_user_id) || '부문장 공석'} · 총 {headcountOfDivision(division.id)}명
            </p>
          </div>
          <div className={`flex items-center gap-1.5 relative shrink-0 ${dimClass(!reorder)}`}>
            {(hasTopAccess || canManageThisDivision) && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === `div-${division.id}` ? null : `div-${division.id}`) }}
                  className="text-gray-400 dark:text-zinc-500 px-1.5 py-1.5"
                >
                  ⋮
                </button>
                {menuOpenId === `div-${division.id}` && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-9 bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-lg shadow-lg py-1 w-36 z-10">
                    {hasTopAccess && (
                      <button
                        onClick={() => { setMenuOpenId(null); openModal({ kind: 'assignDivisionHead', divisionId: division.id }) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      >
                        부문장 변경
                      </button>
                    )}
                    {canManageThisDivision && deptList.length > 1 && (
                      <button
                        onClick={() => startReorderDepartments(division.id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      >
                        순서 변경
                      </button>
                    )}
                    {hasTopAccess && (
                      <button
                        onClick={() => { setMenuOpenId(null); handleDeleteDivision(division) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        부문 삭제
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className={dimClass(!reorder)}>
          <TabBar
            tabs={[
              { key: 'structure', label: '부서' },
              { key: 'members', label: '구성원' },
              { key: 'permissions', label: '권한 관리' },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
          />
        </div>

        {activeTab === 'structure' && (
          <div>
            <div className="flex justify-between items-center mb-3">
              {isReorderingDepts ? (
                <p className="text-xs text-blue-500 font-medium">순서를 드래그해서 바꿔보세요.</p>
              ) : <span />}
              {canManageThisDivision && !reorder && (
                <button
                  onClick={() => openModal({ kind: 'createDepartment', divisionId: division.id })}
                  className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1.5 rounded-lg font-medium"
                >
                  + 부서 생성
                </button>
              )}
              {isReorderingDepts && (
                <span className="flex items-center gap-3">
                  <button onClick={cancelReorder} className="text-xs text-gray-400 dark:text-zinc-500 hover:underline">취소</button>
                  <button onClick={finishReorder} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">완료</button>
                </span>
              )}
            </div>
            {deptList.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">등록된 부서가 없어요.</p>
            )}
            <div className={`space-y-2 ${dimClass(!reorder || isReorderingDepts)}`}>
              <DragList
                items={deptList}
                getKey={(d) => d.id}
                disabled={!isReorderingDepts}
                onReorder={(next) => setDepartments((prev) => replaceGroup(prev, (d) => d.division_id === division.id, next))}
                renderItem={(department) => (
                  isReorderingDepts ? (
                    <div className="w-full flex items-center justify-between bg-gray-50 dark:bg-zinc-900/40 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm dark:text-white truncate">{department.name}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                          {profileName(department.head_user_id) || '부서장 공석'} · {headcountOfDept(department.id)}명
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => selectDepartment(department.id)}
                      className="w-full flex items-center justify-between bg-gray-50 dark:bg-zinc-900/40 hover:bg-gray-100 dark:hover:bg-zinc-900/70 rounded-xl px-4 py-3 text-left transition"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm dark:text-white truncate">{department.name}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                          {profileName(department.head_user_id) || '부서장 공석'} · {headcountOfDept(department.id)}명
                        </p>
                      </div>
                      <span className="text-gray-300 dark:text-zinc-600 shrink-0 ml-2">›</span>
                    </button>
                  )
                )}
              />
            </div>
            {mobile && canManageThisDivision && !reorder && (
              <button
                onClick={() => openModal({ kind: 'createDepartment', divisionId: division.id })}
                className="w-full mt-3 border border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 py-2.5 rounded-xl text-sm font-medium"
              >
                + 부서 생성
              </button>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className={`space-y-4 ${dimClass(!reorder)}`}>
            {division.head_user_id && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">부문장</p>
                <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                  <span className="font-medium dark:text-white">{profileName(division.head_user_id)}</span>
                  {hasTopAccess && (
                    movingKey === headKey ? (
                      <MoveForm
                        departmentsForActor={departmentsForActor(division, deptList[0]?.id || '')}
                        moveTargetDept={moveTargetDept}
                        setMoveTargetDept={setMoveTargetDept}
                        moveTargetTeam={moveTargetTeam}
                        setMoveTargetTeam={setMoveTargetTeam}
                        teamsInDept={teamsInDept}
                        onConfirm={() => handleConfirmMove(
                          division.head_user_id as string,
                          null,
                          directMembers.find((m) => m.user_id === division.head_user_id)?.department_id || ''
                        )}
                        onCancel={closeMove}
                      />
                    ) : (
                      <>
                        <button
                          onClick={() => openMove(
                            headKey,
                            directMembers.find((m) => m.user_id === division.head_user_id)?.department_id || deptList[0]?.id || '',
                            null
                          )}
                          className="text-xs text-blue-400 hover:underline"
                        >
                          이동
                        </button>
                        {directMembers.some((m) => m.user_id === division.head_user_id) && (
                          <button
                            onClick={() => handleUnassignFromDept(
                              directMembers.find((m) => m.user_id === division.head_user_id)?.department_id || '',
                              division.head_user_id as string
                            )}
                            className="text-xs text-red-400 hover:underline"
                          >
                            내보내기
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              </div>
            )}
            {deptList.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">등록된 부서가 없어요.</p>
            )}
            {deptList.map((department) => {
              // 부서장은 이미 위 배지에서 다룰 수 있으므로(우선순위 표시, req 11) 직속 목록에서는 중복 노출하지 않는다.
              const directs = directOfDept(department.id).filter((m) => m.user_id !== department.head_user_id)
              const deptTeams = teamsInDept(department.id)
              const teamMembersFlat = deptTeams.flatMap((t) => membersOfTeam(t.id))
              const headEntry = department.head_user_id ? directOfDept(department.id).find((m) => m.user_id === department.head_user_id) : null
              return (
                <div key={department.id}>
                  <button onClick={() => selectDepartment(department.id)} className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5 hover:underline">
                    {department.name} ({headcountOfDept(department.id)}명)
                  </button>
                  <div className="space-y-1">
                    {headEntry && (
                      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                        <span className="font-medium dark:text-white">{headEntry.name}</span>
                        <span className="text-[10px] text-blue-500">부서장</span>
                      </div>
                    )}
                    {directs.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                        <span>{m.name}</span>
                      </div>
                    ))}
                    {teamMembersFlat.map((m) => (
                      <div key={`${m.team_id}-${m.user_id}`} className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                        <span>{m.name}</span>
                        {m.role === 'admin' && <span className="text-[10px] text-blue-500">팀장</span>}
                      </div>
                    ))}
                    {!headEntry && directs.length === 0 && teamMembersFlat.length === 0 && (
                      <span className="text-[11px] text-gray-300 dark:text-zinc-600">소속 인원 없음</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}


        {activeTab === 'permissions' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400 dark:text-zinc-500">결재권자 위임은 각 부서 화면에서 관리할 수 있어요. 부서를 선택해주세요.</p>
            {deptList.map((department) => (
              <div key={department.id}>
                <button onClick={() => selectDepartment(department.id)} className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5 hover:underline">
                  {department.name} ›
                </button>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                    {profileName(department.head_user_id) || '부서장 공석'} · 부장(자동)
                  </span>
                  {approversOfDept(department.id).map((a) => (
                    <span key={a.id} className="text-[11px] bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">
                      {a.name} {[a.can_vacation && '휴가', a.can_remote && '원격', a.can_holiday && '휴일'].filter(Boolean).join('·')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderDepartmentDetail(department: DepartmentRow, division: DivisionRow, mobile = false) {
    const canManageThisDept = canManageDepartment(user.id, department.id, departments, divisions, hasTopAccess)
    const canManageThisDivision = canManageDivision(user.id, division.id, divisions, hasTopAccess)
    const deptTeams = teamsInDept(department.id)
    const directs = directOfDept(department.id)
    const delegates = approversOfDept(department.id)
    const isReorderingTeams = reorder?.kind === 'teams' && reorder.departmentId === department.id
    const isReorderingMembers = reorder?.kind === 'deptMembers' && reorder.departmentId === department.id
    const headKey = `dept-head-${department.id}`

    return (
      <div>
        {!mobile && (
          <button onClick={() => selectDivision(division.id)} className={`text-xs text-gray-300 dark:text-zinc-600 mb-1 hover:underline ${dimClass(!reorder)}`}>
            {division.name}
          </button>
        )}
        <div className="flex items-start justify-between mb-1 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold dark:text-white truncate">{department.name}</h2>
            </div>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
              {profileName(department.head_user_id) || '부서장 공석'} · 총 {headcountOfDept(department.id)}명
            </p>
          </div>
          <div className={`flex items-center gap-1.5 relative shrink-0 ${dimClass(!reorder)}`}>
            {(canManageThisDivision || canManageThisDept) && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === `dept-${department.id}` ? null : `dept-${department.id}`) }}
                  className="text-gray-400 dark:text-zinc-500 px-1.5 py-1.5"
                >
                  ⋮
                </button>
                {menuOpenId === `dept-${department.id}` && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-9 bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-lg shadow-lg py-1 w-36 z-10">
                    {canManageThisDivision && (
                      <button
                        onClick={() => { setMenuOpenId(null); openModal({ kind: 'assignDepartmentHead', departmentId: department.id }) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      >
                        부서장 변경
                      </button>
                    )}
                    {canManageThisDept && deptTeams.length > 1 && (
                      <button
                        onClick={() => startReorderTeams(department.id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      >
                        팀 순서 변경
                      </button>
                    )}
                    {canManageThisDept && (directs.length + deptTeams.reduce((acc, t) => acc + membersOfTeam(t.id).length, 0)) > 1 && (
                      <button
                        onClick={() => startReorderDeptMembers(department.id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                      >
                        구성원 순서 변경
                      </button>
                    )}
                    {canManageThisDivision && (
                      <button
                        onClick={() => { setMenuOpenId(null); handleDeleteDepartment(department) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        부서 삭제
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className={dimClass(!reorder)}>
          <TabBar
            tabs={[
              { key: 'structure', label: '팀' },
              { key: 'members', label: '구성원' },
              { key: 'permissions', label: '권한 관리' },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
          />
        </div>

        {activeTab === 'structure' && (
          <div>
            {canManageThisDept && !reorder && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => openModal({ kind: 'createTeam', departmentId: department.id })}
                  className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1.5 rounded-lg font-medium"
                >
                  + 팀 생성
                </button>
              </div>
            )}
            {isReorderingTeams && (
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-blue-500 font-medium">팀 순서를 드래그해서 바꿔보세요.</p>
                <span className="flex items-center gap-3">
                  <button onClick={cancelReorder} className="text-xs text-gray-400 dark:text-zinc-500 hover:underline">취소</button>
                  <button onClick={finishReorder} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">완료</button>
                </span>
              </div>
            )}

            {/* 부서 직속: 팀보다 상위 개념이므로 팀 목록과 같은 카드 형식으로, 가장 먼저 보여준다 (순서변경 대상 아님) */}
            <div className={`mb-2 ${dimClass(!isReorderingTeams)}`}>
              <button
                onClick={() => setOpenStructureItem(openStructureItem === 'direct' ? null : 'direct')}
                className="w-full flex items-center justify-between bg-gray-50 dark:bg-zinc-900/40 hover:bg-gray-100 dark:hover:bg-zinc-900/70 rounded-xl px-4 py-3 text-left transition"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm dark:text-white truncate">부서 직속</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{directs.length}명</p>
                </div>
                <span className="text-gray-300 dark:text-zinc-600 shrink-0 ml-2">{openStructureItem === 'direct' ? '⌄' : '›'}</span>
              </button>
              {openStructureItem === 'direct' && (
                <div className="mt-1.5 px-4 py-3 bg-gray-50/60 dark:bg-zinc-900/20 rounded-xl">
                  {directs.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-zinc-600">소속된 인원이 없어요.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {directs.map((d) => {
                        const key = `direct-${department.id}-${d.user_id}`
                        return (
                          <div key={key} className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                            <span>{d.name}</span>
                            {d.user_id === department.head_user_id && <span className="text-[10px] text-blue-500">부서장</span>}
                            {canManageThisDept && (
                              movingKey === key ? (
                                <MoveForm
                                  departmentsForActor={departmentsForActor(division, department.id)}
                                  moveTargetDept={moveTargetDept}
                                  setMoveTargetDept={setMoveTargetDept}
                                  moveTargetTeam={moveTargetTeam}
                                  setMoveTargetTeam={setMoveTargetTeam}
                                  teamsInDept={teamsInDept}
                                  onConfirm={() => handleConfirmMove(d.user_id, null, department.id)}
                                  onCancel={closeMove}
                                />
                              ) : (
                                <>
                                  <button onClick={() => openMove(key, department.id, null)} className="text-xs text-blue-400 hover:underline">이동</button>
                                  <button onClick={() => handleUnassignFromDept(department.id, d.user_id)} className="text-xs text-red-400 hover:underline">내보내기</button>
                                </>
                              )
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {deptTeams.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">등록된 팀이 없어요.</p>
            )}
            <div className="space-y-2">
              <DragList
                items={deptTeams}
                getKey={(t) => t.id}
                disabled={!isReorderingTeams}
                onReorder={(next) => setTeams((prev) => replaceGroup(prev, (t) => t.department_id === department.id, next))}
                renderItem={(team) => {
                  const members = membersOfTeam(team.id)
                  const lead = teamLeadOf(team.id)
                  return isReorderingTeams ? (
                    <div className="w-full flex items-center justify-between bg-gray-50 dark:bg-zinc-900/40 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm dark:text-white truncate">{team.name}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                          {lead ? `팀장 ${lead.name}` : '팀장 공석'} · {members.length}명
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => selectTeam(team.id)}
                      className="w-full flex items-center justify-between bg-gray-50 dark:bg-zinc-900/40 hover:bg-gray-100 dark:hover:bg-zinc-900/70 rounded-xl px-4 py-3 text-left transition"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm dark:text-white truncate">{team.name}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                          {lead ? `팀장 ${lead.name}` : '팀장 공석'} · {members.length}명
                        </p>
                      </div>
                      <span className="text-gray-300 dark:text-zinc-600 shrink-0 ml-2">›</span>
                    </button>
                  )
                }}
              />
            </div>

            {mobile && canManageThisDept && !reorder && (
              <button
                onClick={() => openModal({ kind: 'createTeam', departmentId: department.id })}
                className="w-full mt-4 border border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 py-2.5 rounded-xl text-sm font-medium"
              >
                + 팀 생성
              </button>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className={`space-y-4 ${dimClass(!reorder || isReorderingMembers)}`}>
            {isReorderingMembers && (
              <div className="flex justify-between items-center -mt-1">
                <p className="text-xs text-blue-500 font-medium">각 목록 안에서 순서를 드래그해서 바꿔보세요.</p>
                <span className="flex items-center gap-3">
                  <button onClick={cancelReorder} className="text-xs text-gray-400 dark:text-zinc-500 hover:underline">취소</button>
                  <button onClick={finishReorder} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">완료</button>
                </span>
              </div>
            )}
            {department.head_user_id && (
              <div className={dimClass(!isReorderingMembers)}>
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">부서장</p>
                <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                  <span className="font-medium dark:text-white">{profileName(department.head_user_id)}</span>
                  {canManageThisDivision && !isReorderingMembers && (
                    movingKey === headKey ? (
                      <MoveForm
                        departmentsForActor={departmentsForActor(division, department.id)}
                        moveTargetDept={moveTargetDept}
                        setMoveTargetDept={setMoveTargetDept}
                        moveTargetTeam={moveTargetTeam}
                        setMoveTargetTeam={setMoveTargetTeam}
                        teamsInDept={teamsInDept}
                        onConfirm={() => handleConfirmMove(department.head_user_id as string, null, department.id)}
                        onCancel={closeMove}
                      />
                    ) : (
                      <>
                        <button onClick={() => openMove(headKey, department.id, null)} className="text-xs text-blue-400 hover:underline">이동</button>
                        <button onClick={() => handleUnassignFromDept(department.id, department.head_user_id as string)} className="text-xs text-red-400 hover:underline">내보내기</button>
                      </>
                    )
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">부서 직속</p>
              {/* 부서장은 위 배지에서 우선 표시하므로(req 11) 여기서는 중복 노출하지 않는다 */}
              {(() => {
                const directsExcludingHead = directs.filter((d) => d.user_id !== department.head_user_id)
                return directsExcludingHead.length === 0 ? (
                  <p className="text-xs text-gray-300 dark:text-zinc-600">없음</p>
                ) : (
                  <div className="space-y-1">
                    <DragList
                      items={directsExcludingHead}
                      getKey={(d) => d.user_id}
                      disabled={!isReorderingMembers}
                      onReorder={(next) => setDirectMembers((prev) => replaceGroup(
                        prev,
                        (m) => m.department_id === department.id && m.user_id !== department.head_user_id,
                        next
                      ))}
                      renderItem={(d) => (
                        <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                          <span>{d.name}</span>
                          {canManageThisDept && !isReorderingMembers && (
                            movingKey === `direct-${department.id}-${d.user_id}` ? (
                              <MoveForm
                                departmentsForActor={departmentsForActor(division, department.id)}
                                moveTargetDept={moveTargetDept}
                                setMoveTargetDept={setMoveTargetDept}
                                moveTargetTeam={moveTargetTeam}
                                setMoveTargetTeam={setMoveTargetTeam}
                                teamsInDept={teamsInDept}
                                onConfirm={() => handleConfirmMove(d.user_id, null, department.id)}
                                onCancel={closeMove}
                              />
                            ) : (
                              <>
                                <button onClick={() => openMove(`direct-${department.id}-${d.user_id}`, department.id, null)} className="text-xs text-blue-400 hover:underline">이동</button>
                                <button onClick={() => handleUnassignFromDept(department.id, d.user_id)} className="text-xs text-red-400 hover:underline">내보내기</button>
                              </>
                            )
                          )}
                        </div>
                      )}
                    />
                  </div>
                )
              })()}
            </div>

            {deptTeams.map((team) => {
              const members = membersOfTeam(team.id)
              if (members.length === 0) return null
              return (
                <div key={team.id}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">{team.name}</p>
                  <div className="space-y-1">
                    <DragList
                      items={members}
                      getKey={(m) => m.user_id}
                      disabled={!isReorderingMembers}
                      onReorder={(next) => setTeamMembers((prev) => replaceGroup(prev, (m) => m.team_id === team.id, next))}
                      renderItem={(m) => (
                        <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                          <span>{m.name}</span>
                          {m.role === 'admin' && <span className="text-[10px] text-blue-500">팀장</span>}
                          {canManageThisDept && !isReorderingMembers && (
                            movingKey === `team-${team.id}-${m.user_id}` ? (
                              <MoveForm
                                departmentsForActor={departmentsForActor(division, department.id)}
                                moveTargetDept={moveTargetDept}
                                setMoveTargetDept={setMoveTargetDept}
                                moveTargetTeam={moveTargetTeam}
                                setMoveTargetTeam={setMoveTargetTeam}
                                teamsInDept={teamsInDept}
                                onConfirm={() => handleConfirmMove(m.user_id, team.id, department.id)}
                                onCancel={closeMove}
                              />
                            ) : (
                              <>
                                <button onClick={() => openMove(`team-${team.id}-${m.user_id}`, department.id, team.id)} className="text-xs text-blue-400 hover:underline">이동</button>
                                <button onClick={() => handleUnassignFromTeam(team.id, m.user_id)} className="text-xs text-red-400 hover:underline">내보내기</button>
                              </>
                            )
                          )}
                        </div>
                      )}
                    />
                  </div>
                </div>
              )
            })}

            {deptTeams.every((t) => membersOfTeam(t.id).length === 0) && directs.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">소속된 구성원이 없어요.</p>
            )}
          </div>
        )}

        {activeTab === 'permissions' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 dark:text-zinc-500">결재권자</p>
              {canManageThisDept && (
                <button
                  onClick={() => openModal({ kind: 'addApprover', departmentId: department.id })}
                  className="text-xs text-blue-500 hover:underline font-medium"
                >
                  + 결재권자 위임
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                {profileName(department.head_user_id) || '부서장 공석'} · 부장(자동)
              </span>
              {delegates.map((a) => (
                <span key={a.id} className="text-[11px] bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {a.name}
                  <span className="text-purple-300">
                    {[a.can_vacation && '휴가', a.can_remote && '원격', a.can_holiday && '휴일'].filter(Boolean).join('·')}
                  </span>
                  {canManageThisDept && (
                    <button onClick={() => handleRemoveApprover(a.id)} className="text-purple-400 hover:text-red-500 inline-flex items-center"><X size={12} strokeWidth={2} /></button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderTeamDetail(team: TeamRow, department: DepartmentRow, division: DivisionRow, mobile = false) {
    const canManageThisDept = canManageDepartment(user.id, department.id, departments, divisions, hasTopAccess)
    const members = membersOfTeam(team.id)
    const lead = teamLeadOf(team.id)
    const delegates = approversOfDept(department.id)

    return (
      <div>
        {!mobile && (
          <button onClick={() => selectDepartment(department.id)} className="text-xs text-gray-300 dark:text-zinc-600 mb-1 hover:underline">
            {department.name}
          </button>
        )}
        <div className="flex items-start justify-between mb-1 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold dark:text-white truncate">{team.name}</h2>
            </div>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
              {lead ? `팀장 ${lead.name}` : '팀장 공석'} · 총 {members.length}명
            </p>
          </div>
          <div className="flex items-center gap-1.5 relative shrink-0">
            {canManageThisDept && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === `team-${team.id}` ? null : `team-${team.id}`) }}
                  className="text-gray-400 dark:text-zinc-500 px-1.5 py-1.5"
                >
                  ⋮
                </button>
                {menuOpenId === `team-${team.id}` && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-9 bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 rounded-lg shadow-lg py-1 w-32 z-10">
                    <button
                      onClick={() => { setMenuOpenId(null); openModal({ kind: 'assignTeamHead', teamId: team.id, departmentId: department.id }) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
                    >
                      팀장 변경
                    </button>
                    <button
                      onClick={() => { setMenuOpenId(null); handleDeleteTeam(team) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      팀 삭제
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <TabBar
          tabs={[
            { key: 'members', label: '구성원' },
            { key: 'permissions', label: '권한 관리' },
          ]}
          active={activeTab === 'structure' ? 'members' : activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
        />

        {activeTab !== 'permissions' && (
          <div className="space-y-1">
            {members.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-6">소속된 구성원이 없어요.</p>
            )}
            {members.map((m) => {
              const key = `team-${team.id}-${m.user_id}`
              return (
                <div key={key} className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-zinc-300">
                  <span>{m.name}</span>
                  {m.role === 'admin' && <span className="text-[10px] text-blue-500">팀장</span>}
                  {canManageThisDept && (
                    movingKey === key ? (
                      <MoveForm
                        departmentsForActor={departmentsForActor(division, department.id)}
                        moveTargetDept={moveTargetDept}
                        setMoveTargetDept={setMoveTargetDept}
                        moveTargetTeam={moveTargetTeam}
                        setMoveTargetTeam={setMoveTargetTeam}
                        teamsInDept={teamsInDept}
                        onConfirm={() => handleConfirmMove(m.user_id, team.id, department.id)}
                        onCancel={closeMove}
                      />
                    ) : (
                      <>
                        <button onClick={() => openMove(key, department.id, team.id)} className="text-xs text-blue-400 hover:underline">이동</button>
                        <button onClick={() => handleUnassignFromTeam(team.id, m.user_id)} className="text-xs text-red-400 hover:underline">내보내기</button>
                      </>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              결재권자 위임은 팀이 아니라 부서 단위로 관리돼요.{' '}
              <button onClick={() => selectDepartment(department.id)} className="text-blue-500 hover:underline">
                {department.name} 관리로 이동
              </button>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                {profileName(department.head_user_id) || '부서장 공석'} · 부장(자동)
              </span>
              {delegates.map((a) => (
                <span key={a.id} className="text-[11px] bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">
                  {a.name} {[a.can_vacation && '휴가', a.can_remote && '원격', a.can_holiday && '휴일'].filter(Boolean).join('·')}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28" onClick={() => setMenuOpenId(null)}>
      <div className="max-w-6xl mx-auto">
        {/* ---------- 헤더 ---------- */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">조직 관리</h1>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">회사 조직 구조와 구성원을 관리합니다.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:block relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-zinc-600 pointer-events-none"><Search size={14} strokeWidth={1.75} /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="부문, 부서, 팀 검색"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg w-64 dark:bg-zinc-800 dark:text-zinc-200"
              />
            </div>
            {hasTopAccess && (
              <button
                onClick={() => openModal({ kind: 'createDivision' })}
                className="md:hidden text-sm bg-blue-500 text-white px-3 py-1.5 rounded-lg whitespace-nowrap"
              >
                + 부문 생성
              </button>
            )}
          </div>
        </div>

        {/* ================= 데스크탑 레이아웃 ================= */}
        <div className="hidden md:flex bg-white dark:bg-zinc-800 rounded-xl shadow overflow-hidden" style={{ minHeight: '70vh' }}>
              {/* 사이드바 */}
              <aside className="w-72 border-r border-gray-100 dark:border-zinc-700 flex flex-col shrink-0 min-w-0 overflow-x-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
                  <p className="px-4 pt-2 pb-2 text-sm font-bold text-gray-600 dark:text-zinc-300 tracking-wide">조직 구조</p>
                  {divisions.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-gray-300 dark:text-zinc-600">등록된 부문이 없어요.</p>
                  )}
                  {visibleDivisions.map((division) => {
                    const isOpen = expandedDiv.has(division.id) || !!searchTerm
                    const isSelected = selected?.type === 'division' && selected.id === division.id
                    const deptList = departmentsOfDivision(division.id).filter((d) => !searchTerm || departmentMatchesSearch(d))
                    return (
                      <div key={division.id}>
                        <button
                          onClick={() => handleDivisionRowClick(division.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 mx-1 rounded-lg text-left ${isSelected ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-zinc-700/50'}`}
                        >
                          <span className="text-gray-400 dark:text-zinc-500 text-xs w-3 shrink-0">
                            {isOpen ? '▾' : '▸'}
                          </span>
                          <span
                            className={`flex-1 min-w-0 text-left text-sm truncate ${isSelected ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-700 dark:text-zinc-200 font-medium'}`}
                          >
                            {division.name}
                          </span>
                          <span className="text-[11px] text-gray-300 dark:text-zinc-600 shrink-0">
                            {headcountOfDivision(division.id)}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="pb-1.5 ml-6 pl-3 border-l-2 border-gray-100 dark:border-zinc-700 space-y-0.5 min-w-0 overflow-hidden">
                            {deptList.length === 0 && (
                              <p className="pr-3 py-1 text-[11px] text-gray-300 dark:text-zinc-600">등록된 부서가 없어요.</p>
                            )}
                            {deptList.map((department) => {
                              const isDeptSelected = selected?.type === 'department' && selected.id === department.id
                              const deptTeams = teamsInDept(department.id).filter((t) => !searchTerm || matchesTerm(t.name) || matchesTerm(department.name))
                              const isDeptOpen = deptTeams.length > 0 && (expandedDept.has(department.id) || !!searchTerm)
                              return (
                                <div key={department.id}>
                                  <button
                                    onClick={() => handleDepartmentRowClick(department.id)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[13px] min-w-0 ${isDeptSelected ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700/50'}`}
                                  >
                                    {deptTeams.length > 0 && (
                                      <span className="text-gray-400 dark:text-zinc-500 text-[10px] w-3 shrink-0">
                                        {isDeptOpen ? '▾' : '▸'}
                                      </span>
                                    )}
                                    <span className="flex-1 min-w-0 truncate">{department.name}</span>
                                    <span className="text-[11px] text-gray-300 dark:text-zinc-600 shrink-0">
                                      {headcountOfDept(department.id)}
                                    </span>
                                  </button>
                                  {isDeptOpen && (
                                    <div className="ml-3 pl-3 border-l-2 border-gray-50 dark:border-zinc-800 space-y-0.5 min-w-0 overflow-hidden">
                                      {deptTeams.map((team) => {
                                        const isTeamSelected = selected?.type === 'team' && selected.id === team.id
                                        return (
                                          <button
                                            key={team.id}
                                            onClick={() => selectTeam(team.id)}
                                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[12px] min-w-0 ${isTeamSelected ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700/50'}`}
                                          >
                                            <span className="flex-1 min-w-0 truncate">{team.name}</span>
                                            <span className="text-gray-300 dark:text-zinc-600 shrink-0">{membersOfTeam(team.id).length}</span>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {visibleDivisions.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-gray-300 dark:text-zinc-600">검색 결과가 없어요.</p>
                  )}

                  <div className="mt-3 pt-3 mx-1 border-t border-gray-100 dark:border-zinc-700">
                    <button
                      onClick={() => { setSelected({ type: 'unassigned' }); setMenuOpenId(null) }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left min-w-0 ${
                        selected?.type === 'unassigned' ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-zinc-700/50'
                      }`}
                    >
                      <span
                        className={`flex-1 min-w-0 truncate text-sm ${
                          selected?.type === 'unassigned' ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-700 dark:text-zinc-200 font-medium'
                        }`}
                      >
                        미지정 인원
                      </span>
                      {unassignedProfiles.length > 0 && (
                        <span className="text-xs text-gray-300 dark:text-zinc-600 shrink-0">
                          {unassignedProfiles.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                {hasTopAccess && (
                  <div className="p-3 border-t border-gray-100 dark:border-zinc-700">
                    <button
                      onClick={() => openModal({ kind: 'createDivision' })}
                      className="w-full text-sm bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 py-2 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
                    >
                      + 부문 생성
                    </button>
                  </div>
                )}
              </aside>

              {/* 메인 패널 */}
              <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-6" onClick={(e) => e.stopPropagation()}>
                {selected?.type === 'unassigned' && renderUnassignedDetail()}
                {selectedDivision && renderDivisionDetail(selectedDivision)}
                {selectedDepartment && parentDivisionOfSelectedDept && renderDepartmentDetail(selectedDepartment, parentDivisionOfSelectedDept)}
                {selectedTeam && parentDeptOfSelectedTeam && parentDivOfSelectedTeamDept && renderTeamDetail(selectedTeam, parentDeptOfSelectedTeam, parentDivOfSelectedTeamDept)}
                {!selected && (
                  <p className="text-sm text-gray-400 dark:text-zinc-500">왼쪽에서 부문, 부서 또는 미지정 인원을 선택해주세요.</p>
                )}
              </main>
        </div>

        {/* ================= 모바일 레이아웃 ================= */}
        <div className="md:hidden" onClick={(e) => e.stopPropagation()}>
              <select
                value={
                  selected?.type === 'unassigned'
                    ? '__unassigned__'
                    : selected?.type === 'team'
                    ? parentDivOfSelectedTeamDept?.id || ''
                    : selectedDepartment
                    ? selectedDepartment.division_id
                    : selectedDivision?.id || ''
                }
                onChange={(e) => {
                  if (e.target.value === '__unassigned__') setSelected({ type: 'unassigned' })
                  else selectDivision(e.target.value)
                }}
                className="w-full mb-3 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-medium dark:bg-zinc-800 dark:text-zinc-200"
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
                <option value="__unassigned__">미지정 인원 {unassignedProfiles.length > 0 ? `(${unassignedProfiles.length})` : ''}</option>
              </select>

              <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 overflow-x-hidden">
                {selected?.type === 'unassigned' ? (
                  renderUnassignedDetail()
                ) : selected?.type === 'team' && selectedTeam && parentDeptOfSelectedTeam && parentDivOfSelectedTeamDept ? (
                  <div>
                    <button
                      onClick={() => selectDepartment(parentDeptOfSelectedTeam.id)}
                      className="mb-2 text-xs text-gray-400 dark:text-zinc-500 flex items-center gap-1"
                    >
                      ‹ {parentDeptOfSelectedTeam.name}
                    </button>
                    {renderTeamDetail(selectedTeam, parentDeptOfSelectedTeam, parentDivOfSelectedTeamDept, true)}
                  </div>
                ) : selectedDepartment && parentDivisionOfSelectedDept ? (
                  <div>
                    <button
                      onClick={() => selectDivision(parentDivisionOfSelectedDept.id)}
                      className="mb-2 text-xs text-gray-400 dark:text-zinc-500 flex items-center gap-1"
                    >
                      ‹ {parentDivisionOfSelectedDept.name}
                    </button>
                    {renderDepartmentDetail(selectedDepartment, parentDivisionOfSelectedDept, true)}
                  </div>
                ) : (
                  selectedDivision && renderDivisionDetail(selectedDivision, true)
                )}
              </div>
        </div>
      </div>

      {/* ---------- 모달 ---------- */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 sm:p-6" onClick={closeModal}>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-5 dark:text-white">
              {modal.kind === 'createDivision' && '부문 생성'}
              {modal.kind === 'createDepartment' && '부서 생성'}
              {modal.kind === 'createTeam' && '팀 생성'}
              {modal.kind === 'assignDivisionHead' && '부문장 지정'}
              {modal.kind === 'assignDepartmentHead' && '부서장 지정'}
              {modal.kind === 'assignTeamHead' && '팀장 지정'}
              {modal.kind === 'addApprover' && '결재권자 위임'}
            </h3>

            <div className="space-y-4">
              {(modal.kind === 'createDivision' || modal.kind === 'createDepartment' || modal.kind === 'createTeam') && (
                <input
                  autoFocus
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  placeholder="이름 입력"
                  className="w-full border rounded-lg px-3.5 py-2.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                />
              )}

              {(modal.kind === 'assignDivisionHead' || modal.kind === 'assignDepartmentHead' || modal.kind === 'assignTeamHead') && (
                <select
                  value={modalUserId}
                  onChange={(e) => setModalUserId(e.target.value)}
                  className="w-full border rounded-lg px-3.5 py-2.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                >
                  <option value="">공석으로</option>
                  {allProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}

              {modal.kind === 'addApprover' && (
                <>
                  <select
                    value={modalUserId}
                    onChange={(e) => setModalUserId(e.target.value)}
                    className="w-full border rounded-lg px-3.5 py-2.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  >
                    <option value="">위임할 사람 선택</option>
                    {allProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2.5">어떤 유형을 위임할까요?</p>
                    <div className="flex gap-4">
                      {[
                        { key: 'can_vacation', label: '휴가' },
                        { key: 'can_remote', label: '원격근무' },
                        { key: 'can_holiday', label: '휴일근무' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-1.5 text-sm dark:text-zinc-200">
                          <input
                            type="checkbox"
                            checked={(modalChecks as any)[key]}
                            onChange={(e) => setModalChecks((s) => ({ ...s, [key]: e.target.checked }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {message && <p className="text-xs text-red-500">{message}</p>}
            </div>

            <div className="flex gap-3 mt-7">
              <button onClick={closeModal} className="flex-1 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 py-2.5 rounded-lg text-sm font-medium">취소</button>
              <button onClick={submitModal} className="flex-1 bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex gap-4 border-b border-gray-200 dark:border-zinc-700 mb-4">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px transition ${
            active === t.key
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function MoveForm({
  departmentsForActor,
  moveTargetDept,
  setMoveTargetDept,
  moveTargetTeam,
  setMoveTargetTeam,
  teamsInDept,
  onConfirm,
  onCancel,
}: {
  departmentsForActor: DepartmentRow[]
  moveTargetDept: string
  setMoveTargetDept: (v: string) => void
  moveTargetTeam: string
  setMoveTargetTeam: (v: string) => void
  teamsInDept: (departmentId: string) => { id: string; name: string }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const availableTeams = moveTargetDept ? teamsInDept(moveTargetDept) : []
  return (
    <span className="inline-flex flex-wrap items-center gap-1 max-w-full">
      <select
        value={moveTargetDept}
        onChange={(e) => { setMoveTargetDept(e.target.value); setMoveTargetTeam('') }}
        className="border rounded-lg px-1.5 py-0.5 text-[11px] dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 max-w-[40vw] sm:max-w-[160px]"
      >
        {departmentsForActor.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select
        value={moveTargetTeam}
        onChange={(e) => setMoveTargetTeam(e.target.value)}
        className="border rounded-lg px-1.5 py-0.5 text-[11px] dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 max-w-[40vw] sm:max-w-[160px]"
      >
        <option value="">부서 직속</option>
        {availableTeams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button onClick={onConfirm} className="text-green-500 font-medium shrink-0">확인</button>
      <button onClick={onCancel} className="text-gray-400 shrink-0">취소</button>
    </span>
  )
}

/**
 * 순서변경 모드에서만 쓰는 드래그 앤 드롭 리스트.
 * disabled=false일 때만 실제로 draggable이 걸리고, 그 외에는 평범한 목록으로 렌더링된다.
 * 다른 그룹과 섞이지 않도록 항상 "하나의 그룹" 단위로만 사용한다 (예: 특정 부서 직속 인원, 특정 팀 인원).
 */
function DragList<T>({
  items,
  getKey,
  renderItem,
  onReorder,
  disabled,
}: {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  onReorder: (newItems: T[]) => void
  disabled?: boolean
}) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  if (disabled) {
    return (
      <>
        {items.map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </>
    )
  }

  const handleDrop = (targetKey: string) => {
    setOverKey(null)
    if (!dragKey || dragKey === targetKey) return
    const fromIdx = items.findIndex((i) => getKey(i) === dragKey)
    const toIdx = items.findIndex((i) => getKey(i) === targetKey)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...items]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onReorder(next)
  }

  return (
    <>
      {items.map((item) => {
        const key = getKey(item)
        return (
          <div
            key={key}
            draggable
            onDragStart={() => setDragKey(key)}
            onDragOver={(e) => { e.preventDefault(); if (overKey !== key) setOverKey(key) }}
            onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
            onDrop={(e) => { e.preventDefault(); handleDrop(key) }}
            onDragEnd={() => { setDragKey(null); setOverKey(null) }}
            className={`cursor-grab active:cursor-grabbing rounded-lg transition ${
              dragKey === key ? 'opacity-40' : ''
            } ${overKey === key && dragKey !== key ? 'ring-2 ring-blue-300 dark:ring-blue-600' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-gray-300 dark:text-zinc-600 select-none" aria-hidden>⠿</span>
              <div className="flex-1 min-w-0">{renderItem(item)}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}
