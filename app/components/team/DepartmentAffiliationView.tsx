'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import dayjs from 'dayjs'
// isoWeek 플러그인은 lib/dates가 한 번만 등록한다. side-effect import로 이 파일에서도 적용된다.
import '../../lib/dates'
import { fetchSubstituteHolidays } from '../../lib/holidays'
import { fetchDepartmentScope } from '../../lib/orgOrder'
import { useScheduleRange } from '../../hooks/useScheduleRange'
import { vacationLabel, vacationColorClass, REMOTE_COLOR_CLASS, REMOTE_LABEL } from '../../lib/scheduleDisplay'
import SegmentedControl from '../ui/SegmentedControl'
import SkeletonRows from '../ui/SkeletonRows'
import TeamMonthCalendar, { type CalendarEntry } from './TeamMonthCalendar'

type Member = {
  user_id: string
  name: string
  position: string | null
  isDirect: boolean
  isHead?: boolean
  isTeamLead?: boolean
}
type TeamGroup = { id: string; name: string; members: Member[] }
type FilterScope = 'department' | 'team'

/**
 * "내 소속"이 팀이 아니라 부서 직속인 사용자를 위한 화면.
 * /team(본인 소속) 및 /team/dept/[id](다른 소속 상세 열람) 양쪽에서 공용으로 사용한다.
 */
