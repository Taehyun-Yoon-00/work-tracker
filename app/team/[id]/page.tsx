'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import '../../lib/dates'
import { fetchSubstituteHolidays } from '../../lib/holidays'
import {
  fetchTeamMembers,
  fetchDepartmentScope,
  type OrgMember,
  type DepartmentScope,
} from '../../lib/orgOrder'
import { useScheduleRange } from '../../hooks/useScheduleRange'
import { vacationLabel, vacationColorClass, REMOTE_COLOR_CLASS, REMOTE_LABEL } from '../../lib/scheduleDisplay'
import SegmentedControl from '../../components/ui/SegmentedControl'
import TeamMonthCalendar, { type CalendarEntry } from '../../components/team/TeamMonthCalendar'

type ScopeMember = OrgMember
type FilterScope = 'department' | 'team'

export default function TeamDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [user, setUser] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [deptMembers, setDeptMembers] = useState<ScopeMember[]>([])
  // 캘린더에서 "부서 전체"를 선택했을 때 소속 인원 목록도 부서 전체(부서 직속 + 팀별)로
  // 보여주기 위한 원본 데이터. 부서 직속 소속 화면(DepartmentAffiliationView)과 동일한 구조.
  const [deptScope, setDeptScope] = useState<DepartmentScope | null>(null)
  const [filterScope, setFilterScope] = useState<FilterScope>('department')
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  // 캘린더에 쓸 휴가/재택은 보고 있는 달만 조회한다(hooks/useScheduleRange).
  const [scheduleUserIds, setScheduleUserIds] = useState<string[]>([])
  const [scheduleToken, setScheduleToken] = useState(0)
  const { vacations, remoteWorks } = useScheduleRange(scheduleUserIds, calendarMonth, scheduleToken)
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
    // 서로 의존하지 않는 조회(내 권한, 팀 정보, 팀 구성원)는 동시에 시작하고, 부서 전체 스코프는
    // 팀 정보(부서 id)가 도착하는 즉시 이어서 시작한다. 예전에는 이 조회들이 전부 순서대로였다.
    const teamQuery = supabase
      .from('teams')
      .select('*, departments(id, name, head_user_id, division_id, divisions(head_user_id))')
      .eq('id', id)
      .single()
    const teamPromise = (async () => await teamQuery)()
    // 정렬/조회 규칙은 lib/orgOrder에 모아둔 공용 로직을 그대로 쓴다 — 조직관리, 대시보드와
    // 항상 같은 순서(팀장이 팀 안에서 항상 최상단, 나머지는 display_order 순서)를 보장한다.
    const membersPromise = fetchTeamMembers(String(id))
    const scopePromise = teamPromise.then(({ data }) =>
      data?.department_id ? fetchDepartmentScope(data.department_id) : null
    )

    const [{ data: profileData }, { data: generalAdminRow }, { data: teamData }, teamMembersList] =
      await Promise.all([
        supabase.from('profiles').select('is_master').eq('id', userId).single(),
        supabase.from('general_admins').select('user_id').eq('user_id', userId).maybeSingle(),
        teamPromise,
        membersPromise,
      ])
    const masterFlag = !!profileData?.is_master
    if (masterFlag || generalAdminRow) {
      setIsMaster(true) // 마스터/총괄 관리자는 자동으로 팀장 권한
      setIsAdmin(true)
    }
    if (teamData) setTeam(teamData)
    setMembers(teamMembersList)
    const myRole = teamMembersList.find((m) => m.user_id === userId)
    if (myRole?.isHead) setIsAdmin(true)
    const isMember = !!myRole
    let unionUserIds: string[] = teamMembersList.map((m) => m.user_id)

    // 열람 권한: 팀 소속 인원 본인, 이 팀이 속한 부서의 부장, 그 부서가 속한 부문의 부문장,
    // 총괄 관리자, 시스템 관리자(마스터)만 볼 수 있다. 그 외에는 접근을 차단한다.
    const deptHeadId = teamData?.departments?.head_user_id
    const divisionHeadId = teamData?.departments?.divisions?.head_user_id
    const canViewAsOrgHead = deptHeadId === userId || divisionHeadId === userId
    setAuthorized(masterFlag || !!generalAdminRow || isMember || canViewAsOrgHead)

    // 부서 전체 스코프: 같은 부서의 다른 팀 + 부서 직접 소속 인원까지 모아둔다.
    // 표시 순서는 조직관리와 동일한 공용 규칙(부장 최상단 → 부서 직속 → 팀 순서대로,
    // 각 팀은 팀장이 최상단)을 그대로 따른다.
    const scope = await scopePromise
    if (teamData?.department_id && scope) {
      setDeptMembers(scope.allMembers)
      setDeptScope(scope)
      unionUserIds = Array.from(new Set([...unionUserIds, ...scope.allMembers.map((m) => m.user_id)]))
    } else {
      setDeptMembers([])
      setDeptScope(null)
    }

    // 휴가/재택은 useScheduleRange가 보고 있는 달 기준으로 가져온다. (포커스로 다시 불러올 때마다
    // 토큰을 올려 최신 상태로 갱신한다.)
    setScheduleUserIds(unionUserIds)
    setScheduleToken((t) => t + 1)
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

  // 캘린더 각 날짜 칸에 쌓을 막대 목록: "이름 · 휴가종류/원격"을 종류별 색으로 구분해서 보여준다.
  // 표시 순서는 연차/특휴(구분 없이 구성원 순서만) → 오전반차 → 오후반차 → 원격 순이다.
  const vacationGroupRank = (type: string) => {
    if (type === 'morning') return 1
    if (type === 'afternoon') return 2
    return 0 // annual, special 등은 구분 없이 구성원 순서만 반영
  }

  const getEntriesForDate = (date: Date): CalendarEntry[] => {
    const vacEntries: CalendarEntry[] = [...getVacationsOnDate(date)]
      .sort((a, b) => vacationGroupRank(a.type) - vacationGroupRank(b.type))
      .map((v) => ({
        id: `v-${v.id}`,
        label: `${getMemberName(v.user_id)} · ${vacationLabel(v.type)}`,
        colorClass: vacationColorClass(v.type),
      }))
    const remEntries: CalendarEntry[] = getRemoteOnDate(date).map((r) => ({
      id: `r-${r.id}`,
      label: `${getMemberName(r.user_id)} · ${REMOTE_LABEL}`,
      colorClass: REMOTE_COLOR_CLASS,
    }))
    return [...vacEntries, ...remEntries]
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
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-8 text-center">
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

  // 캘린더에서 "부서 전체"를 선택한 경우에만 소속 인원도 부서 전체로 보여준다.
  const showDepartmentMemberList = filterScope === 'department' && !!deptScope

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          {departmentName && (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-0.5 truncate">
              {departmentName}
            </p>
          )}
          <h1 className="text-xl font-semibold dark:text-white truncate">{team?.name}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            {leaders.length > 0
              ? `팀장 ${leaders.map((l) => l.name).join(', ')}`
              : '팀장 미지정'}
            {' · '}소속 인원 {members.length}명
          </p>
        </div>

        {/* 달력 */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">팀 캘린더</h2>
            {team?.department_id && (
              <SegmentedControl
                value={filterScope}
                onChange={setFilterScope}
                options={[
                  { value: 'department' as const, label: '부서 전체' },
                  { value: 'team' as const, label: '내 팀만' },
                ]}
              />
            )}
          </div>
          <div className="flex flex-col gap-3">
            <TeamMonthCalendar
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              getEntriesForDate={getEntriesForDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              substituteHolidays={substituteHolidays}
            />

            {/* 리스트 - 달력 아래 */}
            {selectedDate && (
              <div className="border-t dark:border-zinc-700 pt-3">
                <p className="text-sm font-semibold mb-2 dark:text-zinc-200">
                  {dayjs(selectedDate).format('MM월 DD일')}
                </p>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-orange-500 mb-1">휴가</p>
                    {getVacationsOnDate(selectedDate).length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-zinc-400">없음</p>
                    ) : (
                      getVacationsOnDate(selectedDate).map((v) => (
                        <div key={v.id} className="flex items-center gap-1 mb-1">
                          <p className="text-base font-medium dark:text-zinc-200">
                            {getMemberName(v.user_id)}
                          </p>
                          <p className="text-[13px] text-orange-400">{vacationLabel(v.type)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-semibold text-indigo-500 mb-1">원격근무</p>
                    {getRemoteOnDate(selectedDate).length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-zinc-400">없음</p>
                    ) : (
                      getRemoteOnDate(selectedDate).map((r) => (
                        <p key={r.id} className="text-base py-0.5 dark:text-zinc-200">
                          {getMemberName(r.user_id)}
                        </p>
                      ))
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-gray-500 dark:text-zinc-400 hover:underline mt-2"
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 소속 인원 리스트: 캘린더에서 "부서 전체"를 선택하면 조직관리의 "구성원" 탭과 같은
            모양(그룹명 + 인원수 + 구분선)으로 부서 직속/팀별로 묶어서 보여주고,
            "내 팀만"이면 팀명·인원수 없이 이름만 같은 행 스타일로 나열한다. */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-4">
          <h2 className="font-semibold dark:text-white">소속 인원</h2>
          {showDepartmentMemberList ? (
            deptScope!.allMembers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-4">
                소속 인원이 없어요.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                      부서 직속
                    </p>
                    <span className="text-xs text-gray-500 dark:text-zinc-400">
                      ({deptScope!.directMembers.length}명)
                    </span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-zinc-800" />
                  {deptScope!.directMembers.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-zinc-600 py-2">없음</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-zinc-900/60">
                      {deptScope!.directMembers.map((m) => (
                        <div key={m.user_id} className="flex items-center gap-1.5 py-1">
                          <span className="text-sm text-gray-600 dark:text-zinc-300">{m.name}</span>
                          {m.position && (
                            <span className="text-xs text-gray-500 dark:text-zinc-400">
                              {m.position}
                            </span>
                          )}
                          {m.isHead && (
                            <span className="text-[11px] text-blue-500 shrink-0">부장</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {deptScope!.teamGroups.map((g) =>
                  g.members.length === 0 ? null : (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                          {g.name}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-zinc-400">
                          ({g.members.length}명)
                        </span>
                      </div>
                      <div className="border-t border-gray-100 dark:border-zinc-800" />
                      <div className="divide-y divide-gray-50 dark:divide-zinc-900/60">
                        {g.members.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-1.5 py-1">
                            <span className="text-sm text-gray-600 dark:text-zinc-300">
                              {m.name}
                            </span>
                            {m.position && (
                              <span className="text-xs text-gray-500 dark:text-zinc-400">
                                {m.position}
                              </span>
                            )}
                            {m.isHead && (
                              <span className="text-[11px] text-blue-500 shrink-0">팀장</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-4">
              소속 인원이 없어요.
            </p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-zinc-900/60">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-1.5 py-1">
                  <span className="text-sm text-gray-600 dark:text-zinc-300">{m.name}</span>
                  {m.position && (
                    <span className="text-xs text-gray-500 dark:text-zinc-400">{m.position}</span>
                  )}
                  {m.isHead && <span className="text-[11px] text-blue-500 shrink-0">팀장</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
