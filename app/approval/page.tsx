'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useAppBadge } from '../hooks/useAppBadge'
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

export default function ApprovalPage() {
  const router = useRouter()
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

  // CC ・・ｨ
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
    if (!requestType || !selectedApprover || !selectedTeamId) { setMessage('・ｨ・ 﨑ｭ・ｩ・・・・･﨑ｴ・ｼ・ｸ・・'); return }
    if (dateGroups.length === 0) { setMessage('・・罹･ｼ ・緋ｰ﨑ｴ・ｼ・ｸ・・'); return }
    const flattenedEntries = dateGroups.flatMap((group) =>
      group.dates.map((date) => ({ date, vacationType: group.vacationType }))
    )
    if (flattenedEntries.length === 0) { setMessage('・・罹･ｼ ・夋晨紛・ｼ・ｸ・・'); return }
    if (requestType === 'holiday' && !memo.trim()) { setMessage('・懋ｷｼ ・ｬ・・ｼ ・・･﨑ｴ・ｼ・ｸ・・'); return }

    setLoading(true)
    setMessage('')

    const { error } = await supabase.from('approval_requests').insert({
      requester_id: user.id,
      approver_id: selectedApprover,
      team_id: selectedTeamId,
      type: requestType,
      date: flattenedEntries[0].date,
      dates: flattenedEntries.map((e) => e.date),
      date_entries: flattenedEntries,
      memo: (requestType === 'vacation' || requestType === 'holiday') ? memo : null,
      cc_emails: ccList.length > 0 ? ccList : null,
    })

    if (error) {
      setMessage('・肥ｲｭ ・､甯ｨ: ' + error.message)
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
            approverId: selectedApprover,
            approverEmail: approverInfo.profiles.email,
            approverName,
            requesterName,
            type: requestType,
            dateEntries: flattenedEntries,
            memo: (requestType === 'vacation' || requestType === 'holiday') ? memo : undefined,
            ccEmails: ccList,
          }),
        }).catch((e) => console.error('・誤ｦｼ ・肥攵 ・懍・ ・､甯ｨ:', e))

        if (ccList.length > 0) saveCcHistory(ccList)
      }
      resetModal()
      fetchRequests(user.id)
    }
    setLoading(false)
  }

  const handleApprove = async (requestId: string, status: string) => {
    const now = new Date().toISOString()
    const updateData: any = { status }
    if (status === 'approved') updateData.approved_at = now
    if (status === 'rejected') updateData.rejected_at = now
    if (status === 'pending') { updateData.approved_at = null; updateData.rejected_at = null }

    await supabase.from('approval_requests').update(updateData).eq('id', requestId)

    if (status === 'approved' || status === 'rejected') {
      const req = selectedRequest
      const requesterEmail = req.requester?.email
      const requesterName = req.requester?.name || req.requester?.email?.split('@')[0]
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const approverName = myProfile.data?.name || user.email?.split('@')[0]

      if (requesterEmail) {
        const mergedCc = Array.from(new Set([...existingCcList, ...ccList]))
        if (mergedCc.length > 0) saveCcHistory(mergedCc)

        fetch('/api/notify-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailType: 'result',
            requesterId: req.requester_id,
            requesterEmail,
            requesterName,
            approverName,
            type: req.type,
            dateEntries: req.date_entries,
            memo: req.memo,
            status,
            actionAt: now,
            ccEmails: mergedCc,
          }),
        }).catch((e) => console.error('・ｰ・ｼ ・肥攵 ・懍・ ・､甯ｨ:', e))
      }
    }

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

  // ・ｴ・ ・ｰ・ｬ・護梵・ｸ ・・ｰ ・ｴ・・竊・PWA ・・擽・・・・ｧ
  const pendingCount = requests.filter(
    (r) => r.approver_id === user?.id && r.status === 'pending'
  ).length
  useAppBadge(pendingCount)
  usePushSubscription(user?.id)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">・ｰ・ｬ</h1>
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
            onClose={handleDetailClose}
          />
        )}

        {showRequestModal && (
          <RequestModal
            step={step}
            requestType={requestType}
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
        onClick={() => { setShowRequestModal(true); setStep(1); setMessage('') }}
        className="fixed bottom-24 right-4 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg z-40 text-sm font-medium"
      >
        + ・ｰ・ｬ ・肥ｲｭ
      </button>
    </div>
  )
}
