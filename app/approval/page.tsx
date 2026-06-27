'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import DatePicker from 'react-multi-date-picker'

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

  // CC 관련
  const [ccInput, setCcInput] = useState('')
  const [ccList, setCcList] = useState<string[]>([])
  const [existingCcList, setExistingCcList] = useState<string[]>([]) // DB에 저장된 CC (결재권자가 편집 가능)
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
      const filtered = history.filter(e => e.toLowerCase().includes(val.toLowerCase()) && !ccList.includes(e))
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

  const removeCc = (email: string) => setCcList(ccList.filter(e => e !== email))

  const handleSubmitRequest = async () => {
    if (!requestType || !selectedApprover || !selectedTeamId) { setMessage('모든 항목을 입력해주세요.'); return }
    if (dateGroups.length === 0) { setMessage('날짜를 추가해주세요.'); return }
    const flattenedEntries = dateGroups.flatMap((group) =>
      group.dates.map((date) => ({ date, vacationType: group.vacationType }))
    )
    if (flattenedEntries.length === 0) { setMessage('날짜를 선택해주세요.'); return }
    // 휴일근무는 출근 사유 필수
    if (requestType === 'holiday' && !memo.trim()) { setMessage('출근 사유를 입력해주세요.'); return }

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
    const now = new Date().toISOString()
    const updateData: any = { status }
    if (status === 'approved') updateData.approved_at = now
    if (status === 'rejected') updateData.rejected_at = now
    if (status === 'pending') { updateData.approved_at = null; updateData.rejected_at = null }

    await supabase.from('approval_requests').update(updateData).eq('id', requestId)

    // 결재 결과 메일 발송 (승인/반려 시)
    if (status === 'approved' || status === 'rejected') {
      const req = selectedRequest
      const requesterEmail = req.requester?.email
      const requesterName = req.requester?.name || req.requester?.email?.split('@')[0]
      const myProfile = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const approverName = myProfile.data?.name || user.email?.split('@')[0]

      if (requesterEmail) {
        // 결재권자가 모달에서 새로 추가한 CC + 요청 시 저장된 CC 합산 (중복 제거)
        const mergedCc = Array.from(new Set([...existingCcList, ...ccList]))
        if (mergedCc.length > 0) saveCcHistory(mergedCc)

        fetch('/api/notify-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailType: 'result',
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
        }).catch((e) => console.error('결과 메일 발송 실패:', e))
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

  const filteredRequests = requests.filter((r) => {
    const statusMatch = filterStatus === 'all' || r.status === filterStatus
    const typeMatch = filterType === 'all' || r.type === filterType
    return statusMatch && typeMatch
  })

  const statusLabel = (status: string) => {
    if (status === 'pending') return { text: '승인 대기중', color: 'text-yellow-500 bg-yellow-50' }
    if (status === 'approved') return { text: '승인', color: 'text-green-500 bg-green-50' }
    if (status === 'rejected') return { text: '반려', color: 'text-red-500 bg-red-50' }
    return { text: status, color: '' }
  }

  const typeLabel = (type: string) => {
    if (type === 'vacation') return { text: '휴가', style: 'bg-orange-50 text-orange-500' }
    if (type === 'remote') return { text: '원격근무', style: 'bg-purple-50 text-purple-500' }
    if (type === 'holiday') return { text: '휴일근무', style: 'bg-red-50 text-red-500' }
    return { text: type, style: 'bg-gray-100 text-gray-500' }
  }

  const vacationTypeLabel = (type: string) => {
    if (type === 'annual') return '연차'
    if (type === 'morning') return '오전반차'
    if (type === 'afternoon') return '오후반차'
    if (type === 'special') return '특휴/대휴'
    return type
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">결재</h1>
        </div>

        {/* 상태 필터 */}
        <div className="flex bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5 mb-2">
          {[
            { value: 'all', label: '전체' },
            { value: 'pending', label: '대기중' },
            { value: 'approved', label: '승인' },
            { value: 'rejected', label: '반려' },
          ].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterStatus(value)}
              className={`flex-1 text-xs py-1.5 rounded-md transition ${filterStatus === value ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold' : 'text-gray-500 dark:text-zinc-400'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* 유형 필터 */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {[
            { value: 'all', label: '전체', style: filterType === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400' },
            { value: 'vacation', label: '🌴 휴가', style: filterType === 'vacation' ? 'bg-orange-500 text-white' : 'bg-orange-50 dark:bg-zinc-700 text-orange-500 dark:text-orange-300' },
            { value: 'remote', label: '💻 원격근무', style: filterType === 'remote' ? 'bg-purple-500 text-white' : 'bg-purple-50 dark:bg-zinc-700 text-purple-500 dark:text-purple-300' },
            { value: 'holiday', label: '🏢 휴일근무', style: filterType === 'holiday' ? 'bg-red-500 text-white' : 'bg-red-50 dark:bg-zinc-700 text-red-500 dark:text-red-300' },
          ].map(({ value, label, style }) => (
            <button key={value} onClick={() => setFilterType(value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${style}`}>
              {label}
            </button>
          ))}
        </div>

        {/* 리스트 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4">
          {filteredRequests.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">결재 요청이 없어요.</p>
          ) : (
            filteredRequests.map((req) => {
              const isRequester = req.requester_id === user?.id
              const status = statusLabel(req.status)
              const type = typeLabel(req.type)
              return (
                <div key={req.id} onClick={() => { setSelectedRequest(req); setExistingCcList(req.cc_emails || []) }}
                  className="py-3 border-b dark:border-zinc-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium dark:text-zinc-200">
                          {req.requester?.name || req.requester?.email?.split('@')[0]}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${type.style}`}>
                          {type.text}
                        </span>
                        {req.teams?.name && (
                          <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">{req.teams.name}</span>
                        )}
                        {isRequester && (
                          <span className="text-xs bg-orange-50 text-orange-400 px-2 py-0.5 rounded-full">내 요청</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">
                        {req.dates && req.dates.length > 1
                          ? `${dayjs(req.dates[0]).format('MM/DD')} 외 ${req.dates.length - 1}일`
                          : dayjs(req.date).format('YYYY년 MM월 DD일')}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">
                        결재권자: {req.approver?.name || req.approver?.email?.split('@')[0]}
                      </p>
                      {req.memo && <p className="text-xs text-gray-400 dark:text-zinc-500">사유: {req.memo}</p>}
                      {req.status === 'approved' && req.approved_at && (
                        <p className="text-xs text-green-500 mt-0.5">
                          승인일: {dayjs(req.approved_at).format('YYYY-MM-DD HH:mm')}
                        </p>
                      )}
                      {req.status === 'rejected' && req.rejected_at && (
                        <p className="text-xs text-red-400 mt-0.5">
                          반려일: {dayjs(req.rejected_at).format('YYYY-MM-DD HH:mm')}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 상세/승인 모달 */}
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto">
              <h3 className="font-semibold mb-3 dark:text-white">결재 처리</h3>
              <div className="mb-4 text-sm text-gray-600 dark:text-zinc-300 space-y-2">
                <p><span className="font-medium">신청자:</span> {selectedRequest.requester?.name || selectedRequest.requester?.email?.split('@')[0]}</p>
                <p>
                  <span className="font-medium">유형:</span>{' '}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeLabel(selectedRequest.type).style}`}>
                    {typeLabel(selectedRequest.type).text}
                  </span>
                </p>
                <div>
                  <span className="font-medium">날짜:</span>
                  <ul className="mt-2 space-y-1">
                    {selectedRequest.date_entries?.map((entry: any, i: number) => (
                      <li key={i} className="text-xs">
                        {dayjs(entry.date).format('MM월 DD일')}
                        {selectedRequest.type === 'vacation' && (
                          <span className="ml-1 text-orange-500">({vacationTypeLabel(entry.vacationType)})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedRequest.memo && (
                  <p>
                    <span className="font-medium">
                      {selectedRequest.type === 'holiday' ? '출근 사유:' : '사유:'}
                    </span>{' '}
                    {selectedRequest.memo}
                  </p>
                )}
                {selectedRequest.status === 'approved' && selectedRequest.approved_at && (
                  <p className="text-green-500 text-xs">승인일: {dayjs(selectedRequest.approved_at).format('YYYY-MM-DD HH:mm')}</p>
                )}
                {selectedRequest.status === 'rejected' && selectedRequest.rejected_at && (
                  <p className="text-red-400 text-xs">반려일: {dayjs(selectedRequest.rejected_at).format('YYYY-MM-DD HH:mm')}</p>
                )}

                {/* CC 입력 (결재권자만) */}
                {selectedRequest.approver_id === user?.id && selectedRequest.status === 'pending' && (
                  <div className="mt-3">
                    <p className="font-medium mb-1">참조 (CC)</p>
                    <div className="relative">
                      <div className="flex gap-1">
                        <input
                          type="email"
                          value={ccInput}
                          onChange={(e) => handleCcInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault()
                              addCcEmail(ccInput)
                            }
                          }}
                          placeholder="이메일 입력 후 Enter"
                          className="flex-1 border rounded-lg px-2 py-1.5 text-xs dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                        />
                        <button onClick={() => addCcEmail(ccInput)}
                          className="text-xs bg-gray-100 dark:bg-zinc-700 px-2 py-1.5 rounded-lg dark:text-zinc-300">
                          추가
                        </button>
                      </div>
                      {showCcSuggestions && (
                        <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-700 border dark:border-zinc-600 rounded-lg shadow-lg z-10 mt-1">
                          {ccSuggestions.map((email) => (
                            <button key={email} onClick={() => addCcEmail(email)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-600 dark:text-zinc-200">
                              {email}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {ccList.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {ccList.map((email) => (
                          <span key={email} className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">
                            {email}
                            <button onClick={() => removeCc(email)} className="text-blue-400 hover:text-blue-600">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {existingCcList.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">이전 CC</p>
                        <div className="flex flex-wrap gap-1">
                          {existingCcList.map((email: string) => (
                            <span key={email} className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 text-xs px-2 py-1 rounded-full">
                              {email}
                              <button onClick={() => setExistingCcList(existingCcList.filter(e => e !== email))} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {selectedRequest.approver_id === user?.id && (
                  <>
                    {selectedRequest.status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(selectedRequest.id, 'approved')}
                          className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm">승인</button>
                        <button onClick={() => handleApprove(selectedRequest.id, 'rejected')}
                          className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm">반려</button>
                      </>
                    )}
                    {selectedRequest.status === 'approved' && (
                      <button onClick={() => handleApprove(selectedRequest.id, 'pending')}
                        className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm">승인 취소</button>
                    )}
                    {selectedRequest.status === 'rejected' && (
                      <button onClick={() => handleApprove(selectedRequest.id, 'pending')}
                        className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm">반려 취소</button>
                    )}
                  </>
                )}
                <button onClick={() => { setSelectedRequest(null); setCcList([]); setCcInput(''); setExistingCcList([]) }}
                  className="flex-1 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 py-2 rounded-lg text-sm">닫기</button>
              </div>
            </div>
          </div>
        )}

        {/* 요청 모달 */}
        {showRequestModal && (
          <div className={`fixed inset-0 bg-black/50 z-50 flex justify-center p-2 sm:p-2 ${step === 1 ? 'items-center' : 'items-start'}`}>
            <div className="bg-white dark:bg-zinc-800 rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col">
              <div className="flex justify-between items-center p-4 sm:p-6 pb-3 border-b dark:border-zinc-700">
                <h3 className="font-semibold dark:text-white">결재 요청</h3>
                <button onClick={resetModal} className="text-gray-400 dark:text-zinc-500 text-lg">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                {step === 1 && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">요청 유형을 선택해주세요</p>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => { setRequestType('vacation'); setStep(2) }}
                        className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-orange-400 hover:text-orange-500 transition text-left px-4">
                        🌴 휴가
                      </button>
                      <button onClick={() => { setRequestType('remote'); setStep(2) }}
                        className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-purple-400 hover:text-purple-500 transition text-left px-4">
                        💻 원격근무
                      </button>
                      <button onClick={() => { setRequestType('holiday'); setStep(2) }}
                        className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-red-400 hover:text-red-500 transition text-left px-4">
                        🏢 휴일근무
                      </button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <button onClick={() => setStep(1)} className="text-xs text-gray-400 dark:text-zinc-500 mb-3">← 뒤로</button>

                    {/* 선택된 유형 표시 */}
                    <div className="mb-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${typeLabel(requestType).style}`}>
                        {typeLabel(requestType).text}
                      </span>
                    </div>

                    <div className="mb-3">
                      <label className="text-sm text-gray-500 dark:text-zinc-400">팀 선택</label>
                      <select value={selectedTeamId} onChange={(e) => fetchApprovers(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                        <option value="">팀 선택</option>
                        {myTeams.map((t) => (
                          <option key={t.team_id} value={t.team_id}>{t.teams?.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="text-sm text-gray-500 dark:text-zinc-400">결재권자</label>
                      <select value={selectedApprover} onChange={(e) => setSelectedApprover(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                        <option value="">결재권자 선택</option>
                        {approvers.map((a) => (
                          <option key={a.user_id} value={a.user_id}>
                            {a.profiles?.name || a.profiles?.email?.split('@')[0]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm text-gray-500 dark:text-zinc-400">날짜 선택</label>
                        <button onClick={() => setDateGroups([...dateGroups, { dates: [], vacationType: 'annual' }])}
                          className="text-xs text-blue-500">+ 날짜 추가</button>
                      </div>
                      {dateGroups.length === 0 && (
                        <p className="text-xs text-gray-400 dark:text-zinc-500">날짜 추가 버튼을 눌러주세요</p>
                      )}
                      {dateGroups.map((group, index) => (
                        <div key={index} className="mb-4 p-3 bg-gray-50 dark:bg-zinc-700 rounded-xl">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-500 dark:text-zinc-400">{index + 1}번째 그룹</span>
                            <button onClick={() => setDateGroups(dateGroups.filter((_, i) => i !== index))}
                              className="text-xs text-red-400">삭제</button>
                          </div>
                          <DatePicker
                            multiple portal portalTarget={document.body} zIndex={9999}
                            value={group.dates}
                            onChange={(dates: any) => {
                              const updated = [...dateGroups]
                              updated[index].dates = dates.map((d: any) => d.format('YYYY-MM-DD'))
                              setDateGroups(updated)
                            }}
                            format="YYYY-MM-DD" className="w-full text-sm"
                          />
                          {group.dates.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {group.dates.map((d, i) => (
                                <span key={i} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                                  {dayjs(d).format('MM/DD')}
                                </span>
                              ))}
                            </div>
                          )}
                          {requestType === 'vacation' && (
                            <div className="flex gap-1 mt-3">
                              {[
                                { value: 'annual', label: '연차' },
                                { value: 'morning', label: '오전반차' },
                                { value: 'afternoon', label: '오후반차' },
                                { value: 'special', label: '특휴/대휴' },
                              ].map(({ value, label }) => (
                                <button key={value}
                                  onClick={() => {
                                    const updated = [...dateGroups]
                                    updated[index].vacationType = value
                                    setDateGroups(updated)
                                  }}
                                  className={`flex-1 py-1.5 rounded-lg text-xs border ${group.vacationType === value ? 'bg-orange-500 text-white' : 'bg-white dark:bg-zinc-600 dark:text-zinc-300'}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* 사유 입력 (휴가 / 휴일근무) */}
                    {(requestType === 'vacation' || requestType === 'holiday') && (
                      <div className="mb-4">
                        <label className="text-sm text-gray-500 dark:text-zinc-400">
                          {requestType === 'holiday' ? '출근 사유' : '휴가 사유'}
                          {requestType === 'holiday' && <span className="text-red-400 ml-1">*</span>}
                        </label>
                        <input
                          type="text"
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          placeholder={requestType === 'holiday' ? '휴일 출근 사유를 입력해주세요' : ''}
                          className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                        />
                      </div>
                    )}

                    {/* CC 입력 */}
                    <div className="mb-4">
                      <label className="text-sm text-gray-500 dark:text-zinc-400">참조 (CC) <span className="text-gray-400 dark:text-zinc-500 font-normal">· 선택</span></label>
                      <div className="relative mt-1">
                        <div className="flex gap-1">
                          <input
                            type="email"
                            value={ccInput}
                            onChange={(e) => handleCcInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault()
                                addCcEmail(ccInput)
                              }
                            }}
                            placeholder="이메일 입력 후 Enter"
                            className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                          />
                          <button
                            onClick={() => addCcEmail(ccInput)}
                            className="text-xs bg-gray-100 dark:bg-zinc-700 px-3 py-2 rounded-lg dark:text-zinc-300">
                            추가
                          </button>
                        </div>
                        {showCcSuggestions && (
                          <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-700 border dark:border-zinc-600 rounded-lg shadow-lg z-10 mt-1">
                            {ccSuggestions.map((email) => (
                              <button key={email} onClick={() => addCcEmail(email)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-600 dark:text-zinc-200">
                                {email}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {ccList.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ccList.map((email) => (
                            <span key={email} className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full">
                              {email}
                              <button onClick={() => removeCc(email)} className="text-blue-400 hover:text-blue-600">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {message && <p className="text-xs text-red-500 mb-3">{message}</p>}
                  </div>
                )}
              </div>

              {step === 2 && (
                <div className="p-4 border-t dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-b-2xl">
                  <button onClick={handleSubmitRequest} disabled={loading}
                    className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm disabled:opacity-50">
                    {loading ? '요청 중...' : '결재 요청'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => { setShowRequestModal(true); setStep(1); setMessage('') }}
        className="fixed bottom-24 right-4 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg z-40 text-sm font-medium">
        + 결재 요청
      </button>
    </div>
  )
}
