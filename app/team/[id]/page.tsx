'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import { isHoliday, isPublicHoliday, fetchSubstituteHolidays } from '@/app/lib/holidays'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import { getMonthRange, getSettlementPeriod, getWeekRange, getWeeksOfMonth } from '@/app/lib/dates'
import { calcWorkHours } from '@/app/lib/workTime'
import { displayName } from '@/app/lib/labels'
import LoadError from '@/app/components/ui/LoadError'
import type {
  CommutePlan,
  RemoteWork,
  Team,
  TeamMember,
  TeamRequest,
  Vacation,
  WithProfile,
  WorkLog,
} from '@/app/lib/types'
import Card from '@/app/components/ui/Card'
import StatCard from '@/app/components/ui/StatCard'

export default function TeamDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const { user } = useCurrentUser()
  const [team, setTeam] = useState<Team | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [members, setMembers] = useState<WithProfile<TeamMember>[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [requests, setRequests] = useState<WithProfile<TeamRequest>[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [memberLogs, setMemberLogs] = useState<{ [key: string]: WorkLog[] }>({})
  const [memberWeeklyLogs, setMemberWeeklyLogs] = useState<{ [key: string]: WorkLog[] }>({})
  const [vacations, setVacations] = useState<WithProfile<Vacation>[]>([])
  const [selectedWeek, setSelectedWeek] = useState<{ [key: string]: Date }>({})
  const [periodMode, setPeriodMode] = useState<'calendar' | 'custom'>('calendar')
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null)
  const [weekCommutePlans, setWeekCommutePlans] = useState<{
    [key: string]: WithProfile<CommutePlan>[]
  }>({})
  const [selectedCommuteWeek, setSelectedCommuteWeek] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [remoteWorks, setRemoteWorks] = useState<WithProfile<RemoteWork>[]>([])
  const [selectedRemoteDate, setSelectedRemoteDate] = useState<Date | null>(null)
  const [isMaster, setIsMaster] = useState(false)
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])

  const getPeriod = () => {
    const now = dayjs(calendarMonth)
    if (periodMode === 'calendar') {
      return {
        ...getMonthRange(calendarMonth),
        label: `${now.format('MM')}월 1일 ~ ${now.endOf('month').format('DD')}일`,
      }
    } else {
      // 달력이 표시 중인 "월"을 기준으로 고정: 전월 16일 ~ 해당 월 15일
      const { start, end } = getSettlementPeriod(calendarMonth)
      return {
        start,
        end,
        label: `${dayjs(start).format('MM')}월 16일 ~ ${dayjs(end).format('MM')}월 15일`,
      }
    }
  }

  useEffect(() => {
    fetchSubstituteHolidays().then(setSubstituteHolidays)
  }, [])

  useEffect(() => {
    if (user) fetchTeamData(user.id)
  }, [user])
  useEffect(() => {
    const handleFocus = () => {
      if (user) fetchTeamData(user.id)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user])

  useEffect(() => {
    if (members.length > 0) {
      fetchMonthlyLogs(members)
    }
  }, [calendarMonth, periodMode])

  useEffect(() => {
    if (members.length > 0) fetchCommutePlans(members)
  }, [calendarMonth, members])

  useEffect(() => {
    if (expandedUser && members.length > 0) {
      const member = members.find((m) => m.user_id === expandedUser)
      if (member) fetchWeeklyLogsForMember(member.user_id)
    }
  }, [selectedWeek, expandedUser])

  const fetchCommutePlans = async (memberData: WithProfile<TeamMember>[]) => {
    const { data: commutePlanData } = await supabase
      .from('commute_plans')
      .select('*, profiles(name, email)')
      .in(
        'user_id',
        memberData.map((m) => m.user_id)
      )
      .returns<WithProfile<CommutePlan>[]>()

    const plans: { [key: string]: WithProfile<CommutePlan>[] } = {}
    if (commutePlanData) {
      commutePlanData.forEach((p) => {
        const key = String(p.week_number)
        if (!plans[key]) plans[key] = []
        plans[key].push(p)
      })
    }
    setWeekCommutePlans(plans)
  }

  const fetchTeamData = async (userId: string) => {
    setLoadFailed(false)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_master')
      .eq('id', userId)
      .single()
    if (profileData?.is_master) {
      setIsMaster(true)
      setIsAdmin(true) // 마스터는 자동으로 팀장 권한
    }

    const { data: teamData } = await supabase.from('teams').select('*').eq('id', id).single()
    if (teamData) setTeam(teamData)

    const { data: memberData, error: memberError } = await supabase
      .from('team_members')
      .select('*, profiles(id, email, name)')
      .eq('team_id', id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<WithProfile<TeamMember>[]>()

    if (memberError) {
      // 팀원 조회가 막히면 팀이 비어 보인다. 다른 팀 페이지를 열었을 때와 구분되지 않는다.
      setLoadFailed(true)
      return
    }
    if (memberData) {
      setMembers(memberData)
      const myRole = memberData.find((m) => m.user_id === userId)
      if (myRole?.role === 'admin') setIsAdmin(true)
      fetchMonthlyLogs(memberData)

      fetchCommutePlans(memberData)
    }

    const { data: requestData } = await supabase
      .from('team_requests')
      .select('*, profiles(email, name)')
      .eq('team_id', id)
      .eq('status', 'pending')
      .returns<WithProfile<TeamRequest>[]>()
    if (requestData) setRequests(requestData)

    const { data: vacationData } = await supabase
      .from('vacations')
      .select('*, profiles(id, email, name)')
      .in('user_id', memberData?.map((m) => m.user_id) || [])
      .returns<WithProfile<Vacation>[]>()
    if (vacationData) setVacations(vacationData)

    const { data: remoteData } = await supabase
      .from('remote_works')
      .select('*, profiles(id, email, name)')
      .in('user_id', memberData?.map((m) => m.user_id) || [])
      .returns<WithProfile<RemoteWork>[]>()
    if (remoteData) setRemoteWorks(remoteData)
  }

  const fetchMonthlyLogs = async (memberData: WithProfile<TeamMember>[]) => {
    const { start, end } = getPeriod()
    const logs: { [key: string]: WorkLog[] } = {}
    for (const member of memberData) {
      const { data } = await supabase
        .from('work_logs')
        .select('*')
        .eq('user_id', member.user_id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
      logs[member.user_id] = data || []
    }
    setMemberLogs(logs)
  }

  const fetchWeeklyLogsForMember = async (userId: string) => {
    const week = selectedWeek[userId] || new Date()
    const { start, end } = getWeekRange(week)
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    setMemberWeeklyLogs((prev) => ({ ...prev, [userId]: data || [] }))
  }

  const calcHours = (log: WorkLog) => calcWorkHours(log).toFixed(2)

  const sortByMemberOrder = <T extends { user_id: string }>(list: T[]): T[] => {
    return [...list].sort((a, b) => {
      const ai = members.findIndex((m) => m.user_id === a.user_id)
      const bi = members.findIndex((m) => m.user_id === b.user_id)
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi)
    })
  }

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.user_id === userId)
    return displayName(member?.profiles)
  }

  const getMonthlyStats = (userId: string) => {
    const logs = memberLogs[userId] || []
    return logs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0).toFixed(2)
  }

  const getWeeklyStats = (userId: string) => {
    const logs = memberWeeklyLogs[userId] || []
    const total = logs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    const weekday = logs
      .filter((log) => !isHoliday(new Date(log.date), substituteHolidays))
      .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    const holiday = logs
      .filter((log) => isHoliday(new Date(log.date), substituteHolidays))
      .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    return { total, weekday, holiday }
  }

  const getVacationsOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return sortByMemberOrder(vacations.filter((v) => v.date === dateStr))
  }

  const getRemoteOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return sortByMemberOrder(remoteWorks.filter((r) => r.date === dateStr))
  }

  const getTileContent = ({ date }: { date: Date }) => {
    const dayVacations = getVacationsOnDate(date)
    const dayRemotes = getRemoteOnDate(date)
    if (dayVacations.length === 0 && dayRemotes.length === 0) return null
    return (
      <div className="flex justify-center gap-0.5 mt-0.5">
        {dayVacations.length > 0 && (
          <span className="text-[9px] bg-orange-100 text-orange-600 rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {dayVacations.length}
          </span>
        )}
        {dayRemotes.length > 0 && (
          <span className="text-[9px] bg-indigo-100 text-indigo-600 rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {dayRemotes.length}
          </span>
        )}
      </div>
    )
  }
  const getTileClassName = ({ date }: { date: Date }) => {
    const day = date.getDay()
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    const isSubstitute = substituteHolidays.includes(dateStr)
    if (day === 6) return '!text-blue-500 font-semibold'
    if (day === 0 || isPublicHoliday(date) || isSubstitute) return '!text-red-500 font-semibold'
    return ''
  }

  const handleApprove = async (requestId: string, userId: string) => {
    if (!user) return
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', id)
      .eq('user_id', userId)
      .single()
    if (!existing) {
      await supabase.from('team_members').insert({
        team_id: id,
        user_id: userId,
        role: 'member',
      })
    }
    await supabase.from('team_requests').update({ status: 'approved' }).eq('id', requestId)
    fetchTeamData(user.id)
  }

  const handleReject = async (requestId: string) => {
    if (!user) return
    await supabase.from('team_requests').update({ status: 'rejected' }).eq('id', requestId)
    fetchTeamData(user.id)
  }

  const handleExpandMember = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
    } else {
      setExpandedUser(userId)
      if (!selectedWeek[userId]) {
        setSelectedWeek((prev) => ({ ...prev, [userId]: new Date() }))
      }
      fetchWeeklyLogsForMember(userId)
    }
  }

  const changeWeek = (userId: string, direction: number) => {
    const current = selectedWeek[userId] || new Date()
    const newWeek = dayjs(current).add(direction, 'week').toDate()
    setSelectedWeek((prev) => ({ ...prev, [userId]: newWeek }))
  }

  const { label } = getPeriod()

  return (
    <main className="grow bg-gray-50 dark:bg-zinc-900 p-2 pb-6">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">{team?.name}</h1>
          <div className="flex gap-3">
            {(isAdmin || isMaster) && (
              <button
                onClick={() => router.push(`/team/${id}/manage`)}
                className="text-sm text-blue-500 hover:underline"
              >
                팀 관리
              </button>
            )}
            <button
              onClick={() => router.push('/team')}
              className="text-sm text-gray-500 dark:text-zinc-400 hover:underline"
            >
              ← 팀 목록
            </button>
          </div>
        </header>

        {loadFailed && (
          <LoadError
            message="팀 정보를 불러오지 못했습니다."
            onRetry={() => user && fetchTeamData(user.id)}
            className="mb-4"
          />
        )}

        {/* 가입 신청 (팀장만) */}
        {(isAdmin || isMaster) && requests.length > 0 && (
          <div className="mb-4 rounded-xl border-l-4 border-amber-400 bg-white p-4 shadow dark:bg-zinc-800">
            <h2 className="font-semibold mb-3 dark:text-white">가입 신청 ({requests.length})</h2>
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex justify-between items-center py-2 border-b dark:border-zinc-700 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium dark:text-zinc-200">
                    {req.profiles?.name || '이름 미설정'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{req.profiles?.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(req.id, req.user_id)}
                    className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    className="text-xs bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 달력 */}
        <Card padding="p-3" className="mb-4">
          <h2 className="font-semibold mb-3 dark:text-white">팀 캘린더</h2>
          <div className="flex flex-col gap-3">
            {/* 달력 + 시차출근 버튼 */}
            <div className="flex items-start gap-2 ">
              <div className="min-w-0">
                <Calendar
                  onClickDay={(date) => {
                    setSelectedCalendarDate(date)
                    setSelectedRemoteDate(date)
                    setSelectedCommuteWeek(null)
                  }}
                  onActiveStartDateChange={({ activeStartDate }) => {
                    if (activeStartDate) setCalendarMonth(activeStartDate)
                  }}
                  tileContent={getTileContent}
                  tileClassName={getTileClassName}
                  locale="ko-KR"
                />
              </div>

              {/* 주차별 시차출근 버튼. 달력 주 행에 맞춘 열이라 머리말이 없으면
                  무엇인지 알 수 없다. 비워두던 위쪽 여백을 라벨로 채운다. */}
              <div className="flex flex-col shrink-0">
                <div className="h-[74px] sm:h-[90px] flex items-end justify-center pb-1">
                  <span className="text-[10px] leading-tight text-center text-gray-500 dark:text-zinc-400">
                    시차
                    <br />
                    출근
                  </span>
                </div>
                {getWeeksOfMonth(calendarMonth).map((weekStart, index) => {
                  const weekNumber = String(index + 1)
                  return (
                    <div key={weekNumber} className="flex items-center justify-center h-8 sm:h-11">
                      <button
                        onClick={() =>
                          setSelectedCommuteWeek(
                            selectedCommuteWeek === weekNumber ? null : weekNumber
                          )
                        }
                        className={`text-[12px] px-1 py-1.5 rounded-lg border transition ${
                          selectedCommuteWeek === weekNumber
                            ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-white dark:bg-zinc-700 text-purple-400 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                        }`}
                      >
                        시차
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 리스트 - 달력 아래 */}
            {(selectedCalendarDate || selectedRemoteDate || selectedCommuteWeek) && (
              <div className="border-t dark:border-zinc-700 pt-3">
                {selectedCommuteWeek && (
                  <div>
                    <p className="text-sm font-semibold mb-2 dark:text-zinc-200">
                      {(() => {
                        const weeks = getWeeksOfMonth(calendarMonth)
                        const idx = parseInt(selectedCommuteWeek) - 1
                        const weekStart = weeks[idx]
                        if (!weekStart) return ''
                        return `${weekStart.format('MM/DD')} ~ ${weekStart.endOf('isoWeek').format('MM/DD')}`
                      })()}
                    </p>
                    <div className="flex gap-4">
                      {['8시', '9시'].map((time) => {
                        const planners = (weekCommutePlans[selectedCommuteWeek] || []).filter(
                          (p) => p.commute_time === time
                        )
                        return (
                          <div key={time} className="flex-1">
                            <p
                              className={`text-base font-semibold mb-1 ${
                                time === '8시' ? 'text-blue-500' : 'text-green-500'
                              }`}
                            >
                              {time}
                            </p>
                            <div className="min-h-[40px]">
                              {planners.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-zinc-500">없음</p>
                              ) : (
                                sortByMemberOrder(planners).map((p) => (
                                  <p key={p.id} className="text-base py-0.5 dark:text-zinc-200">
                                    {displayName(p.profiles)}
                                  </p>
                                ))
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => setSelectedCommuteWeek(null)}
                      className="text-xs text-gray-400 dark:text-zinc-500 hover:underline mt-2"
                    >
                      닫기
                    </button>
                  </div>
                )}

                {(selectedCalendarDate || selectedRemoteDate) && !selectedCommuteWeek && (
                  <div>
                    <p className="text-sm font-semibold mb-2 dark:text-zinc-200">
                      {dayjs(selectedCalendarDate || selectedRemoteDate!).format('MM월 DD일')}
                    </p>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <p className="text-base font-semibold text-orange-500 mb-1">휴가</p>
                        {getVacationsOnDate(selectedCalendarDate || selectedRemoteDate!).length ===
                        0 ? (
                          <p className="text-xs text-gray-400 dark:text-zinc-500">없음</p>
                        ) : (
                          getVacationsOnDate(selectedCalendarDate || selectedRemoteDate!).map(
                            (v) => (
                              <div key={v.id} className="flex items-center gap-1 mb-1">
                                <p className="text-base font-medium dark:text-zinc-200">
                                  {getMemberName(v.user_id)}
                                </p>
                                <p className="text-[13px] text-orange-400">
                                  {v.type === 'annual'
                                    ? '연차'
                                    : v.type === 'special'
                                      ? '특휴/대휴'
                                      : v.type === 'morning'
                                        ? '오전반차'
                                        : '오후반차'}
                                </p>
                              </div>
                            )
                          )
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-indigo-500 mb-1">원격근무</p>
                        {getRemoteOnDate(selectedCalendarDate || selectedRemoteDate!).length ===
                        0 ? (
                          <p className="text-xs text-gray-400 dark:text-zinc-500">없음</p>
                        ) : (
                          getRemoteOnDate(selectedCalendarDate || selectedRemoteDate!).map((r) => (
                            <p key={r.id} className="text-base py-0.5 dark:text-zinc-200">
                              {getMemberName(r.user_id)}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCalendarDate(null)
                        setSelectedRemoteDate(null)
                      }}
                      className="text-xs text-gray-400 dark:text-zinc-500 hover:underline mt-2"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* 팀원 리스트 */}
        <Card>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">팀원 근무시간</h2>
            <div className="flex bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5">
              <button
                onClick={() => setPeriodMode('calendar')}
                className={`text-xs px-3 py-1 rounded-md transition ${
                  periodMode === 'calendar'
                    ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                    : 'text-gray-500 dark:text-zinc-400'
                }`}
              >
                1일~말일
              </button>
              <button
                onClick={() => setPeriodMode('custom')}
                className={`text-xs px-3 py-1 rounded-md transition ${
                  periodMode === 'custom'
                    ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                    : 'text-gray-500 dark:text-zinc-400'
                }`}
              >
                16일~15일
              </button>
            </div>
          </div>
          {/*<p className="text-base text-gray-400 mb-3 text-right">{label}</p>*/}

          {members.map((member) => {
            const isExpanded = expandedUser === member.user_id
            const weeklyStats = getWeeklyStats(member.user_id)
            const currentWeek = selectedWeek[member.user_id] || new Date()

            return (
              <div key={member.user_id} className="border-b dark:border-zinc-700 last:border-0">
                <div
                  className="flex justify-between items-center py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-1"
                  onClick={() => handleExpandMember(member.user_id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium dark:text-white">
                      {displayName(member.profiles)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        member.role === 'admin'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400'
                      }`}
                    >
                      {member.role === 'admin' ? '팀장' : '팀원'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">
                        {label}
                      </p>
                      <p className="font-bold text-blue-500">
                        {getMonthlyStats(member.user_id)}시간
                      </p>
                    </div>
                    <span className="text-sm text-gray-400 dark:text-zinc-500">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pb-4 px-1">
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 mb-2">
                        주간 근무시간
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeWeek(member.user_id, -1)}
                          className="px-3 py-1 bg-gray-100 dark:bg-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
                        >
                          ◀
                        </button>
                        <span className="text-sm font-semibold flex-1 text-center text-gray-700 dark:text-zinc-300">
                          {dayjs(currentWeek).startOf('isoWeek').format('MM/DD')} ~{' '}
                          {dayjs(currentWeek).endOf('isoWeek').format('MM/DD')}
                        </span>
                        <button
                          onClick={() => changeWeek(member.user_id, 1)}
                          className="px-3 py-1 bg-gray-100 dark:bg-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
                        >
                          ▶
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-3">
                      <StatCard
                        label="전체"
                        tone="blue"
                        value={`${weeklyStats.total.toFixed(2)}시간`}
                      />
                      <StatCard
                        label="평일"
                        tone="green"
                        value={`${weeklyStats.weekday.toFixed(2)}시간`}
                      />
                      <StatCard
                        label="휴일"
                        tone="orange"
                        value={`${weeklyStats.holiday.toFixed(2)}시간`}
                      />
                    </div>

                    {(isAdmin || isMaster) && (
                      <div className="bg-gray-50 dark:bg-zinc-700 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2 font-semibold">
                          일별 상세
                        </p>
                        {(memberWeeklyLogs[member.user_id] || []).length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-zinc-500">
                            이 주 기록이 없어요.
                          </p>
                        ) : (
                          memberWeeklyLogs[member.user_id].map((log) => (
                            <div
                              key={log.id}
                              className="flex justify-between text-sm py-1 border-b dark:border-zinc-600 last:border-0 dark:text-zinc-300"
                            >
                              <span>{dayjs(log.date).format('MM/DD (ddd)')}</span>
                              <span>
                                {log.start_time.slice(0, 5)} ~ {log.end_time.slice(0, 5)}
                              </span>
                              <span className="font-semibold">{calcHours(log)}시간</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      </div>
    </main>
  )
}
