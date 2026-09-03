'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import { getWeeksOfMonth } from '../../lib/dates'
import {
  isHoliday as isHolidayShared,
  isPublicHoliday,
  fetchSubstituteHolidays,
} from '../../lib/holidays'
import { fetchTeamMembers, fetchDepartmentScope, type OrgMember } from '../../lib/orgOrder'

type ScopeMember = OrgMember
type FilterScope = 'department' | 'team'

export default function TeamDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [user, setUser] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [deptMembers, setDeptMembers] = useState<ScopeMember[]>([])
  const [filterScope, setFilterScope] = useState<FilterScope>('department')
  const [isAdmin, setIsAdmin] = useState(false)
  const [vacations, setVacations] = useState<any[]>([])
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null)
  const [weekCommutePlans, setWeekCommutePlans] = useState<{ [key: string]: any[] }>({})
  const [selectedCommuteWeek, setSelectedCommuteWeek] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [remoteWorks, setRemoteWorks] = useState<any[]>([])
  const [selectedRemoteDate, setSelectedRemoteDate] = useState<Date | null>(null)
  const [isMaster, setIsMaster] = useState(false)
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])
  // null = 확인 중, true = 열람 가능, false = 접근 불가(소속 인원 또는 상위 조직장이 아님)
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else {
        setUser(user)
        fetchTeamData(user.id)
      }
    }
    getUser()
    loadSubstituteHolidays()
  }, [])

  useEffect(() => {
    const handleFocus = () => {
      if (user) fetchTeamData(user.id)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user])

  // 팀에 소속된 부서가 있으면 기본은 "부서 전체"가 보이도록 하고, 부서가 없으면 "내 팀만" 강제
  useEffect(() => {
    if (!team?.department_id) setFilterScope('team')
  }, [team?.department_id])

  const fetchTeamData = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_master')
      .eq('id', userId)
      .single()
    const masterFlag = !!profileData?.is_master
    const { data: generalAdminRow } = await supabase
      .from('general_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (masterFlag || generalAdminRow) {
      setIsMaster(true) // 마스터/총괄 관리자는 자동으로 팀장 권한
      setIsAdmin(true)
    }

    const { data: teamData } = await supabase
      .from('teams')
      .select('*, departments(id, name, head_user_id, division_id, divisions(head_user_id))')
      .eq('id', id)
      .single()
    if (teamData) setTeam(teamData)

    // 정렬/조회 규칙은 lib/orgOrder에 모아둔 공용 로직을 그대로 쓴다 — 조직관리, 대시보드와
    // 항상 같은 순서(팀장이 팀 안에서 항상 최상단, 나머지는 display_order 순서)를 보장한다.
    const teamMembersList = await fetchTeamMembers(String(id))
    setMembers(teamMembersList)
    const myRole = teamMembersList.find((m) => m.user_id === userId)
    if (myRole?.isHead) setIsAdmin(true)
    const isMember = !!myRole
    let unionUserIds: string[] = teamMembersList.map((m) => m.user_id)

    // 열람 권한: 팀 소속 인원 본인, 이 팀이 속한 부서의 부서장, 그 부서가 속한 부문의 부문장,
    // 총괄 관리자, 시스템 관리자(마스터)만 볼 수 있다. 그 외에는 접근을 차단한다.
    const deptHeadId = teamData?.departments?.head_user_id
    const divisionHeadId = teamData?.departments?.divisions?.head_user_id
    const canViewAsOrgHead = deptHeadId === userId || divisionHeadId === userId
    setAuthorized(masterFlag || !!generalAdminRow || isMember || canViewAsOrgHead)

    // 부서 전체 스코프: 같은 부서의 다른 팀 + 부서 직접 소속 인원까지 모아둔다.
    // 표시 순서는 조직관리와 동일한 공용 규칙(부서장 최상단 → 부서 직속 → 팀 순서대로,
    // 각 팀은 팀장이 최상단)을 그대로 따른다.
    if (teamData?.department_id) {
      const scope = await fetchDepartmentScope(teamData.department_id)
      setDeptMembers(scope.allMembers)
      unionUserIds = Array.from(new Set([...unionUserIds, ...scope.allMembers.map((m) => m.user_id)]))
    } else {
      setDeptMembers([])
    }

    if (unionUserIds.length > 0) {
      const [{ data: vacationData }, { data: remoteData }] = await Promise.all([
        supabase
          .from('vacations')
          .select('*, profiles(id, email, name)')
          .in('user_id', unionUserIds),
        supabase
          .from('remote_works')
          .select('*, profiles(id, email, name)')
          .in('user_id', unionUserIds),
      ])
      if (vacationData) setVacations(vacationData)
      if (remoteData) setRemoteWorks(remoteData)
      fetchCommutePlans(unionUserIds)
    } else {
      setVacations([])
      setRemoteWorks([])
      setWeekCommutePlans({})
    }
  }

  const fetchCommutePlans = async (userIds: string[]) => {
    const { data: commutePlanData } = await supabase
      .from('commute_plans')
      .select('*, profiles(name, email)')
      .in('user_id', userIds)

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

  const loadSubstituteHolidays = async () => {
    setSubstituteHolidays(await fetchSubstituteHolidays())
  }

  // 현재 필터 범위(부서 전체 / 내 팀만)에 해당하는 인원 목록
  const scopeMembers: ScopeMember[] =
    filterScope === 'team' || deptMembers.length === 0 ? members : deptMembers
  const scopeUserIds = new Set(scopeMembers.map((m) => m.user_id))

  const sortByMemberOrder = <T extends { user_id: string }>(list: T[]): T[] => {
    return [...list].sort((a, b) => {
      const ai = scopeMembers.findIndex((m) => m.user_id === a.user_id)
      const bi = scopeMembers.findIndex((m) => m.user_id === b.user_id)
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi)
    })
  }

  const getMemberName = (userId: string) => {
    const member = scopeMembers.find((m) => m.user_id === userId)
    return member?.name || '알 수 없음'
  }

  const isHoliday = (date: Date) => isHolidayShared(date, substituteHolidays)

  const getVacationsOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return sortByMemberOrder(
      vacations.filter((v) => v.date === dateStr && scopeUserIds.has(v.user_id))
    )
  }

  const getRemoteOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return sortByMemberOrder(
      remoteWorks.filter((r) => r.date === dateStr && scopeUserIds.has(r.user_id))
    )
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

  const getWeeks = (month: Date) => {
    return getWeeksOfMonth(dayjs(month))
  }

  const leaders = members.filter((m) => m.isHead)
  const departmentName = team?.departments?.name as string | undefined

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              이 팀의 정보를 볼 수 있는 권한이 없어요.
            </p>
            <button
              onClick={() => router.push('/team')}
              className="text-sm text-blue-500 hover:underline mt-3"
            >
              내 소속으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          {departmentName && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5 truncate">
              {departmentName}
            </p>
          )}
          <h1 className="text-2xl font-bold dark:text-white truncate">{team?.name}</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
            {leaders.length > 0
              ? `팀장 ${leaders.map((l) => l.name).join(', ')}`
              : '팀장 미지정'}
            {' · '}소속 인원 {members.length}명
          </p>
        </div>

        {/* 달력 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">팀 캘린더</h2>
            {team?.department_id && (
              <div className="flex bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5">
                <button
                  onClick={() => setFilterScope('department')}
                  className={`text-xs px-3 py-1 rounded-md transition ${
                    filterScope === 'department'
                      ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                      : 'text-gray-500 dark:text-zinc-400'
                  }`}
                >
                  부서 전체
                </button>
                <button
                  onClick={() => setFilterScope('team')}
                  className={`text-xs px-3 py-1 rounded-md transition ${
                    filterScope === 'team'
                      ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                      : 'text-gray-500 dark:text-zinc-400'
                  }`}
                >
                  내 팀만
                </button>
              </div>
            )}
          </div>
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
              <div className="flex flex-col shrink-0 mt-[74px] sm:mt-[90px]">
                {getWeeks(calendarMonth).map((weekStart, index) => {
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
                        const weeks = getWeeks(calendarMonth)
                        const idx = parseInt(selectedCommuteWeek) - 1
                        const weekStart = weeks[idx]
                        if (!weekStart) return ''
                        return `${weekStart.format('MM/DD')} ~ ${weekStart.endOf('isoWeek').format('MM/DD')}`
                      })()}
                    </p>
                    <div className="flex gap-4">
                      {['8시', '9시'].map((time) => {
                        const planners = (weekCommutePlans[selectedCommuteWeek] || []).filter(
                          (p) => p.commute_time === time && scopeUserIds.has(p.user_id)
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
                                    {p.profiles?.name || p.profiles?.email?.split('@')[0]}
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
        </div>

        {/* 소속 인원 리스트 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4">
          <h2 className="font-semibold dark:text-white mb-3">소속 인원</h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
              소속 인원이 없어요.
            </p>
          ) : (
            <div className="space-y-1">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-2 py-2.5 border-b dark:border-zinc-700 last:border-0"
                >
                  <span className="font-medium dark:text-white">{member.name}</span>
                  {member.position && (
                    <span className="text-xs text-gray-400 dark:text-zinc-500">
                      {member.position}
                    </span>
                  )}
                  {member.isHead && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                      팀장
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
