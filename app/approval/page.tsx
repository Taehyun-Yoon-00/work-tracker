'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import DatePicker from 'react-multi-date-picker'

export default function ApprovalPage() {
    const router = useRouter()

    const [user, setUser] = useState<any>(null)
    const [requests, setRequests] = useState<any[]>([])
    const [filterStatus, setFilterStatus] = useState<string>('all')

    const [showRequestModal, setShowRequestModal] = useState(false)
    const [step, setStep] = useState(1)

    const [requestType, setRequestType] = useState<string>('')

    const [dateGroups, setDateGroups] = useState<
        {
            dates: string[]
            vacationType: string
        }[]
    >([])

    const [selectedApprover, setSelectedApprover] = useState<string>('')
    const [selectedTeamId, setSelectedTeamId] = useState<string>('')

    const [approvers, setApprovers] = useState<any[]>([])
    const [myTeams, setMyTeams] = useState<any[]>([])

    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [selectedRequest, setSelectedRequest] = useState<any>(null)

    const [memo, setMemo] = useState('')

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

            fetchRequests(user.id)
            fetchMyTeams(user.id)
        }

        getUser()
    }, [])

    const fetchRequests = async (userId: string) => {
        const { data } = await supabase
            .from('approval_requests')
            .select(`
                *,
                requester:profiles!approval_requests_requester_id_fkey(name,email),
                approver:profiles!approval_requests_approver_id_fkey(name,email),
                teams(name)
            `)
            .or(`requester_id.eq.${userId},approver_id.eq.${userId}`)
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

    const handleSubmitRequest = async () => {
        if (!requestType || !selectedApprover || !selectedTeamId) {
            setMessage('모든 항목을 입력해주세요.')
            return
        }

        if (dateGroups.length === 0) {
            setMessage('날짜를 추가해주세요.')
            return
        }

        const flattenedEntries = dateGroups.flatMap((group) =>
            group.dates.map((date) => ({
                date,
                vacationType: group.vacationType,
            }))
        )

        if (flattenedEntries.length === 0) {
            setMessage('날짜를 선택해주세요.')
            return
        }

        setLoading(true)
        setMessage('')

        const { error } = await supabase
            .from('approval_requests')
            .insert({
                requester_id: user.id,
                approver_id: selectedApprover,
                team_id: selectedTeamId,

                type: requestType,

                date: flattenedEntries[0].date,

                dates: flattenedEntries.map((e) => e.date),

                date_entries: flattenedEntries,

                memo: requestType === 'vacation' ? memo : null,
            })

        if (error) {
            setMessage('요청 실패: ' + error.message)
        } else {
            resetModal()
            fetchRequests(user.id)
        }

        setLoading(false)
    }

    const handleApprove = async (
        requestId: string,
        status: string
    ) => {
        await supabase
            .from('approval_requests')
            .update({ status })
            .eq('id', requestId)

        setSelectedRequest(null)

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
    }

    const filteredRequests = requests.filter((r) => {
        if (filterStatus === 'all') return true

        return r.status === filterStatus
    })

    const statusLabel = (status: string) => {
        if (status === 'pending') {
            return {
                text: '승인 대기중',
                color: 'text-yellow-500 bg-yellow-50',
            }
        }

        if (status === 'approved') {
            return {
                text: '승인',
                color: 'text-green-500 bg-green-50',
            }
        }

        if (status === 'rejected') {
            return {
                text: '반려',
                color: 'text-red-500 bg-red-50',
            }
        }

        return {
            text: status,
            color: '',
        }
    }

    const vacationTypeLabel = (type: string) => {
        if (type === 'annual') return '연차'
        if (type === 'morning') return '오전반차'
        if (type === 'afternoon') return '오후반차'
        if (type === 'special') return '특휴/대휴'

        return type
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-28">
            <div className="max-w-2xl mx-auto">


                {/* 헤더 */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">결재</h1>
                    <div className="flex gap-3">
                        <button onClick={handleLogout}
                            className="text-sm text-gray-500 hover:underline">
                            로그아웃
                        </button>
                    </div>
                </div>

                {/* 필터 */}
                <div className="flex bg-gray-100 rounded-lg p-0.5 mb-4">
                    {[
                        { value: 'all', label: '전체' },
                        { value: 'pending', label: '대기중' },
                        { value: 'approved', label: '승인' },
                        { value: 'rejected', label: '반려' },
                    ].map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setFilterStatus(value)}
                            className={`flex-1 text-xs py-1.5 rounded-md transition ${filterStatus === value
                                ? 'bg-white shadow text-blue-500 font-semibold'
                                : 'text-gray-500'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* 리스트 */}
                <div className="bg-white rounded-xl shadow p-4">
                    {filteredRequests.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                            결재 요청이 없어요.
                        </p>
                    ) : (
                        filteredRequests.map((req) => {
                            const isApprover =
                                req.approver_id === user?.id

                            const status = statusLabel(req.status)

                            return (
                                <div
                                    key={req.id}
                                    onClick={() => setSelectedRequest(req)}
                                    className="py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium">
                                                    {req.requester?.name ||
                                                        req.requester?.email?.split('@')[0]}
                                                </span>

                                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                    {req.type === 'remote'
                                                        ? '원격근무'
                                                        : '휴가'}
                                                </span>
                                            </div>

                                            <p className="text-xs text-gray-400">
                                                {req.dates &&
                                                    req.dates.length > 1
                                                    ? `${dayjs(req.dates[0]).format('MM/DD')} 외 ${req.dates.length - 1
                                                    }일`
                                                    : dayjs(req.date).format(
                                                        'YYYY년 MM월 DD일'
                                                    )}
                                            </p>

                                            <p className="text-xs text-gray-400">
                                                결재권자:{' '}
                                                {req.approver?.name ||
                                                    req.approver?.email?.split('@')[0]}
                                            </p>

                                            {req.memo && (
                                                <p className="text-xs text-gray-400">
                                                    사유: {req.memo}
                                                </p>
                                            )}
                                        </div>

                                        <span
                                            className={`text-xs px-2 py-1 rounded-full ${status.color}`}
                                        >
                                            {status.text}
                                        </span>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* 승인 모달 */}
                {selectedRequest && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl p-6 w-full max-w-sm">

                            <h3 className="font-semibold mb-3">
                                결재 처리
                            </h3>

                            <div className="mb-4 text-sm text-gray-600 space-y-2">

                                <p>
                                    <span className="font-medium">
                                        신청자:
                                    </span>{' '}
                                    {selectedRequest.requester?.name}
                                </p>

                                <div>
                                    <span className="font-medium">
                                        날짜:
                                    </span>

                                    <ul className="mt-2 space-y-1">
                                        {selectedRequest.date_entries?.map(
                                            (entry: any, i: number) => (
                                                <li
                                                    key={i}
                                                    className="text-xs"
                                                >
                                                    {dayjs(entry.date).format(
                                                        'MM월 DD일'
                                                    )}

                                                    {selectedRequest.type ===
                                                        'vacation' && (
                                                            <span className="ml-1 text-orange-500">
                                                                (
                                                                {vacationTypeLabel(
                                                                    entry.vacationType
                                                                )}
                                                                )
                                                            </span>
                                                        )}
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </div>

                                {selectedRequest.memo && (
                                    <p>
                                        <span className="font-medium">
                                            사유:
                                        </span>{' '}
                                        {selectedRequest.memo}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {/* 결재권자만 버튼 표시 */}
                                {selectedRequest.approver_id === user?.id && (
                                    <>
                                        {selectedRequest.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() =>
                                                        handleApprove(selectedRequest.id, 'approved')
                                                    }
                                                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 text-sm"
                                                >
                                                    승인
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        handleApprove(selectedRequest.id, 'rejected')
                                                    }
                                                    className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 text-sm"
                                                >
                                                    반려
                                                </button>
                                            </>
                                        )}

                                        {selectedRequest.status === 'approved' && (
                                            <button
                                                onClick={() =>
                                                    handleApprove(selectedRequest.id, 'pending')
                                                }
                                                className="flex-1 bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600 text-sm"
                                            >
                                                승인 취소
                                            </button>
                                        )}

                                        {selectedRequest.status === 'rejected' && (
                                            <button
                                                onClick={() =>
                                                    handleApprove(selectedRequest.id, 'pending')
                                                }
                                                className="flex-1 bg-yellow-500 text-white py-2 rounded-lg hover:bg-yellow-600 text-sm"
                                            >
                                                반려 취소
                                            </button>
                                        )}
                                    </>
                                )}

                                <button
                                    onClick={() => setSelectedRequest(null)}
                                    className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg hover:bg-gray-200 text-sm"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 요청 모달 */}
                {showRequestModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">

                        <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">

                            <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md my-4 sm:my-8">

                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold">
                                        결재 요청
                                    </h3>

                                    <button
                                        onClick={resetModal}
                                        className="text-gray-400 text-lg"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* STEP1 */}
                                {step === 1 && (
                                    <div>
                                        <p className="text-sm text-gray-500 mb-3">
                                            요청 유형을 선택해주세요
                                        </p>

                                        <div className="flex gap-2">

                                            <button
                                                onClick={() => {
                                                    setRequestType('vacation')
                                                    setStep(2)
                                                }}
                                                className="flex-1 py-3 border-2 rounded-xl"
                                            >
                                                🌴 휴가
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setRequestType('remote')
                                                    setStep(2)
                                                }}
                                                className="flex-1 py-3 border-2 rounded-xl"
                                            >
                                                💻 원격근무
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP2 */}
                                {step === 2 && (
                                    <div>

                                        <button
                                            onClick={() => setStep(1)}
                                            className="text-xs text-gray-400 mb-3"
                                        >
                                            ← 뒤로
                                        </button>

                                        {/* 팀 */}
                                        <div className="mb-3">
                                            <label className="text-sm text-gray-500">
                                                팀 선택
                                            </label>

                                            <select
                                                value={selectedTeamId}
                                                onChange={(e) =>
                                                    fetchApprovers(
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"
                                            >
                                                <option value="">
                                                    팀 선택
                                                </option>

                                                {myTeams.map((t) => (
                                                    <option
                                                        key={t.team_id}
                                                        value={t.team_id}
                                                    >
                                                        {t.teams?.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* 결재권자 */}
                                        <div className="mb-4">
                                            <label className="text-sm text-gray-500">
                                                결재권자
                                            </label>

                                            <select
                                                value={selectedApprover}
                                                onChange={(e) =>
                                                    setSelectedApprover(
                                                        e.target.value
                                                    )
                                                }
                                                className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"
                                            >
                                                <option value="">
                                                    결재권자 선택
                                                </option>

                                                {approvers.map((a) => (
                                                    <option
                                                        key={a.user_id}
                                                        value={a.user_id}
                                                    >
                                                        {a.profiles?.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* 날짜 그룹 */}
                                        <div className="mb-4">

                                            <div className="flex justify-between items-center mb-2">

                                                <label className="text-sm text-gray-500">
                                                    날짜 선택
                                                </label>

                                                <button
                                                    onClick={() =>
                                                        setDateGroups([
                                                            ...dateGroups,
                                                            {
                                                                dates: [],
                                                                vacationType:
                                                                    'annual',
                                                            },
                                                        ])
                                                    }
                                                    className="text-xs text-blue-500"
                                                >
                                                    + 날짜 추가
                                                </button>
                                            </div>

                                            {dateGroups.map((group, index) => (
                                                <div
                                                    key={index}
                                                    className="mb-4 p-3 bg-gray-50 rounded-xl"
                                                >

                                                    <div className="flex justify-between items-center mb-2">

                                                        <span className="text-xs text-gray-500">
                                                            {index + 1}번째 그룹
                                                        </span>

                                                        <button
                                                            onClick={() =>
                                                                setDateGroups(
                                                                    dateGroups.filter(
                                                                        (_, i) =>
                                                                            i !==
                                                                            index
                                                                    )
                                                                )
                                                            }
                                                            className="text-xs text-red-400"
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>

                                                    {/* 복수 날짜 */}
                                                    <div className="w-full overflow-x-auto">
                                                        <DatePicker
                                                            multiple
                                                            portal
                                                            portalTarget={document.body}
                                                            zIndex={9999}
                                                            value={group.dates}
                                                            onChange={(dates: any) => {
                                                                const updated = [...dateGroups]

                                                                updated[index].dates = dates.map((d: any) =>
                                                                    d.format('YYYY-MM-DD')
                                                                )

                                                                setDateGroups(updated)
                                                            }}
                                                            format="YYYY-MM-DD"
                                                            className="w-full text-sm"
                                                        />
                                                    </div>

                                                    {/* 선택 날짜 */}
                                                    {group.dates.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-3">
                                                            {group.dates.map(
                                                                (d, i) => (
                                                                    <span
                                                                        key={i}
                                                                        className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full"
                                                                    >
                                                                        {dayjs(
                                                                            d
                                                                        ).format(
                                                                            'MM/DD'
                                                                        )}
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* 휴가 타입 */}
                                                    {requestType ===
                                                        'vacation' && (
                                                            <div className="flex gap-1 mt-3">

                                                                {[
                                                                    {
                                                                        value:
                                                                            'annual',
                                                                        label: '연차',
                                                                    },
                                                                    {
                                                                        value:
                                                                            'morning',
                                                                        label:
                                                                            '오전반차',
                                                                    },
                                                                    {
                                                                        value:
                                                                            'afternoon',
                                                                        label:
                                                                            '오후반차',
                                                                    },
                                                                    {
                                                                        value:
                                                                            'special',
                                                                        label:
                                                                            '특휴/대휴',
                                                                    },
                                                                ].map(
                                                                    ({
                                                                        value,
                                                                        label,
                                                                    }) => (
                                                                        <button
                                                                            key={value}
                                                                            onClick={() => {

                                                                                const updated =
                                                                                    [
                                                                                        ...dateGroups,
                                                                                    ]

                                                                                updated[
                                                                                    index
                                                                                ].vacationType =
                                                                                    value

                                                                                setDateGroups(
                                                                                    updated
                                                                                )
                                                                            }}
                                                                            className={`flex-1 py-1.5 rounded-lg text-xs border ${group.vacationType ===
                                                                                value
                                                                                ? 'bg-orange-500 text-white'
                                                                                : 'bg-white'
                                                                                }`}
                                                                        >
                                                                            {label}
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>
                                                        )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* 사유 */}
                                        {requestType === 'vacation' && (
                                            <div className="mb-4">
                                                <label className="text-sm text-gray-500">
                                                    휴가 사유
                                                </label>

                                                <input
                                                    type="text"
                                                    value={memo}
                                                    onChange={(e) =>
                                                        setMemo(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm"
                                                />
                                            </div>
                                        )}

                                        {message && (
                                            <p className="text-xs text-red-500 mb-3">
                                                {message}
                                            </p>
                                        )}

                                        <button
                                            onClick={handleSubmitRequest}
                                            disabled={loading}
                                            className="w-full bg-blue-500 text-white py-2 rounded-lg"
                                        >
                                            {loading
                                                ? '요청 중...'
                                                : '결재 요청'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 하단 버튼 */}
            <button
                onClick={() => {
                    setShowRequestModal(true)
                    setStep(1)
                    setMessage('')
                }}
                className="fixed bottom-24 right-4 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg z-40"
            >
                + 결재 요청
            </button>
        </div>
    )
}