'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import dayjs from 'dayjs'
import { usePushSubscription } from '../hooks/usePushSubscription'
import ApprovalList from '../components/approval/ApprovalList'
import ApprovalDetailModal from '../components/approval/ApprovalDetailModal'
import RequestModal from '../components/approval/RequestModal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import OrgScopeSelect, { OrgScopeOption } from '../components/ui/OrgScopeSelect'
import { fetchDivisionMembers, fetchDepartmentScope } from '../lib/orgOrder'

const CC_STORAGE_KEY = 'approval_cc_history'

// "내 소속" = 내가 속한 팀, 또는 팀 없이 부서에 직접 소속된 경우 그 부서
interface MySource {
  key: string // `team:<teamId>` 또는 `dept:<departmentId>` 또는 `division:<divisionId>`
  label: string
  teamId: string | null
  departmentId: string
  divisionId?: string // "부문 전용 소속"(겸임 부서 없이 부문장 역할만)일 때만 채워진다
}

// 결재 목록 부서 필터 옵션 (req 4).
// 상위 조직부터 이어붙인 경로 형태의 라벨(대시보드의 OrgScopeSelect와 동일한 방식)로,
// 총괄 관리자/마스터는 "전체" + 부문 단위, 부문장은 "부문 전체" + 부서 단위까지 노출한다.
// 그 아래(부서장/팀장/팀원)는 필터 없이 항상 자기 부서 범위로 고정된다.
// 여러 조직장을 겸임 중이면 각 역할에서 나오는 옵션을 모두 합쳐서 보여준다.
interface ScopeOption extends OrgScopeOption {
  /** 이 옵션을 선택했을 때 조회할 department_id 목록. null이면 부서 제한 없음(전사 전체). */
  departmentIds: string[] | null
}

function getCcHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(CC_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveCcHistory(emails: string[]) {
  if (typeof window === 'undefined') return
  const existing = getCcHistory()
  const merged = Array.from(new Set([...existing, ...emails])).slice(0, 30)
  localStorage.setItem(CC_STORAGE_KEY, JSON.stringify(merged))
}

function ApprovalPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<any>(null)
  // window.confirm 대신 쓰는 확인창 상태. 액션마다 별도 state를 두지 않고
  // 제목/설명/실행할 함수만 채워 넣는 방식으로 재사용한다.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    description?: string
    confirmLabel?: string
    tone?: 'danger' | 'normal'
    onConfirm: () => void
  } | null>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState<string>(
    dayjs().startOf('month').format('YYYY-MM-DD')
  )
  const [dateRangeEnd, setDateRangeEnd] = useState<string>(
    dayjs().endOf('month').format('YYYY-MM-DD')
  )
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [step, setStep] = useState(1)
  const [requestType, setRequestType] = useState<string>('')
  const [dateGroups, setDateGroups] = useState<{ dates: string[]; vacationType: string }[]>([])
  const [selectedApprover, setSelectedApprover] = useState<string>('')
  const [selectedSourceKey, setSelectedSourceKey] = useState<string>('')
  const [approvers, setApprovers] = useState<any[]>([])
  const [mySources, setMySources] = useState<MySource[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [memo, setMemo] = useState('')
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)

  // 결재 목록 열람 범위 (req 4) — 로그인 시 한 번 계산해서 고정한다 (조직상 위치가 바뀌면 새로고침 필요).
  // opts가 비어있으면(부서장 이상 겸임 없음) 필터 없이 baseDepartmentIds로 고정 조회한다.
  const [baseDepartmentIds, setBaseDepartmentIds] = useState<string[]>([])
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([])
  const [selectedScope, setSelectedScope] = useState<ScopeOption | null>(null)

  // CC 관련
  const [ccInput, setCcInput] = useState('')
  const [ccList, setCcList] = useState<string[]>([])
  const [existingCcList, setExistingCcList] = useState<string[]>([])
  const [ccSuggestions, setCcSuggestions] = useState<string[]>([])
  const [showCcSuggestions, setShowCcSuggestions] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      const scope = await initViewerScope(user.id)
      fetchRequests(user.id, dateRangeStart, dateRangeEnd, scope)
      fetchMySources(user.id)
    }
    getUser()
  }, [])

  // 결재 페이지 열람 범위 계산 (req 4).
  // - 총괄 관리자/마스터: 전사 전체가 기본, 부문 단위로 좁혀보는 필터 제공.
  // - 부문장: 부문 전체가 기본, 부서 단위로 좁혀보는 필터 제공.
  // - 그 아래(부서장/팀장/팀원): 필터 없이 자기 부서 범위로 고정.
  // 한 사람이 여러 조직장을 겸임할 수 있으므로(예: 부문장이면서 다른 부서의 부서장), 역할별
  // 옵션을 배타적으로 고르지 않고 해당되는 역할을 모두 합쳐서 하나의 드롭다운에 담는다.
  const initViewerScope = async (
    userId: string
  ): Promise<{ scopeOptions: ScopeOption[]; selectedScope: ScopeOption | null; baseDepartmentIds: string[] }> => {
    const [
      { data: profile },
      { data: generalAdminRow },
      { data: headDivs },
      { data: headDepts },
      { data: myTeamData },
      { data: myDeptDirectData },
    ] = await Promise.all([
      supabase.from('profiles').select('is_master').eq('id', userId).single(),
      supabase.from('general_admins').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('divisions').select('id, name').eq('head_user_id', userId),
      supabase
        .from('departments')
        .select('id, name, division_id, divisions(name)')
        .eq('head_user_id', userId),
      supabase.from('team_members').select('teams(department_id)').eq('user_id', userId),
      supabase.from('department_memberships').select('department_id').eq('user_id', userId),
    ])
    const hasTopAccess = !!profile?.is_master || !!generalAdminRow

    // 팀/부서직속 소속으로부터 계산한 "내 기본 부서 범위" — 헤드 역할이 전혀 없을 때 그대로
    // 필터 없는 고정 범위로 쓰이고, 헤드 역할이 있을 때도 드롭다운 옵션에 함께 포함된다.
    const myDeptIds = Array.from(
      new Set([
        ...(myTeamData || []).map((t: any) => t.teams?.department_id).filter(Boolean),
        ...(myDeptDirectData || []).map((d: any) => d.department_id),
        ...(headDepts || []).map((d: any) => d.id),
      ])
    ) as string[]

    const opts: ScopeOption[] = []
    const seen = new Set<string>()
    const addOpt = (opt: ScopeOption) => {
      const key = `${opt.level}:${opt.entityId}`
      if (seen.has(key)) return
      seen.add(key)
      opts.push(opt)
    }

    if (hasTopAccess) {
      // 총괄 관리자/마스터: 전사 전체 + 산하 부문들
      const [{ data: allDivs }, { data: allDepts }] = await Promise.all([
        supabase.from('divisions').select('id, name').order('display_order', { ascending: true }),
        supabase.from('departments').select('id, division_id').order('display_order', { ascending: true }),
      ])
      addOpt({ level: 'company', entityId: '', label: '전체', departmentIds: null })
      ;(allDivs || []).forEach((div: any) => {
        const deptIds = (allDepts || [])
          .filter((d: any) => d.division_id === div.id)
          .map((d: any) => d.id)
        addOpt({ level: 'division', entityId: div.id, label: div.name, departmentIds: deptIds })
      })
    }

    if ((headDivs?.length ?? 0) > 0) {
      // 부문장: 부문 전체 + 그 산하 부서들
      for (const div of headDivs || []) {
        const { data: depts } = await supabase
          .from('departments')
          .select('id, name')
          .eq('division_id', div.id)
          .order('display_order', { ascending: true })
        const deptIds = (depts || []).map((d: any) => d.id)
        addOpt({ level: 'division', entityId: div.id, label: div.name, departmentIds: deptIds })
        ;(depts || []).forEach((dept: any) => {
          addOpt({
            level: 'department',
            entityId: dept.id,
            label: `${div.name} > ${dept.name}`,
            departmentIds: [dept.id],
          })
        })
      }
    }

    if ((headDepts?.length ?? 0) > 0) {
      // 부서장: 부서 단위 (자신이 부서장인 부서)
      for (const dept of headDepts || []) {
        const divName = (dept as any).divisions?.name
        const label = divName ? `${divName} > ${dept.name}` : dept.name
        addOpt({ level: 'department', entityId: dept.id, label, departmentIds: [dept.id] })
      }
    }

    // 헤드 역할이 하나라도 있으면(총괄 관리자 포함), 내가 실제로 소속된 부서도 놓치지 않도록
    // 옵션에 함께 넣는다 (겸임 중인 역할과 별개로 본인이 속한 부서가 다를 수 있으므로).
    if (opts.length > 0 && myDeptIds.length > 0) {
      const { data: myDepts } = await supabase
        .from('departments')
        .select('id, name, division_id, divisions(name)')
        .in('id', myDeptIds)
      ;(myDepts || []).forEach((dept: any) => {
        const divName = dept.divisions?.name
        const label = divName ? `${divName} > ${dept.name}` : dept.name
        addOpt({ level: 'department', entityId: dept.id, label, departmentIds: [dept.id] })
      })
    }

    if (opts.length === 0) {
      // 조직장 겸임이 전혀 없으면: 필터 없이 자기 부서 범위로 고정
      setScopeOptions([])
      setSelectedScope(null)
      setBaseDepartmentIds(myDeptIds)
      return { scopeOptions: [], selectedScope: null, baseDepartmentIds: myDeptIds }
    }

    setScopeOptions(opts)
    setSelectedScope(opts[0])
    setBaseDepartmentIds(myDeptIds)
    return { scopeOptions: opts, selectedScope: opts[0], baseDepartmentIds: myDeptIds }
  }

  // 현재 필터 선택 기준으로 조회할 department_id / division_id 목록을 계산한다.
  // deptIds가 null이면 "제한 없음"(회사 전체를 그대로 조회)을 의미한다.
  // divisionIds는 "부문 전용 소속" 요청(겸임 부서 없이 부문장 역할만 있을 때 올린 요청,
  // department_id가 없다)을 부문 단위로 구분해서 보여주기 위한 목록이다. 부문 스코프를
  // 선택했을 때만 채워지고, 부서 단위 스코프에서는 비워서(=제외) 그 부서보다 상위인
  // 부문장 자신의 요청까지 섞여 보이지 않게 한다.
  // includeApproverBypass: 내가 결재권자인 건 스코프와 무관하게 항상 보여줄지 여부.
  // - 필터 UI 자체가 없는 일반 사용자(opts.length===0, 예: 특정 부서만 위임받은 결재권자)는
  //   좁혀볼 방법이 없으니 항상 켠다(기존 동작 유지).
  // - 필터 UI가 있는 조직장/총괄 관리자가 특정 부문·부서를 선택했을 때는 끈다 — 안 그러면
  //   총괄 관리자는 모든 부문장 요청의 결재자라서, 어떤 부문을 골라도 다른 부문 요청까지
  //   섞여 보여 필터가 무의미해진다. "전체"를 고르면(deptIds===null) 이 값과 무관하게 전부 보인다.
  const computeScopeIdsForQuery = (
    opts: ScopeOption[] = scopeOptions,
    selected: ScopeOption | null = selectedScope,
    baseIds: string[] = baseDepartmentIds
  ): { deptIds: string[] | null; divisionIds: string[]; includeApproverBypass: boolean } => {
    if (opts.length === 0) return { deptIds: baseIds, divisionIds: [], includeApproverBypass: true }
    if (!selected) return { deptIds: baseIds, divisionIds: [], includeApproverBypass: true }
    return {
      deptIds: selected.departmentIds,
      divisionIds: selected.level === 'division' ? [selected.entityId] : [],
      includeApproverBypass: false,
    }
  }

  // 실제 결재 목록 조회. deptIds === null이면 부서 제한 없이(회사 전체) 조회한다.
  const fetchRequestsWithDeptIds = async (
    userId: string,
    rangeStart: string,
    rangeEnd: string,
    deptIds: string[] | null,
    divisionIds: string[] = [],
    includeApproverBypass: boolean = true
  ) => {
    let query = supabase
      .from('approval_requests')
      .select(
        `*, requester:profiles!approval_requests_requester_id_fkey(name,email), approver:profiles!approval_requests_approver_id_fkey(name,email), teams(name), departments(name), divisions(name)`
      )
      .gte('created_at', dayjs(rangeStart).startOf('day').toISOString())
      .lte('created_at', dayjs(rangeEnd).endOf('day').toISOString())
      .order('created_at', { ascending: false })

    if (deptIds !== null) {
      // 내가 올린 요청은 스코프와 무관하게 항상 보인다.
      const orConditions = [`requester_id.eq.${userId}`]
      if (includeApproverBypass) orConditions.push(`approver_id.eq.${userId}`)
      if (deptIds.length > 0) orConditions.push(`department_id.in.(${deptIds.join(',')})`)
      if (divisionIds.length > 0) orConditions.push(`division_id.in.(${divisionIds.join(',')})`)
      query = query.or(orConditions.join(','))
    }
    // deptIds === null (회사 전체, 부문 필터 미선택)인 경우 별도 조건 없이 기간 내 전체 조회

    const { data } = await query
    if (data) setRequests(data)
  }

  const fetchRequests = async (
    userId: string,
    rangeStart: string,
    rangeEnd: string,
    scopeOverride?: {
      scopeOptions: ScopeOption[]
      selectedScope: ScopeOption | null
      baseDepartmentIds: string[]
    }
  ) => {
    const { deptIds, divisionIds, includeApproverBypass } = scopeOverride
      ? computeScopeIdsForQuery(
          scopeOverride.scopeOptions,
          scopeOverride.selectedScope,
          scopeOverride.baseDepartmentIds
        )
      : computeScopeIdsForQuery()
    await fetchRequestsWithDeptIds(userId, rangeStart, rangeEnd, deptIds, divisionIds, includeApproverBypass)
  }

  const handleScopeChange = (opt: OrgScopeOption) => {
    const next = opt as ScopeOption
    setSelectedScope(next)
    if (!user) return
    const { deptIds, divisionIds, includeApproverBypass } = computeScopeIdsForQuery(
      scopeOptions,
      next,
      baseDepartmentIds
    )
    fetchRequestsWithDeptIds(user.id, dateRangeStart, dateRangeEnd, deptIds, divisionIds, includeApproverBypass)
  }

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
    if (user) {
      const { deptIds, divisionIds, includeApproverBypass } = computeScopeIdsForQuery()
      fetchRequestsWithDeptIds(user.id, start, end, deptIds, divisionIds, includeApproverBypass)
    }
  }

  // 내 소속(팀 또는 부서 직접 소속) 목록.
  // 겸직 중이면(예: 팀장이면서 그 팀이 속한 부서의 부서장, 또는 부서장이면서 그 부서가
  // 속한 부문의 부문장) 결재는 항상 더 상위 직책의 이름으로 올라가야 하므로, 팀/부서
  // 소속을 그대로 노출하지 않고 내가 겸직 중인 상위 조직이 있으면 그 조직으로 치환한다.
  const fetchMySources = async (userId: string): Promise<MySource[]> => {
    const [{ data: teamData }, { data: deptData }] = await Promise.all([
      supabase
        .from('team_members')
        .select('team_id, teams(id, name, department_id)')
        .eq('user_id', userId),
      supabase
        .from('department_memberships')
        .select('department_id, departments(id, name)')
        .eq('user_id', userId),
    ])

    // 관련된 부서들의 head_user_id/division 정보를 한 번에 조회해서 겸직(상위 조직장) 여부를 판단한다.
    const deptIds = Array.from(
      new Set([
        ...(teamData || []).filter((t: any) => t.teams).map((t: any) => t.teams.department_id),
        ...(deptData || []).filter((d: any) => d.departments).map((d: any) => d.department_id),
      ])
    )
    const { data: deptInfoRows } =
      deptIds.length > 0
        ? await supabase
            .from('departments')
            .select('id, name, head_user_id, division_id, divisions(id, name, head_user_id)')
            .in('id', deptIds)
        : { data: [] as any[] }
    const deptInfoMap = new Map((deptInfoRows || []).map((d: any) => [d.id, d]))

    // 부서 id 기준으로 "이 부서 소속으로 요청하면 실제로는 어느 조직 이름으로 올라가야
    // 하는지"를 판단한다: 부문장을 겸직 중이면 부문, 부서장을 겸직 중이면 부서, 둘 다
    // 아니면 그대로 부서.
    const resolveByDepartment = (deptId: string, fallbackName: string): MySource => {
      const info = deptInfoMap.get(deptId)
      const division = info?.divisions
      if (division?.head_user_id === userId) {
        return {
          key: `division:${division.id}`,
          label: division.name,
          teamId: null,
          departmentId: '',
          divisionId: division.id as string,
        }
      }
      return {
        key: `dept:${deptId}`,
        label: info?.name || fallbackName,
        teamId: null,
        departmentId: deptId,
      }
    }

    // key로 중복 제거하며 최종 소속 목록을 만든다(겸직 치환으로 여러 팀/부서가 같은
    // 상위 조직 하나로 합쳐질 수 있으므로).
    const sourceMap = new Map<string, MySource>()

    ;(teamData || [])
      .filter((t: any) => t.teams)
      .forEach((t: any) => {
        const deptId = t.teams.department_id as string
        const info = deptInfoMap.get(deptId)
        const division = info?.divisions
        let resolved: MySource
        if (division?.head_user_id === userId) {
          resolved = {
            key: `division:${division.id}`,
            label: division.name,
            teamId: null,
            departmentId: '',
            divisionId: division.id as string,
          }
        } else if (info?.head_user_id === userId) {
          resolved = {
            key: `dept:${deptId}`,
            label: info.name,
            teamId: null,
            departmentId: deptId,
          }
        } else {
          resolved = {
            key: `team:${t.team_id}`,
            label: t.teams.name,
            teamId: t.team_id as string,
            departmentId: deptId,
          }
        }
        sourceMap.set(resolved.key, resolved)
      })

    ;(deptData || [])
      .filter((d: any) => d.departments)
      .forEach((d: any) => {
        const resolved = resolveByDepartment(d.department_id, d.departments.name)
        sourceMap.set(resolved.key, resolved)
      })

    const sources: MySource[] = Array.from(sourceMap.values())

    // 팀/부서 소속이 하나도 없고 부문장 역할만 있는 경우("소속 없음"으로 보이던 케이스),
    // 부문 자체를 소속으로 노출한다. departmentId는 빈 문자열로 두고
    // fetchApproversForSource에서 이를 "부문 전용 소속"의 표식으로 쓴다.
    if (sources.length === 0) {
      const { data: headDivisions } = await supabase
        .from('divisions')
        .select('id, name')
        .eq('head_user_id', userId)
      ;(headDivisions || []).forEach((d: any) => {
        sources.push({
          key: `division:${d.id}`,
          label: d.name,
          teamId: null,
          departmentId: '',
          divisionId: d.id as string,
        })
      })
    }

    setMySources(sources)
    return sources
  }

  // 총괄 관리자 프로필 목록. general_admins.user_id와 created_by가 둘 다 profiles(id)를
  // 참조해서 `profiles(...)` 중첩 조인은 PostgREST 입장에서 어느 FK를 쓸지 모호해
  // 실패한다(조용히 빈 배열이 됨). user_id만 먼저 받고 profiles를 별도로 조회한다.
  const fetchGeneralAdminCandidates = async (): Promise<Map<string, any>> => {
    const result = new Map<string, any>()
    const { data: generalAdmins } = await supabase.from('general_admins').select('user_id')
    const adminIds = (generalAdmins || []).map((g: any) => g.user_id)
    if (adminIds.length === 0) return result
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', adminIds)
    ;(adminProfiles || []).forEach((p: any) => {
      result.set(p.id, { user_id: p.id, profiles: p })
    })
    return result
  }

  // 결재권자 후보 산정 (req 1, req 3)
  // - 팀/부서/부문 각 단계는 "자동 결재권자(장) + 위임된 결재권자(유형별 체크)"로 구성된다.
  // - 부문장은 부문 산하 모든 부서에 대한 결재권을 갖는다. 부서장이 스스로 결재를 올릴 때는
  //   그 결재가 부문장에게 올라간다(부서장은 자기 부서 단계의 결재권자가 될 수 없으므로 제외).
  // - 신청자보다 하위 조직 단계의 결재권자는 후보에서 숨긴다: 신청자가 부서장이면 팀/부서 단계를
  //   숨기고 부문 단계만 보여주고, 신청자가 팀장이면 팀 단계를 숨기고 부서/부문 단계를 보여준다.
  const fetchApproversForSource = async (source: MySource, type: string) => {
    setSelectedSourceKey(source.key)
    setSelectedApprover('')

    const candidates = new Map<string, any>()
    const typeColumn =
      type === 'vacation' ? 'can_vacation' : type === 'remote' ? 'can_remote' : 'can_holiday'

    // 부문 자체가 소속인 경우(팀/부서 없이 부문장 역할만) — 부서 조회 없이 바로
    // 총괄 관리자만 후보로 채운다.
    if (!source.departmentId) {
      const adminCandidates = await fetchGeneralAdminCandidates()
      adminCandidates.delete(user.id)
      const sortedAdmins = Array.from(adminCandidates.values()).sort((a, b) =>
        (a.profiles?.name || '').localeCompare(b.profiles?.name || '')
      )
      setApprovers(sortedAdmins)
      return
    }

    const { data: dept } = await supabase
      .from('departments')
      .select('id, head_user_id, division_id, divisions(id, head_user_id)')
      .eq('id', source.departmentId)
      .single()

    const isDeptHeadRequester = !!dept?.head_user_id && dept.head_user_id === user.id
    const divisionHeadId = (dept as any)?.divisions?.head_user_id ?? null

    // 부문장인지는 "이 요청이 걸린 부서가 속한 부문"만 보지 않고 전사 어느 부문이든
    // 내가 부문장이면 true로 잡는다. 부문장이 자기 부문과 무관한 부서의 부서장을
    // 겸임하거나, 부서-부문 매핑이 이 부서 기준으로는 안 맞는 경우에도 항상 총괄
    // 관리자에게만 결재가 올라가야 하기 때문이다.
    const { data: myDivisionHeadRows } = await supabase
      .from('divisions')
      .select('id')
      .eq('head_user_id', user.id)
      .limit(1)
    const isDivisionHeadRequester = !!myDivisionHeadRows && myDivisionHeadRows.length > 0

    let isTeamLeaderRequester = false
    if (source.teamId) {
      const { data: myMembership } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', source.teamId)
        .eq('user_id', user.id)
        .maybeSingle()
      isTeamLeaderRequester = myMembership?.role === 'admin'
    }

    // 부문장 본인이 신청자면 결재는 총괄 관리자에게만 올라간다. 본인보다 하위 조직(팀/부서)의
    // 조직장·위임 결재권자는 후보에서 전부 제외한다.
    if (isDivisionHeadRequester) {
      const adminCandidates = await fetchGeneralAdminCandidates()
      adminCandidates.forEach((v, k) => candidates.set(k, v))
    } else {
      // 팀 단계: 신청자가 이 팀의 팀장이거나 부서장이면(자신보다 하위/동일 단계) 숨긴다.
      if (source.teamId && !isTeamLeaderRequester && !isDeptHeadRequester) {
        const { data: leads } = await supabase
          .from('team_members')
          .select('user_id, profiles(id, name, email)')
          .eq('team_id', source.teamId)
          .eq('role', 'admin')
        ;(leads || []).forEach((l: any) => {
          if (l.profiles) candidates.set(l.user_id, l)
        })

        const { data: teamDelegates } = await supabase
          .from('team_approvers')
          .select(`user_id, ${typeColumn}, profiles(id, name, email)`)
          .eq('team_id', source.teamId)
        ;(teamDelegates || []).forEach((d: any) => {
          if (d[typeColumn] && d.profiles)
            candidates.set(d.user_id, { user_id: d.user_id, profiles: d.profiles })
        })
      }

      // 부서 단계: 신청자 본인이 그 부서의 부서장이면 자기 자신이 결재권자가 될 수 없으므로 숨긴다.
      if (!isDeptHeadRequester) {
        if (dept?.head_user_id) {
          const { data: headProfile } = await supabase
            .from('profiles')
            .select('id, name, email')
            .eq('id', dept.head_user_id)
            .single()
          if (headProfile)
            candidates.set(headProfile.id, { user_id: headProfile.id, profiles: headProfile })
        }

        const { data: delegates } = await supabase
          .from('department_approvers')
          .select(`user_id, ${typeColumn}, profiles(id, name, email)`)
          .eq('department_id', source.departmentId)
        ;(delegates || []).forEach((d: any) => {
          if (d[typeColumn] && d.profiles)
            candidates.set(d.user_id, { user_id: d.user_id, profiles: d.profiles })
        })
      }

      // 부문 단계: 부문장은 산하 모든 부서의 결재권을 가진다. (이 분기는 신청자가 부문장이
      // 아닐 때만 실행되므로 자기 자신이 후보로 잡힐 일은 없다.)
      if (dept?.division_id) {
        if (divisionHeadId) {
          const { data: headProfile } = await supabase
            .from('profiles')
            .select('id, name, email')
            .eq('id', divisionHeadId)
            .single()
          if (headProfile)
            candidates.set(headProfile.id, { user_id: headProfile.id, profiles: headProfile })
        }

        const { data: divisionDelegates } = await supabase
          .from('division_approvers')
          .select(`user_id, ${typeColumn}, profiles(id, name, email)`)
          .eq('division_id', dept.division_id)
        ;(divisionDelegates || []).forEach((d: any) => {
          if (d[typeColumn] && d.profiles)
            candidates.set(d.user_id, { user_id: d.user_id, profiles: d.profiles })
        })
      }
    }

    candidates.delete(user.id)

    // 결재권자 표시 순서를 조직관리에서 정한 구성원 순서(부문 → 부서 → 팀, 각 리더가 최상단)와
    // 동일하게 맞춘다. 부문이 없는 부서는 부서 범위 순서를 기준으로 삼는다. 총괄 관리자는 조직도
    // 순서 개념이 없으므로 이름순으로 정렬한다.
    const orgOrderList = isDivisionHeadRequester
      ? []
      : dept?.division_id
        ? await fetchDivisionMembers(dept.division_id)
        : (await fetchDepartmentScope(source.departmentId)).allMembers
    const orderIndex = new Map(orgOrderList.map((m, i) => [m.user_id, i]))
    const sortedApprovers = Array.from(candidates.values()).sort((a, b) => {
      const ai = orderIndex.get(a.user_id) ?? Infinity
      const bi = orderIndex.get(b.user_id) ?? Infinity
      if (ai !== bi) return ai - bi
      return (a.profiles?.name || '').localeCompare(b.profiles?.name || '')
    })
    setApprovers(sortedApprovers)
  }

  // 다중 소속일 때 사용자가 드롭다운에서 소속을 바꾼 경우
  const handleSourceChange = (key: string) => {
    const source = mySources.find((s) => s.key === key)
    if (source) fetchApproversForSource(source, requestType)
    else {
      setSelectedSourceKey('')
      setApprovers([])
    }
  }

  // step2 진입 시(또는 유형을 바꿔 다시 진입 시) 소속이 하나뿐이면 자동으로, 이미 골라둔 소속이 있으면 새 유형 기준으로 재조회
  useEffect(() => {
    if (step !== 2 || !requestType || editingRequestId) return
    if (mySources.length === 1) {
      fetchApproversForSource(mySources[0], requestType)
    } else if (selectedSourceKey) {
      const source = mySources.find((s) => s.key === selectedSourceKey)
      if (source) fetchApproversForSource(source, requestType)
    }
  }, [step, requestType])

  const handleCcInput = (val: string) => {
    setCcInput(val)
    if (val.length > 0) {
      const history = getCcHistory()
      const filtered = history.filter(
        (e) => e.toLowerCase().includes(val.toLowerCase()) && !ccList.includes(e)
      )
      setCcSuggestions(filtered)
      setShowCcSuggestions(filtered.length > 0)
    } else {
      setShowCcSuggestions(false)
    }
  }

  const addCcEmail = (email: string) => {
    const trimmed = email.trim()
    if (!trimmed || ccList.includes(trimmed)) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return
    setCcList([...ccList, trimmed])
    setCcInput('')
    setShowCcSuggestions(false)
  }

  const removeCc = (email: string) => setCcList(ccList.filter((e) => e !== email))

  const handleSubmitRequest = async () => {
    const selectedSource = mySources.find((s) => s.key === selectedSourceKey)
    if (!requestType || !selectedApprover || !selectedSource) {
      setMessage('모든 항목을 입력해주세요.')
      return
    }
    // 부문 전용 소속(팀/부서 없이 부문장 역할만)은 departmentId를 빈 문자열로 표시하는데,
    // DB의 department_id 컬럼은 uuid 타입이라 빈 문자열을 그대로 넣으면 에러가 난다.
    const departmentIdForInsert = selectedSource.departmentId || null
    const divisionIdForInsert = selectedSource.divisionId || null
    if (dateGroups.length === 0) {
      setMessage('날짜를 추가해주세요.')
      return
    }
    const flattenedEntries = dateGroups.flatMap((group) =>
      group.dates.map((date) => ({ date, vacationType: group.vacationType }))
    )
    if (flattenedEntries.length === 0) {
      setMessage('날짜를 선택해주세요.')
      return
    }
    if (requestType === 'holiday' && !memo.trim()) {
      setMessage('출근 사유를 입력해주세요.')
      return
    }

    setLoading(true)
    setMessage('')

    if (editingRequestId) {
      // 수정: pending 상태의 내 요청 내용만 갱신. 알림/메일은 보내지 않음
      // (나중에 승인될 때 이미 최신 내용으로 메일이 나가므로 별도 연동 불필요)
      const { error } = await supabase
        .from('approval_requests')
        .update({
          approver_id: selectedApprover,
          team_id: selectedSource.teamId,
          department_id: departmentIdForInsert,
          division_id: divisionIdForInsert,
          date: flattenedEntries[0].date,
          dates: flattenedEntries.map((e) => e.date),
          date_entries: flattenedEntries,
          memo: requestType === 'vacation' || requestType === 'holiday' ? memo : null,
          cc_emails: ccList.length > 0 ? ccList : null,
        })
        .eq('id', editingRequestId)
        .eq('requester_id', user.id)
        .eq('status', 'pending')

      if (error) {
        setMessage('수정 실패: ' + error.message)
      } else {
        resetModal()
        fetchRequests(user.id, dateRangeStart, dateRangeEnd)
      }
      setLoading(false)
      return
    }

    const { data: inserted, error } = await supabase
      .from('approval_requests')
      .insert({
        requester_id: user.id,
        approver_id: selectedApprover,
        team_id: selectedSource.teamId,
        department_id: departmentIdForInsert,
        division_id: divisionIdForInsert,
        type: requestType,
        date: flattenedEntries[0].date,
        dates: flattenedEntries.map((e) => e.date),
        date_entries: flattenedEntries,
        memo: requestType === 'vacation' || requestType === 'holiday' ? memo : null,
        cc_emails: ccList.length > 0 ? ccList : null,
      })
      .select('id')
      .single()

    if (error) {
      setMessage('요청 실패: ' + error.message)
    } else {
      const approverInfo = approvers.find((a) => a.user_id === selectedApprover)
      if (approverInfo?.profiles?.email) {
        const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
        const requesterName = myProfile.data?.name || user.email?.split('@')[0] || '팀원'
        const approverName = approverInfo.profiles.name || approverInfo.profiles.email.split('@')[0]

        fetch('/api/notify-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailType: 'request',
            approvalId: inserted?.id,
            approverId: selectedApprover,
            approverEmail: approverInfo.profiles.email,
            approverName,
            requesterName,
            type: requestType,
            dateEntries: flattenedEntries,
            memo: requestType === 'vacation' || requestType === 'holiday' ? memo : undefined,
            ccEmails: ccList,
          }),
        }).catch((e) => console.error('알림 메일 발송 실패:', e))

        if (ccList.length > 0) saveCcHistory(ccList)
      }
      resetModal()
      fetchRequests(user.id, dateRangeStart, dateRangeEnd)
    }
    setLoading(false)
  }

  const handleApprove = async (requestId: string, status: string) => {
    const updateData: any = { status }
    if (status === 'approved') updateData.approved_at = new Date().toISOString()
    if (status === 'rejected') updateData.rejected_at = new Date().toISOString()
    if (status === 'pending') {
      updateData.approved_at = null
      updateData.rejected_at = null
    }

    // DB에 저장 후 실제 저장된 시간값을 가져옴 → 앱과 메일이 동일한 값 사용
    const { data: updated } = await supabase
      .from('approval_requests')
      .update(updateData)
      .eq('id', requestId)
      .select('approved_at, rejected_at')
      .single()

    if (status === 'approved' || status === 'rejected') {
      const req = selectedRequest
      const requesterEmail = req.requester?.email
      const requesterName = req.requester?.name || req.requester?.email?.split('@')[0]
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const approverName = myProfile.data?.name || user.email?.split('@')[0]

      // DB에서 반환된 실제 저장 시간 사용
      const actionAt = status === 'approved' ? updated?.approved_at : updated?.rejected_at

      if (requesterEmail) {
        const mergedCc = Array.from(new Set([...existingCcList, ...ccList]))
        if (mergedCc.length > 0) saveCcHistory(mergedCc)

        fetch('/api/notify-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailType: 'result',
            approvalId: requestId,
            requesterId: req.requester_id,
            requesterEmail,
            requesterName,
            approverName,
            type: req.type,
            dateEntries: req.date_entries,
            memo: req.memo,
            status,
            actionAt,
            ccEmails: mergedCc,
          }),
        }).catch((e) => console.error('결과 메일 발송 실패:', e))
      }
    }

    setSelectedRequest(null)
    setCcList([])
    setCcInput('')
    setExistingCcList([])
    fetchRequests(user.id, dateRangeStart, dateRangeEnd)
  }

  // pending 요청의 날짜/사유를 그룹 단위 편집 폼(dateGroups)으로 되돌림
  const buildDateGroupsFromEntries = (entries: any[], type: string) => {
    if (!entries || entries.length === 0) return []
    if (type !== 'vacation') {
      return [{ dates: entries.map((e: any) => e.date), vacationType: 'annual' }]
    }
    const map = new Map<string, string[]>()
    entries.forEach((e: any) => {
      const vt = e.vacationType || 'annual'
      if (!map.has(vt)) map.set(vt, [])
      map.get(vt)!.push(e.date)
    })
    return Array.from(map.entries()).map(([vacationType, dates]) => ({ vacationType, dates }))
  }

  const handleEditRequest = async (req: any) => {
    setSelectedRequest(null)
    setEditingRequestId(req.id)
    setRequestType(req.type)
    setDateGroups(buildDateGroupsFromEntries(req.date_entries, req.type))
    setMemo(req.memo || '')
    setCcList(req.cc_emails || [])
    setCcInput('')

    const sources = mySources.length > 0 ? mySources : await fetchMySources(user.id)
    const matched = sources.find((s) => {
      if (req.team_id) return s.teamId === req.team_id
      if (req.department_id) return (s.departmentId || null) === req.department_id
      if (req.division_id) return s.divisionId === req.division_id
      return false
    })
    if (matched) {
      await fetchApproversForSource(matched, req.type)
    } else {
      setSelectedSourceKey('')
      setApprovers([])
    }
    setSelectedApprover(req.approver_id)

    setStep(2)
    setMessage('')
    setShowRequestModal(true)
  }

  const handleCancelRequest = async (requestId: string) => {
    // 취소는 알림/메일 없이 상태만 변경 (이력은 남김)
    await supabase
      .from('approval_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('requester_id', user.id)
      .eq('status', 'pending')

    setSelectedRequest(null)
    setCcList([])
    setCcInput('')
    setExistingCcList([])
    fetchRequests(user.id, dateRangeStart, dateRangeEnd)
  }

  const confirmCancelRequest = (requestId: string) => {
    setPendingConfirm({
      title: '이 요청을 취소할까요?',
      confirmLabel: '취소하기',
      tone: 'danger',
      onConfirm: () => {
        setPendingConfirm(null)
        handleCancelRequest(requestId)
      },
    })
  }

  // 요청자: 이미 승인된 건에 대한 취소 요청
  const handleRequestCancelApproval = async (requestId: string) => {
    await supabase
      .from('approval_requests')
      .update({ cancel_requested: true, cancel_requested_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('requester_id', user.id)
      .eq('status', 'approved')

    const req = selectedRequest
    const approverEmail = req?.approver?.email
    if (approverEmail) {
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const requesterName = myProfile.data?.name || user.email?.split('@')[0] || '팀원'
      const approverName = req.approver?.name || req.approver?.email?.split('@')[0]

      fetch('/api/notify-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: 'cancel_request',
          approvalId: requestId,
          approverId: req.approver_id,
          approverEmail,
          approverName,
          requesterName,
          type: req.type,
          dateEntries: req.date_entries,
        }),
      }).catch((e) => console.error('취소 요청 메일 발송 실패:', e))
    }

    setSelectedRequest(null)
    setCcList([])
    setCcInput('')
    setExistingCcList([])
    fetchRequests(user.id, dateRangeStart, dateRangeEnd)
  }

  const confirmRequestCancelApproval = (requestId: string) => {
    setPendingConfirm({
      title: '이미 승인된 건이에요. 취소를 요청할까요?',
      confirmLabel: '요청하기',
      onConfirm: () => {
        setPendingConfirm(null)
        handleRequestCancelApproval(requestId)
      },
    })
  }

  // 결재권자: 취소 요청을 승인(=건을 취소 처리)하거나 거절
  const handleResolveCancelRequest = async (requestId: string, approve: boolean) => {
    const updateData: any = { cancel_requested: false }
    if (approve) {
      updateData.status = 'cancelled'
      updateData.cancelled_at = new Date().toISOString()
    }

    await supabase
      .from('approval_requests')
      .update(updateData)
      .eq('id', requestId)
      .eq('approver_id', user.id)
      .eq('status', 'approved')

    const req = selectedRequest
    const requesterEmail = req?.requester?.email
    if (requesterEmail) {
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const approverName = myProfile.data?.name || user.email?.split('@')[0]
      const requesterName = req.requester?.name || req.requester?.email?.split('@')[0]

      fetch('/api/notify-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: 'cancel_result',
          approvalId: requestId,
          requesterId: req.requester_id,
          requesterEmail,
          requesterName,
          approverName,
          type: req.type,
          dateEntries: req.date_entries,
          cancelApproved: approve,
        }),
      }).catch((e) => console.error('취소 요청 결과 메일 발송 실패:', e))
    }

    setSelectedRequest(null)
    setCcList([])
    setCcInput('')
    setExistingCcList([])
    fetchRequests(user.id, dateRangeStart, dateRangeEnd)
  }

  const confirmResolveCancelRequest = (requestId: string, approve: boolean) => {
    setPendingConfirm({
      title: approve ? '취소 요청을 승인할까요?' : '취소 요청을 거절할까요?',
      description: approve ? '이 건은 취소 처리돼요.' : undefined,
      confirmLabel: approve ? '승인' : '거절',
      tone: approve ? 'danger' : 'normal',
      onConfirm: () => {
        setPendingConfirm(null)
        handleResolveCancelRequest(requestId, approve)
      },
    })
  }

  const resetModal = () => {
    setShowRequestModal(false)
    setStep(1)
    setRequestType('')
    setDateGroups([])
    setMemo('')
    setSelectedApprover('')
    setSelectedSourceKey('')
    setApprovers([])
    setMessage('')
    setCcList([])
    setCcInput('')
    setEditingRequestId(null)
  }

  const handleCardClick = (req: any) => {
    setSelectedRequest(req)
    setExistingCcList(req.cc_emails || [])
  }

  const handleDetailClose = () => {
    setSelectedRequest(null)
    setCcList([])
    setCcInput('')
    setExistingCcList([])
  }

  const handleDateGroupChange = (index: number, dates: string[]) => {
    const updated = [...dateGroups]
    updated[index].dates = dates
    setDateGroups(updated)
  }

  const handleVacationTypeChange = (index: number, vacationType: string) => {
    const updated = [...dateGroups]
    updated[index].vacationType = vacationType
    setDateGroups(updated)
  }

  // 알림센터에서 특정 결재로 딥링크된 경우 해당 상세 모달을 자동으로 열어줌
  useEffect(() => {
    const requestId = searchParams.get('requestId')
    if (!requestId || requests.length === 0) return
    const found = requests.find((r) => r.id === requestId)
    if (found) handleCardClick(found)
  }, [searchParams, requests])

  usePushSubscription(user?.id)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-semibold dark:text-white">결재</h1>
        </div>

        <ApprovalList
          requests={requests}
          userId={user?.id ?? ''}
          filterStatus={filterStatus}
          filterType={filterType}
          dateRangeStart={dateRangeStart}
          dateRangeEnd={dateRangeEnd}
          onFilterStatusChange={setFilterStatus}
          onFilterTypeChange={setFilterType}
          onDateRangeChange={handleDateRangeChange}
          onCardClick={handleCardClick}
          scopeOptions={scopeOptions}
          selectedScope={selectedScope}
          onScopeChange={handleScopeChange}
        />

        {selectedRequest && (
          <ApprovalDetailModal
            selectedRequest={selectedRequest}
            user={user}
            ccInput={ccInput}
            ccList={ccList}
            existingCcList={existingCcList}
            ccSuggestions={ccSuggestions}
            showCcSuggestions={showCcSuggestions}
            onCcInputChange={handleCcInput}
            onAddCcEmail={addCcEmail}
            onRemoveCc={removeCc}
            onRemoveExistingCc={(email) =>
              setExistingCcList(existingCcList.filter((e) => e !== email))
            }
            onApprove={handleApprove}
            onEdit={handleEditRequest}
            onCancel={confirmCancelRequest}
            onRequestCancelApproval={confirmRequestCancelApproval}
            onResolveCancelRequest={confirmResolveCancelRequest}
            onClose={handleDetailClose}
          />
        )}

        {showRequestModal && (
          <RequestModal
            step={step}
            requestType={requestType}
            isEditing={!!editingRequestId}
            dateGroups={dateGroups}
            selectedSourceKey={selectedSourceKey}
            selectedApprover={selectedApprover}
            mySources={mySources}
            approvers={approvers}
            memo={memo}
            ccInput={ccInput}
            ccList={ccList}
            ccSuggestions={ccSuggestions}
            showCcSuggestions={showCcSuggestions}
            loading={loading}
            message={message}
            onSelectType={(type) => {
              setRequestType(type)
              setStep(2)
            }}
            onBack={() => setStep(1)}
            onSourceChange={handleSourceChange}
            onApproverChange={setSelectedApprover}
            onAddDateGroup={() =>
              setDateGroups([...dateGroups, { dates: [], vacationType: 'annual' }])
            }
            onRemoveDateGroup={(index) => setDateGroups(dateGroups.filter((_, i) => i !== index))}
            onDateGroupChange={handleDateGroupChange}
            onVacationTypeChange={handleVacationTypeChange}
            onMemoChange={setMemo}
            onCcInputChange={handleCcInput}
            onAddCcEmail={addCcEmail}
            onRemoveCc={removeCc}
            onSubmit={handleSubmitRequest}
            onClose={resetModal}
          />
        )}
      </div>

      <button
        onClick={() => {
          setEditingRequestId(null)
          setShowRequestModal(true)
          setStep(1)
          setMessage('')
        }}
        className="fixed bottom-24 right-4 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg z-40 text-sm font-medium"
      >
        + 결재 요청
      </button>

      <ConfirmDialog
        open={!!pendingConfirm}
        tone={pendingConfirm?.tone ?? 'normal'}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => pendingConfirm?.onConfirm()}
      />
    </div>
  )
}

export default function ApprovalPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalPageContent />
    </Suspense>
  )
}
