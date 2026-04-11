'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import Holidays from 'date-holidays'

const hd = new Holidays('KR')

export default function TeamDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [user, setUser] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [memberLogs, setMemberLogs] = useState<{ [key: string]: any[] }>({})
  const [memberWeeklyLogs, setMemberWeeklyLogs] = useState<{ [key: string]: any[] }>({})
  const [vacations, setVacations] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState<{ [key: string]: Date }>({})
  const [periodMode, setPeriodMode] = useState<'calendar' | 'custom'>('calendar')
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null)
  const [weekCommutePlans, setWeekCommutePlans] = useState<{ [key: string]: any[] }>({})
  const [selectedCommuteWeek, setSelectedCommuteWeek] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [remoteWorks, setRemoteWorks] = useState<any[]>([])
  const [selectedRemoteDate, setSelectedRemoteDate] = useState<Date | null>(null)

  const getPeriod = () => {
    const now = dayjs(calendarMonth)
    if (periodMode === 'calendar') {
      return {
        start: now.startOf('month').format('YYYY-MM-DD'),
        end: now.endOf('month').format('YYYY-MM-DD'),
        label: `${now.format('MM')}월 1일 ~ ${now.endOf('month').format('DD')}일`
      }
    } else {
      const start = now.date() >= 16
        ? now.startOf('month').date(16)
        : now.subtract(1, 'month').startOf('month').date(16)
      const end = now.date() >= 16
        ? now.add(1, 'month').startOf('month').date(15)
        : now.startOf('month').date(15)
      return {
        start: start.format('YYYY-MM-DD'),
        end: end.format('YYYY-MM-DD'),
        label: `${start.format('MM')}월 16일 ~ ${end.format('MM')}월 15일`
      }
    }
  }

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else {
        setUser(user)
        fetchTeamData(user.id)
      }
    }
    getUser()
  }, [])

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

const fetchCommutePlans = async (memberData: any[]) => {
  const { data: commutePlanData } = await supabase
    .from('commute_plans')
    .select('*, profiles(name, email)')
    .in('user_id', memberData.map((m) => m.user_id))
  
  const plans: { [key: string]: any[] } = {}
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
    const { data: teamData } = await supabase
      .from('teams').select('*').eq('id', id).single()
    if (teamData) setTeam(teamData)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*, profiles(id, email, name)')
      .eq('team_id', id)

    if (memberData) {
      setMembers(memberData)
      const myRole = memberData.find((m) => m.user_id === userId)
      setIsAdmin(myRole?.role === 'admin')
      fetchMonthlyLogs(memberData)

      fetchCommutePlans(memberData)

    
    }

    const { data: requestData } = await supabase
      .from('team_requests')
      .select('*, profiles(email, name)')
      .eq('team_id', id)
      .eq('status', 'pending')
    if (requestData) setRequests(requestData)

    const { data: vacationData } = await supabase
      .from('vacations')
      .select('*, profiles(id, email, name)')
      .in('user_id', memberData?.map((m) => m.user_id) || [])
    if (vacationData) setVacations(vacationData)

    const { data: remoteData } = await supabase
      .from('remote_works')
      .select('*, profiles(id, email, name)')
      .in('user_id', memberData?.map((m) => m.user_id) || [])
    if (remoteData) setRemoteWorks(remoteData)
  }

  const fetchMonthlyLogs = async (memberData: any[]) => {
    const { start, end } = getPeriod()
    const logs: { [key: string]: any[] } = {}
    for (const member of memberData) {
      const { data } = await supabase
        .from('work_logs').select('*')
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
    const start = dayjs(week).startOf('isoWeek').format('YYYY-MM-DD')
    const end = dayjs(week).endOf('isoWeek').format('YYYY-MM-DD')
    const { data } = await supabase
      .from('work_logs').select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
    setMemberWeeklyLogs((prev) => ({ ...prev, [userId]: data || [] }))
  }

  const calcHours = (log: any) => {
    const start = dayjs(`2000-01-01 ${log.start_time}`)
    const end = dayjs(`2000-01-01 ${log.end_time}`)
    const diff = end.diff(start, 'minute') - log.break_minutes
    return (diff / 60).toFixed(1)
  }

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.user_id === userId)
    return member?.profiles?.name || member?.profiles?.email?.split('@')[0] || '알 수 없음'
  }

  const isHoliday = (date: Date) => {
    const day = dayjs(date).day()
    if (day === 0 || day === 6) return true
    return !!hd.isHoliday(date)
  }

  const getMonthlyStats = (userId: string) => {
    const logs = memberLogs[userId] || []
    return logs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0).toFixed(1)
  }

  const getWeeklyStats = (userId: string) => {
    const logs = memberWeeklyLogs[userId] || []
    const total = logs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    const weekday = logs
      .filter((log) => !isHoliday(new Date(log.date)))
      .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    const holiday = logs
      .filter((log) => isHoliday(new Date(log.date)))
      .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
    return { total, weekday, holiday }
  }

  const getVacationsOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return vacations.filter((v) => v.date === dateStr)
  }

