'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'next/navigation'
import dayjs from 'dayjs'
import { usePushSubscription } from '../hooks/usePushSubscription'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import ApprovalList from '../components/approval/ApprovalList'
import ApprovalDetailModal from '../components/approval/ApprovalDetailModal'
import RequestModal from '../components/approval/RequestModal'
import LoadError from '@/app/components/ui/LoadError'
import { displayName } from '@/app/lib/labels'
import type {
  ApprovalRequest,
  ApprovalRequestWithRelations,
  ApprovalStatus,
  ApproverOption,
  DateEntry,
  MyTeamOption,
} from '@/app/lib/types'

const CC_STORAGE_KEY = 'approval_cc_history'

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
  const searchParams = useSearchParams()
  const { user } = useCurrentUser()
  const [requests, setRequests] = useState<ApprovalRequestWithRelations[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
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
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [approvers, setApprovers] = useState<ApproverOption[]>([])
  const [myTeams, setMyTeams] = useState<MyTeamOption[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequestWithRelations | null>(null)
  const [memo, setMemo] = useState('')
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)

  // CC 관련
  const [ccInput, setCcInput] = useState('')
  const [ccList, setCcList] = useState<string[]>([])
  const [existingCcList, setExistingCcList] = useState<string[]>([])
  const [ccSuggestions, setCcSuggestions] = useState<string[]>([])
  const [showCcSuggestions, setShowCcSuggestions] = useState(false)

  useEffect(() => {
    if (user) {
      fetchRequests(user.id, dateRangeStart, dateRangeEnd)
      fetchMyTeams(user.id)
    }
  }, [user])

  const fetchRequests = async (userId: string, rangeStart: string, rangeEnd: string) => {
    setLoadFailed(false)

    const { data: myTeamData } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
    const myTeamIds = myTeamData?.map((t) => t.team_id) ?? []

    const orConditions = [`requester_id.eq.${userId}`, `approver_id.eq.${userId}`]
    if (myTeamIds.length > 0) orConditions.push(`team_id.in.(${myTeamIds.join(',')})`)

    const { data, error } = await supabase
      .from('approval_requests')
      .select(
        `*, requester:profiles!approval_requests_requester_id_fkey(name,email), approver:profiles!approval_requests_approver_id_fkey(name,email), teams(name)`
      )
      .or(orConditions.join(','))
      .gte('created_at', dayjs(rangeStart).startOf('day').toISOString())
      .lte('created_at', dayjs(rangeEnd).endOf('day').toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      // 실패를 넘기면 "결재 요청이 없어요"로 보여서 정상 상태와 구분되지 않는다.
      setLoadFailed(true)
      return
    }
    if (data) setRequests(data)
  }

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
    if (user) fetchRequests(user.id, start, end)
  }

  const fetchMyTeams = async (userId: string) => {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, teams(id,name)')
      .eq('user_id', userId)
      // 조인 결과를 supabase-js는 배열로 추론하지만, FK 관계라 실제로는 단일 객체다
      .returns<MyTeamOption[]>()
    if (data) setMyTeams(data)
  }

  const fetchApprovers = async (teamId: string) => {
    setSelectedTeamId(teamId)
    setSelectedApprover('')
    const { data } = await supabase
      .from('team_members')
      .select('user_id, profiles(id,name,email)')
      .eq('team_id', teamId)
      .eq('role', 'admin')
      .returns<ApproverOption[]>()
    if (data) setApprovers(data)
  }

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
    if (!user) return
    if (!requestType || !selectedApprover || !selectedTeamId) {
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
          team_id: selectedTeamId,
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
        team_id: selectedTeamId,
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
        const requesterName = displayName({ name: myProfile.data?.name, email: user.email }, '팀원')
        const approverName = displayName(approverInfo.profiles)

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

  const handleApprove = async (requestId: string, status: ApprovalStatus) => {
    if (!user) return
    const updateData: Partial<ApprovalRequest> = { status }
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

    if (selectedRequest && (status === 'approved' || status === 'rejected')) {
      const req = selectedRequest
      const requesterEmail = req.requester?.email
      const requesterName = displayName(req.requester)
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const approverName = displayName({ name: myProfile.data?.name, email: user.email })

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
  const buildDateGroupsFromEntries = (entries: DateEntry[] | null, type: string) => {
    if (!entries || entries.length === 0) return []
    if (type !== 'vacation') {
      return [{ dates: entries.map((e) => e.date), vacationType: 'annual' }]
    }
    const map = new Map<string, string[]>()
    entries.forEach((e) => {
      const vt = e.vacationType || 'annual'
      if (!map.has(vt)) map.set(vt, [])
      map.get(vt)!.push(e.date)
    })
    return Array.from(map.entries()).map(([vacationType, dates]) => ({ vacationType, dates }))
  }

  const handleEditRequest = async (req: ApprovalRequestWithRelations) => {
    setSelectedRequest(null)
    setEditingRequestId(req.id)
    setRequestType(req.type)
    setDateGroups(buildDateGroupsFromEntries(req.date_entries, req.type))
    setMemo(req.memo || '')
    setCcList(req.cc_emails || [])
    setCcInput('')

    await fetchApprovers(req.team_id)
    setSelectedApprover(req.approver_id)

    setStep(2)
    setMessage('')
    setShowRequestModal(true)
  }

  const handleCancelRequest = async (requestId: string) => {
    if (!user) return
    if (!confirm('이 요청을 취소할까요?')) return
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

  // 요청자: 이미 승인된 건에 대한 취소 요청
  const handleRequestCancelApproval = async (requestId: string) => {
    if (!user) return
    if (!confirm('이미 승인된 건이에요. 취소를 요청할까요?')) return

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
      const requesterName = displayName({ name: myProfile.data?.name, email: user.email }, '팀원')
      const approverName = displayName(req?.approver)

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

  // 결재권자: 취소 요청을 승인(=건을 취소 처리)하거나 거절
  const handleResolveCancelRequest = async (requestId: string, approve: boolean) => {
    if (!user) return
    const confirmMsg = approve
      ? '취소 요청을 승인할까요? 이 건은 취소 처리돼요.'
      : '취소 요청을 거절할까요?'
    if (!confirm(confirmMsg)) return

    const updateData: Partial<ApprovalRequest> = { cancel_requested: false }
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
      const approverName = displayName({ name: myProfile.data?.name, email: user.email })
      const requesterName = displayName(req?.requester)

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

  const resetModal = () => {
    setShowRequestModal(false)
    setStep(1)
    setRequestType('')
    setDateGroups([])
    setMemo('')
    setSelectedApprover('')
    setSelectedTeamId('')
    setApprovers([])
    setMessage('')
    setCcList([])
    setCcInput('')
    setEditingRequestId(null)
  }

  const handleCardClick = (req: ApprovalRequestWithRelations) => {
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
    <div className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">결재</h1>
        </div>

        {loadFailed && (
          <LoadError
            message="결재 목록을 불러오지 못했습니다."
            onRetry={() => user && fetchRequests(user.id, dateRangeStart, dateRangeEnd)}
            className="mb-4"
          />
        )}

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
            onCancel={handleCancelRequest}
            onRequestCancelApproval={handleRequestCancelApproval}
            onResolveCancelRequest={handleResolveCancelRequest}
            onClose={handleDetailClose}
          />
        )}

        {showRequestModal && (
          <RequestModal
            step={step}
            requestType={requestType}
            isEditing={!!editingRequestId}
            dateGroups={dateGroups}
            selectedTeamId={selectedTeamId}
            selectedApprover={selectedApprover}
            myTeams={myTeams}
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
            onTeamChange={fetchApprovers}
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
