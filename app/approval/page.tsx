'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePushSubscription } from '../hooks/usePushSubscription'
import ApprovalList from '../components/approval/ApprovalList'
import ApprovalDetailModal from '../components/approval/ApprovalDetailModal'
import RequestModal from '../components/approval/RequestModal'

const CC_STORAGE_KEY = 'approval_cc_history'

function getCcHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(CC_STORAGE_KEY) || '[]')
  } catch { return [] }
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
  const [requests, setRequests] = useState<any[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [step, setStep] = useState(1)
  const [requestType, setRequestType] = useState<string>('')
  const [dateGroups, setDateGroups] = useState<{ dates: string[]; vacationType: string }[]>([])
  const [selectedApprover, setSelectedApprover] = useState<string>('')
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [approvers, setApprovers] = useState<any[]>([])
  const [myTeams, setMyTeams] = useState<any[]>([])
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      fetchRequests(user.id)
      fetchMyTeams(user.id)
    }
    getUser()
  }, [])

  const fetchRequests = async (userId: string) => {
    const { data: myTeamData } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
    const myTeamIds = myTeamData?.map((t) => t.team_id) ?? []

    const orConditions = [`requester_id.eq.${userId}`, `approver_id.eq.${userId}`]
    if (myTeamIds.length > 0) orConditions.push(`team_id.in.(${myTeamIds.join(',')})`)

    const { data } = await supabase
      .from('approval_requests')
      .select(`*, requester:profiles!approval_requests_requester_id_fkey(name,email), approver:profiles!approval_requests_approver_id_fkey(name,email), teams(name)`)
      .or(orConditions.join(','))
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  const fetchMyTeams = async (userId: string) => {
    const { data } = await supabase
      .from('team_members')
      .select('team_id, teams(id,name)')
      .eq('user_id', userId)
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
    if (!requestType || !selectedApprover || !selectedTeamId) { setMessage('모든 항목을 입력해주세요.'); return }
    if (dateGroups.length === 0) { setMessage('날짜를 추가해주세요.'); return }
    const flattenedEntries = dateGroups.flatMap((group) =>
      group.dates.map((date) => ({ date, vacationType: group.vacationType }))
    )
    if (flattenedEntries.length === 0) { setMessage('날짜를 선택해주세요.'); return }
    if (requestType === 'holiday' && !memo.trim()) { setMessage('출근 사유를 입력해주세요.'); return }

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
          memo: (requestType === 'vacation' || requestType === 'holiday') ? memo : null,
          cc_emails: ccList.length > 0 ? ccList : null,
        })
        .eq('id', editingRequestId)
        .eq('requester_id', user.id)
        .eq('status', 'pending')

      if (error) {
        setMessage('수정 실패: ' + error.message)
      } else {
        resetModal()
        fetchRequests(user.id)
      }
      setLoading(false)
      return
    }

    const { data: inserted, error } = await supabase.from('approval_requests').insert({
      requester_id: user.id,
      approver_id: selectedApprover,
      team_id: selectedTeamId,
      type: requestType,
      date: flattenedEntries[0].date,
      dates: flattenedEntries.map((e) => e.date),
      date_entries: flattenedEntries,
      memo: (requestType === 'vacation' || requestType === 'holiday') ? memo : null,
      cc_emails: ccList.length > 0 ? ccList : null,
    }).select('id').single()

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
            memo: (requestType === 'vacation' || requestType === 'holiday') ? memo : undefined,
            ccEmails: ccList,
          }),
        }).catch((e) => console.error('알림 메일 발송 실패:', e))

        if (ccList.length > 0) saveCcHistory(ccList)
      }
      resetModal()
      fetchRequests(user.id)
    }
    setLoading(false)
  }

  const handleApprove = async (requestId: string, status: string) => {
    const updateData: any = { status }
    if (status === 'approved') updateData.approved_at = new Date().toISOString()
    if (status === 'rejected') updateData.rejected_at = new Date().toISOString()
    if (status === 'pending') { updateData.approved_at = null; updateData.rejected_at = null }

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
    fetchRequests(user.id)
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

    await fetchApprovers(req.team_id)
    setSelectedApprover(req.approver_id)

    setStep(2)
    setMessage('')
    setShowRequestModal(true)
  }

  const handleCancelRequest = async (requestId: string) => {
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
    fetchRequests(user.id)
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
          onFilterStatusChange={setFilterStatus}
          onFilterTypeChange={setFilterType}
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
            onSelectType={(type) => { setRequestType(type); setStep(2) }}
            onBack={() => setStep(1)}
            onTeamChange={fetchApprovers}
            onApproverChange={setSelectedApprover}
            onAddDateGroup={() => setDateGroups([...dateGroups, { dates: [], vacationType: 'annual' }])}
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
        onClick={() => { setEditingRequestId(null); setShowRequestModal(true); setStep(1); setMessage('') }}
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