const getRemoteOnDate = (date: Date) => {
  const dateStr = dayjs(date).format('YYYY-MM-DD')
  return remoteWorks.filter((r) => r.date === dateStr)
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
    if (day === 6) return '!text-blue-500 font-semibold'
    if (day === 0) return '!text-red-500 font-semibold'
    if (hd.isHoliday(date)) return '!text-red-500 font-semibold'
    return ''
  }

  const getWeeks = (month: Date) => {
    const monthStart = dayjs(month).startOf('month')
    const monthEnd = dayjs(month).endOf('month')
    const firstWeekStart = monthStart.startOf('isoWeek')
    const weeks = []
    let current = firstWeekStart
    while (current.isBefore(monthEnd) || current.isSame(monthEnd, 'day')) {
      weeks.push(current)
      current = current.add(1, 'week')
    }
    return weeks
  }

  const handleApprove = async (requestId: string, userId: string) => {
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', id)
      .eq('user_id', userId)
      .single()
    if (!existing) {
      await supabase.from('team_members').insert({
        team_id: id, user_id: userId, role: 'member'
      })
    }
    await supabase.from('team_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
    fetchTeamData(user.id)
  }

  const handleReject = async (requestId: string) => {
    await supabase.from('team_requests')
      .update({ status: 'rejected' }).eq('id', requestId)
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
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{team?.name}</h1>
          <div className="flex gap-3">
            {isAdmin && (
              <button onClick={() => router.push(`/team/${id}/manage`)}
                className="text-sm text-blue-500 hover:underline">
                팀 관리
              </button>
            )}
            <button onClick={() => router.push('/team')}
              className="text-sm text-gray-500 hover:underline">
              ← 팀 목록
            </button>
          </div>
        </div>

        {/* 가입 신청 (팀장만) */}
        {isAdmin && requests.length > 0 && (
          <div className="bg-yellow-50 rounded-xl shadow p-4 mb-4">
            <h2 className="font-semibold mb-3">가입 신청 ({requests.length})</h2>
            {requests.map((req) => (
              <div key={req.id}
                className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{req.profiles?.name || '이름 미설정'}</p>
                  <p className="text-xs text-gray-400">{req.profiles?.email}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(req.id, req.user_id)}
                    className="text-xs bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600">
                    승인
                  </button>
                  <button onClick={() => handleReject(req.id)}
                    className="text-xs bg-gray-200 px-3 py-1 rounded-lg hover:bg-gray-300">
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

{/* 달력 */}
<div className="bg-white rounded-xl shadow p-3 mb-4">
  <h2 className="font-semibold mb-3">팀 캘린더</h2>
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

      {/* 주차별 시차출근 버튼 */}
      <div className="flex flex-col shrink-0 mt-8 sm:mt-[74px]">
        {getWeeks(calendarMonth).map((weekStart, index) => {
          const weekNumber = String(index + 1)
          return (
            <div key={weekNumber}
              className="flex items-center justify-center h-8 sm:h-11">
              <button
                onClick={() => setSelectedCommuteWeek(
                  selectedCommuteWeek === weekNumber ? null : weekNumber
                )}
                className={`text-[8px] px-1 py-0.5 rounded-full border transition ${
                  selectedCommuteWeek === weekNumber
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white text-purple-400 border-purple-300'
                }`}>
                시차
              </button>
            </div>
          )
        })}
      </div>
    </div>

    {/* 리스트 - 달력 아래 */}
    {(selectedCalendarDate || selectedRemoteDate || selectedCommuteWeek) && (
      <div className="border-t pt-3">
        {selectedCommuteWeek && (
          <div>
            <p className="text-sm font-semibold mb-2">
              {(() => {
                const weeks = getWeeks(calendarMonth)
                const idx = parseInt(selectedCommuteWeek) - 1
                const weekStart = weeks[idx]
                if (!weekStart) return ''
                return `${weekStart.format('MM/DD')} ~ ${weekStart.endOf('isoWeek').format('MM/DD')}`
              })()}
            </p>
            <div className="flex gap-4">
              {['8시', '9시'].map((time) => {
                const planners = (weekCommutePlans[selectedCommuteWeek] || [])
                  .filter((p) => p.commute_time === time)
                return (
                  <div key={time} className="flex-1">
                    <p className={`text-xs font-semibold mb-1 ${
                      time === '8시' ? 'text-blue-500' : 'text-green-500'
                    }`}>{time}</p>
                    <div className="min-h-[40px]">
                      {planners.length === 0 ? (
                        <p className="text-xs text-gray-400">없음</p>
                      ) : (
                        planners.map((p) => (
                          <p key={p.id} className="text-xs py-0.5">
                            {p.profiles?.name || p.profiles?.email?.split('@')[0]}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setSelectedCommuteWeek(null)}
              className="text-xs text-gray-400 hover:underline mt-2">
              닫기
            </button>
          </div>
        )}

        {(selectedCalendarDate || selectedRemoteDate) && !selectedCommuteWeek && (
          <div>
            <p className="text-sm font-semibold mb-2">
              {dayjs(selectedCalendarDate || selectedRemoteDate!).format('MM월 DD일')}
            </p>
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-orange-500 mb-1">휴가</p>
                {getVacationsOnDate(selectedCalendarDate || selectedRemoteDate!).length === 0 ? (
                  <p className="text-xs text-gray-400">없음</p>
                ) : (
                  getVacationsOnDate(selectedCalendarDate || selectedRemoteDate!).map((v) => (
                    <div key={v.id} className="mb-1">
                      <p className="text-xs font-medium">{getMemberName(v.user_id)}</p>
                      <p className="text-[10px] text-orange-400">
                        {v.type === 'annual' ? '연차' : v.type === 'morning' ? '오전반차' : '오후반차'}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-indigo-500 mb-1">원격근무</p>
                {getRemoteOnDate(selectedCalendarDate || selectedRemoteDate!).length === 0 ? (
                  <p className="text-xs text-gray-400">없음</p>
                ) : (
                  getRemoteOnDate(selectedCalendarDate || selectedRemoteDate!).map((r) => (
                    <p key={r.id} className="text-xs py-0.5">
                      {getMemberName(r.user_id)}
                    </p>
                  ))
                )}
              </div>
            </div>
            <button onClick={() => {
              setSelectedCalendarDate(null)
              setSelectedRemoteDate(null)
            }}
              className="text-xs text-gray-400 hover:underline mt-2">
              닫기
            </button>
          </div>
        )}
      </div>
    )}
  </div>
</div>

        {/* 팀원 리스트 */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">팀원 근무시간</h2>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setPeriodMode('calendar')}
                className={`text-xs px-3 py-1 rounded-md transition ${
                  periodMode === 'calendar'
                    ? 'bg-white shadow text-blue-500 font-semibold'
                    : 'text-gray-500'
                }`}>
                1일~말일
              </button>
              <button
                onClick={() => setPeriodMode('custom')}
                className={`text-xs px-3 py-1 rounded-md transition ${
                  periodMode === 'custom'
                    ? 'bg-white shadow text-blue-500 font-semibold'
                    : 'text-gray-500'
                }`}>
                16일~15일
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">{label}</p>

          {members.map((member) => {
            const isExpanded = expandedUser === member.user_id
            const weeklyStats = getWeeklyStats(member.user_id)
            const currentWeek = selectedWeek[member.user_id] || new Date()

            return (
              <div key={member.user_id} className="border-b last:border-0">
                <div
                  className="flex justify-between items-center py-3 cursor-pointer hover:bg-gray-50 px-1"
                  onClick={() => handleExpandMember(member.user_id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {member.profiles?.name || member.profiles?.email?.split('@')[0]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      member.role === 'admin'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {member.role === 'admin' ? '팀장' : '팀원'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-500">
                      {getMonthlyStats(member.user_id)}시간
                    </span>
                    <span className="text-sm text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pb-4 px-1">
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => changeWeek(member.user_id, -1)}
                        className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">
                        ◀
                      </button>
                      <span className="text-xs flex-1 text-center text-gray-500">
                        {dayjs(currentWeek).startOf('isoWeek').format('MM/DD')} ~{' '}
                        {dayjs(currentWeek).endOf('isoWeek').format('MM/DD')}
                      </span>
                      <button
                        onClick={() => changeWeek(member.user_id, 1)}
                        className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm">
                        ▶
                      </button>
                    </div>

                    <div className="flex gap-2 mb-3">
                      <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">전체</p>
                        <p className="text-lg font-bold text-blue-500">
                          {weeklyStats.total.toFixed(1)}시간
                        </p>
                      </div>
                      <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">평일</p>
                        <p className="text-lg font-bold text-green-500">
                          {weeklyStats.weekday.toFixed(1)}시간
                        </p>
                      </div>
                      <div className="flex-1 bg-orange-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">휴일</p>
                        <p className="text-lg font-bold text-orange-500">
                          {weeklyStats.holiday.toFixed(1)}시간
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-2 font-semibold">일별 상세</p>
                        {(memberWeeklyLogs[member.user_id] || []).length === 0 ? (
                          <p className="text-sm text-gray-400">이 주 기록이 없어요.</p>
                        ) : (
                          memberWeeklyLogs[member.user_id].map((log) => (
                            <div key={log.id}
                              className="flex justify-between text-sm py-1 border-b last:border-0">
                              <span>{dayjs(log.date).format('MM/DD (ddd)')}</span>
                              <span>{log.start_time} ~ {log.end_time}</span>
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
        </div>

      </div>
    </div>
  )
}