export default function DepartmentAffiliationView({ departmentId }: { departmentId: string }) {
  const [loading, setLoading] = useState(true)
  const [department, setDepartment] = useState<any>(null)
  const [headName, setHeadName] = useState<string | null>(null)
  const [directMembers, setDirectMembers] = useState<Member[]>([])
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([])
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [filterScope, setFilterScope] = useState<FilterScope>('department')
  const [hasTeams, setHasTeams] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  // 캘린더에 쓸 휴가/재택은 보고 있는 달만 조회한다(hooks/useScheduleRange).
  const [scheduleUserIds, setScheduleUserIds] = useState<string[]>([])
  const { vacations, remoteWorks, ready: scheduleReady } = useScheduleRange(
    scheduleUserIds,
    calendarMonth,
    0
  )
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])

  useEffect(() => {
    fetchDepartmentInfo(departmentId)
    fetchSubstituteHolidays().then(setSubstituteHolidays)
  }, [departmentId])

  const fetchDepartmentInfo = async (deptId: string) => {
    setLoading(true)
    // 부서 정보, 부장 프로필, 부서 구성원 조회는 서로 기다릴 필요가 없어 동시에 실행한다.
    const deptQuery = supabase
      .from('departments')
      .select('id, name, head_user_id')
      .eq('id', deptId)
      .single()
    const deptPromise = (async () => await deptQuery)()
    const headPromise = deptPromise.then(async ({ data }) => {
      if (!data?.head_user_id) return null
      const { data: headProfile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', data.head_user_id)
        .single()
      return headProfile
    })
    // 정렬/조회 규칙은 lib/orgOrder에 모아둔 공용 로직을 그대로 쓴다 — 조직관리, 대시보드와
    // 항상 같은 순서(부장 최상단 → 부서 직속 → 팀 순서대로, 각 팀은 팀장이 최상단)를 보장한다.
    const [{ data: dept }, headProfile, scope] = await Promise.all([
      deptPromise,
      headPromise,
      fetchDepartmentScope(deptId),
    ])
    setDepartment(dept)
    if (dept?.head_user_id) {
      setHeadName(headProfile?.name || headProfile?.email?.split('@')[0] || null)
    } else {
      setHeadName(null)
    }
    setHasTeams(scope.teamGroups.length > 0)

    const directList: Member[] = scope.directMembers.map((m) => ({
      user_id: m.user_id,
      name: m.name,
      position: m.position,
      isDirect: true,
      isHead: m.isHead,
    }))
    setDirectMembers(directList)

    const groups: TeamGroup[] = scope.teamGroups.map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.map((m) => ({
        user_id: m.user_id,
        name: m.name,
        position: m.position,
        isDirect: false,
        isTeamLead: m.isHead,
      })),
    }))
    setTeamGroups(groups)

    const combined: Member[] = scope.allMembers.map((m) => {
      const fromDirect = directList.find((d) => d.user_id === m.user_id)
      if (fromDirect) return fromDirect
      for (const g of groups) {
        const found = g.members.find((tm) => tm.user_id === m.user_id)
        if (found) return found
      }
      return { user_id: m.user_id, name: m.name, position: m.position, isDirect: false }
    })
    setAllMembers(combined)

    // 휴가/재택은 useScheduleRange가 보고 있는 달 기준으로 가져온다.
    setScheduleUserIds(combined.map((m) => m.user_id))

    setLoading(false)
  }

  // 캘린더와 "소속 인원" 목록 모두 같은 필터를 따른다: "부서 전체"면 부서 직속+팀별 전체를,
  // "내 팀만"이면 부서 직속(=이 화면에서의 "내 팀")만 보여준다. 팀이 하나도 없으면 필터 자체가
  // 의미 없으므로 항상 전체(=부서 직속 전체)로 본다. /team/[id]와 동일한 규칙이다.
  const showFullMemberList = !hasTeams || filterScope === 'department'
  const scopeMembers = showFullMemberList ? allMembers : directMembers
  const scopeUserIds = new Set(scopeMembers.map((m) => m.user_id))

  const getMemberName = (userId: string) =>
    allMembers.find((m) => m.user_id === userId)?.name || '알 수 없음'

  const getVacationsOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return vacations.filter((v) => v.date === dateStr && scopeUserIds.has(v.user_id))
  }
  const getRemoteOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return remoteWorks.filter((r) => r.date === dateStr && scopeUserIds.has(r.user_id))
  }

  // 캘린더 각 날짜 칸에 쌓을 막대 목록: "이름 · 휴가종류/원격"을 종류별 색으로 구분해서 보여준다.
  const getEntriesForDate = (date: Date): CalendarEntry[] => {
    const vacEntries: CalendarEntry[] = getVacationsOnDate(date).map((v) => ({
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

  // 예전처럼 구성원 + 첫 달 일정이 모두 준비된 뒤에 화면을 보여준다.
  if (loading || !scheduleReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div
              className="h-6 w-32 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse motion-reduce:animate-none mb-2"
              aria-hidden="true"
            />
            <div
              className="h-4 w-40 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 mb-4">
            <div
              className="h-80 rounded bg-gray-100 dark:bg-zinc-700/60 animate-pulse motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
            <h2 className="font-semibold dark:text-white mb-2">소속 인원</h2>
            <SkeletonRows rows={4} label="소속 인원" />
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
          <h1 className="text-xl font-semibold dark:text-white">{department?.name}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            {headName ? `부장 ${headName}` : '부장 미지정'} · 소속 {allMembers.length}명
          </p>
        </div>

        {/* 달력 */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-3 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">부서 캘린더</h2>
            {hasTeams && (
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
          <div className="min-w-0">
            <TeamMonthCalendar
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              getEntriesForDate={getEntriesForDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              substituteHolidays={substituteHolidays}
            />
          </div>

          {selectedDate && (
            <div className="border-t dark:border-zinc-700 pt-3 mt-3">
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

        {/* 인원 리스트: /team/[id](팀이 "부서 전체"를 볼 때)와 동일하게, 캘린더 필터를 그대로 따른다.
            "부서 전체"면 조직관리의 "구성원" 탭과 같은 모양(그룹명 + 인원수 + 구분선)으로 부서
            직속/팀별로 묶어서 보여주고, "내 팀만"이면 팀(부서 직속) 화면과 같은 스타일로
            이름만 같은 행 스타일로 나열한다. */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-4">
          <h2 className="font-semibold dark:text-white">소속 인원</h2>
          {showFullMemberList ? (
            allMembers.length === 0 ? (
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
                      ({directMembers.length}명)
                    </span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-zinc-800" />
                  {directMembers.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-zinc-600 py-2">없음</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-zinc-900/60">
                      {directMembers.map((m) => (
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
                {teamGroups.map((g) =>
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
                            {m.isTeamLead && (
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
          ) : directMembers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-4">
              소속 인원이 없어요.
            </p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-zinc-900/60">
              {directMembers.map((m) => (
                <div key={m.user_id} className="flex items-center gap-1.5 py-1">
                  <span className="text-sm text-gray-600 dark:text-zinc-300">{m.name}</span>
                  {m.position && (
                    <span className="text-xs text-gray-500 dark:text-zinc-400">{m.position}</span>
                  )}
                  {m.isHead && <span className="text-[11px] text-blue-500 shrink-0">부장</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
