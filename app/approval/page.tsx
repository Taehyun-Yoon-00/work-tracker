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

const CC_STORAGE_KEY = 'approval_cc_history'

// "내 소속" = 내가 속한 팀, 또는 팀 없이 부서에 직접 소속된 경우 그 부서
interface MySource {
  key: string // `team:<teamId>` 또는 `dept:<departmentId>`
  label: string
  teamId: string | null
  departmentId: string
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
      fetchRequests(user.id, dateRangeStart, dateRangeEnd)
      fetchMySources(user.id)
    }
    getUser()
  }, [])

  const fetchRequests = async (userId: string, rangeStart: string, rangeEnd: string) => {
    const [{ data: myTeamData }, { data: myDeptDirectData }] = await Promise.all([
      supabase.from('team_members').select('team_id, teams(department_id)').eq('user_id', userId),
      supabase.from('department_memberships').select('department_id').eq('user_id', userId),
    ])
    const myTeamIds = (myTeamData || []).map((t: any) => t.team_id)
    const myDeptIds = Array.from(
      new Set([
        ...(myTeamData || []).map((t: any) => t.teams?.department_id).filter(Boolean),
        ...(myDeptDirectData || []).map((d: any) => d.department_id),
      ])
    )

    const orConditions = [`requester_id.eq.${userId}`, `approver_id.eq.${userId}`]
    if (myTeamIds.length > 0) orConditions.push(`team_id.in.(${myTeamIds.join(',')})`)
    if (myDeptIds.length > 0) orConditions.push(`department_id.in.(${myDeptIds.join(',')})`)

    const { data } = await supabase
      .from('approval_requests')
      .select(
        `*, requester:profiles!approval_requests_requester_id_fkey(name,email), approver:profiles!approval_requests_approver_id_fkey(name,email), teams(name), departments(name)`
      )
      .or(orConditions.join(','))
      .gte('created_at', dayjs(rangeStart).startOf('day').toISOString())
      .lte('created_at', dayjs(rangeEnd).endOf('day').toISOString())
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
    if (user) fetchRequests(user.id, start, end)
  }

  // 내 소속(팀 또는 부서 직접 소속) 목록
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

    const sources: MySource[] = [
      ...(teamData || [])
        .filter((t: any) => t.teams)
        .map((t: any) => ({
          key: `team:${t.team_id}`,
          label: t.teams.name,
          teamId: t.team_id as string,
          departmentId: t.teams.department_id as string,
        })),
      ...(deptData || [])
        .filter((d: any) => d.departments)
        .map((d: any) => ({
          key: `dept:${d.department_id}`,
          label: d.departments.name,
          teamId: null,
          departmentId: d.department_id as string,
        })),
    ]
    setMySources(sources)
    return sources
  }

  // 결재권자 후보 = 부서장(자동) + 위임된 결재권자(유형별 체크) + (팀이 있다면) 그 팀의 팀장
  const fetchApproversForSource = async (source: MySource, type: string) => {
    setSelectedSourceKey(source.key)
    setSelectedApprover('')

    const candidates = new Map<string, any>()

    const { data: dept } = await supabase
      .from('departments')
      .select('id, head_user_id')
      .eq('id', source.departmentId)
      .single()

    if (dept?.head_user_id) {
      const { data: headProfile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', dept.head_user_id)
        .single()
      if (headProfile)
        candidates.set(headProfile.id, { user_id: headProfile.id, profiles: headProfile })
    }

    const typeColumn =
      type === 'vacation' ? 'can_vacation' : type === 'remote' ? 'can_remote' : 'can_holiday'
    const { data: delegates } = await supabase
      .from('department_approvers')
      .select(`user_id, ${typeColumn}, profiles(id, name, email)`)
      .eq('department_id', source.departmentId)

    ;(delegates || []).forEach((d: any) => {
      if (d[typeColumn] && d.profiles)
        candidates.set(d.user_id, { user_id: d.user_id, profiles: d.profiles })
    })

    if (source.teamId) {
      const { data: leads } = await supabase
        .from('team_members')
        .select('user_id, profiles(id, name, email)')
        .eq('team_id', source.teamId)
        .eq('role', 'admin')
      ;(leads || []).forEach((l: any) => {
        if (l.profiles) candidates.set(l.user_id, l)
      })
    }

    setApprovers(Array.from(candidates.values()))
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
          department_id: selectedSource.departmentId,
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
        department_id: selectedSource.departmentId,
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
    const matched = sources.find((s) =>
      req.team_id ? s.teamId === req.team_id : s.departmentId === req.department_id
    )
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
          <h1 className="text-2xl font-bold dark:text-white">결재</h1>
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
