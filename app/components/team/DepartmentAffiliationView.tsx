'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import Holidays from 'date-holidays'

const hd = new Holidays('KR')

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
  const [vacations, setVacations] = useState<any[]>([])
  const [remoteWorks, setRemoteWorks] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])

  useEffect(() => {
    fetchDepartmentInfo(departmentId)
    supabase.from('substitute_holidays').select('date').then(({ data }) => {
      if (data) setSubstituteHolidays(data.map((h) => h.date))
    })
  }, [departmentId])

  const nameOf = (p: any) => p?.name || p?.email?.split('@')[0] || '이름없음'

  const fetchDepartmentInfo = async (deptId: string) => {
    setLoading(true)
    const { data: dept } = await supabase
      .from('departments')
      .select('id, name, head_user_id')
      .eq('id', deptId)
      .single()
    setDepartment(dept)

    if (dept?.head_user_id) {
      const { data: headProfile } = await supabase.from('profiles').select('name, email').eq('id', dept.head_user_id).single()
      setHeadName(headProfile?.name || headProfile?.email?.split('@')[0] || null)
    } else {
      setHeadName(null)
    }

    const [{ data: deptTeams }, { data: directDept }] = await Promise.all([
      supabase.from('teams').select('id, name').eq('department_id', deptId).order('display_order', { ascending: true }),
      supabase
        .from('department_memberships')
        .select('user_id, profiles(id, email, name, position, is_master)')
        .eq('department_id', deptId)
        .order('display_order', { ascending: true }),
    ])

    const teamIds = (deptTeams || []).map((t: any) => t.id)
    setHasTeams(teamIds.length > 0)
    const { data: teamMembersRaw } = teamIds.length > 0
      ? await supabase
          .from('team_members')
          .select('team_id, user_id, role, profiles(id, email, name, position, is_master)')
          .in('team_id', teamIds)
          .order('display_order', { ascending: true })
      : { data: [] as any[] }

    // 부서 직속 인원 (부서장은 department_memberships에 없을 수도 있으므로 별도로 항상 포함시킨다)
    const directList: Member[] = (directDept || [])
      .filter((m: any) => !m.profiles?.is_master && m.user_id !== dept?.head_user_id)
      .map((m: any) => ({ user_id: m.user_id, name: nameOf(m.profiles), position: m.profiles?.position || null, isDirect: true }))

    if (dept?.head_user_id) {
      const existingHead: any = (directDept || []).find((m: any) => m.user_id === dept.head_user_id)
      if (existingHead) {
        directList.unshift({
          user_id: existingHead.user_id,
          name: nameOf(existingHead.profiles),
          position: existingHead.profiles?.position || null,
          isDirect: true,
          isHead: true,
        })
      } else {
        // department_memberships에는 없고 "자리"만 있는 부서장도 목록에 노출
        const { data: headProfile } = await supabase
          .from('profiles')
          .select('id, name, email, position, is_master')
          .eq('id', dept.head_user_id)
          .single()
        if (headProfile && !headProfile.is_master) {
          directList.unshift({
            user_id: headProfile.id,
            name: nameOf(headProfile),
            position: headProfile.position || null,
            isDirect: true,
            isHead: true,
          })
        }
      }
    }
    setDirectMembers(directList)

    // 팀별로 그룹핑 (팀장은 role === 'admin')
    const groups: TeamGroup[] = (deptTeams || []).map((t: any) => {
      const members: Member[] = (teamMembersRaw || [])
        .filter((m: any) => m.team_id === t.id && !m.profiles?.is_master)
        .map((m: any) => ({
          user_id: m.user_id,
          name: nameOf(m.profiles),
          position: m.profiles?.position || null,
          isDirect: false,
          isTeamLead: m.role === 'admin',
        }))
        // 팀장을 목록 맨 위로
        .sort((a: Member, b: Member) => Number(b.isTeamLead) - Number(a.isTeamLead))
      return { id: t.id, name: t.name, members }
    })
    setTeamGroups(groups)

    // 표시 순서: 부서 직속 인원(부서장 포함) 뒤에 각 팀 인원을 이어붙인다 — 조직 관리에서 설정한 순서와 동일하게 유지.
    const map = new Map<string, Member>()
    directList.forEach((m) => map.set(m.user_id, m))
    groups.forEach((g) => g.members.forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, m)
    }))
    const combined = Array.from(map.values())
    setAllMembers(combined)

    const userIds = combined.map((m) => m.user_id)
    if (userIds.length > 0) {
      const [{ data: vacationData }, { data: remoteData }] = await Promise.all([
        supabase.from('vacations').select('*').in('user_id', userIds),
        supabase.from('remote_works').select('*').in('user_id', userIds),
      ])
      if (vacationData) setVacations(vacationData)
      if (remoteData) setRemoteWorks(remoteData)
    } else {
      setVacations([])
      setRemoteWorks([])
    }

    setLoading(false)
  }

  // 캘린더 표시에만 쓰는 범위 필터 — "소속 인원" 목록 표시는 이 필터와 무관하게 항상 전체를 보여준다.
  // 부서에 팀이 하나도 없으면 "내 팀만" 토글 자체가 의미 없으므로 항상 전체(=부서 직속 전체)로 본다.
  const scopeMembers = !hasTeams || filterScope === 'department' ? allMembers : directMembers
  const scopeUserIds = new Set(scopeMembers.map((m) => m.user_id))

  const getMemberName = (userId: string) => allMembers.find((m) => m.user_id === userId)?.name || '알 수 없음'

  const getVacationsOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return vacations.filter((v) => v.date === dateStr && scopeUserIds.has(v.user_id))
  }
  const getRemoteOnDate = (date: Date) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    return remoteWorks.filter((r) => r.date === dateStr && scopeUserIds.has(r.user_id))
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
    if (day === 0 || hd.isHoliday(date) || isSubstitute) return '!text-red-500 font-semibold'
    return ''
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
        <div className="max-w-2xl mx-auto" />
      </div>
    )
  }

  const renderMemberRow = (m: Member) => (
    <div key={m.user_id} className="flex items-center gap-2 py-2.5 border-b dark:border-zinc-700 last:border-0">
      <span className="font-medium dark:text-white">{m.name}</span>
      {m.position && <span className="text-xs text-gray-400 dark:text-zinc-500">{m.position}</span>}
      {m.isHead && <span className="text-[10px] text-blue-500 font-semibold">부서장</span>}
      {m.isTeamLead && <span className="text-[10px] text-blue-500 font-semibold">팀장</span>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold dark:text-white">{department?.name}</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
            {headName ? `부서장 ${headName}` : '부서장 미지정'} · 소속 {allMembers.length}명
          </p>
        </div>

        {/* 달력 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-3 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">부서 캘린더</h2>
            {hasTeams && (
              <div className="flex bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5">
                <button
                  onClick={() => setFilterScope('department')}
                  className={`text-xs px-3 py-1 rounded-md transition ${filterScope === 'department'
                    ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                    : 'text-gray-500 dark:text-zinc-400'
                    }`}>
                  부서 전체
                </button>
                <button
                  onClick={() => setFilterScope('team')}
                  className={`text-xs px-3 py-1 rounded-md transition ${filterScope === 'team'
                    ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                    : 'text-gray-500 dark:text-zinc-400'
                    }`}>
                  내 팀만
                </button>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <Calendar
              onClickDay={(date) => setSelectedDate(date)}
              tileContent={getTileContent}
              tileClassName={getTileClassName}
              locale="ko-KR"
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
                    <p className="text-xs text-gray-400 dark:text-zinc-500">없음</p>
                  ) : (
                    getVacationsOnDate(selectedDate).map((v) => (
                      <div key={v.id} className="flex items-center gap-1 mb-1">
                        <p className="text-base font-medium dark:text-zinc-200">{getMemberName(v.user_id)}</p>
                        <p className="text-[13px] text-orange-400">
                          {v.type === 'annual' ? '연차' : v.type === 'special' ? '특휴/대휴' : v.type === 'morning' ? '오전반차' : '오후반차'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-indigo-500 mb-1">원격근무</p>
                  {getRemoteOnDate(selectedDate).length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-zinc-500">없음</p>
                  ) : (
                    getRemoteOnDate(selectedDate).map((r) => (
                      <p key={r.id} className="text-base py-0.5 dark:text-zinc-200">{getMemberName(r.user_id)}</p>
                    ))
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedDate(null)} className="text-xs text-gray-400 dark:text-zinc-500 hover:underline mt-2">
                닫기
              </button>
            </div>
          )}
        </div>

        {/* 인원 리스트: 캘린더 필터(부서 전체/내 팀만)와 무관하게 항상 부서 전체 인원을, 팀별로 묶어서 표시 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 space-y-4">
          <h2 className="font-semibold dark:text-white">소속 인원</h2>
          {allMembers.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">소속 인원이 없어요.</p>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">부서 직속</p>
                {directMembers.length === 0 ? (
                  <p className="text-xs text-gray-300 dark:text-zinc-600">없음</p>
                ) : (
                  <div className="space-y-1">{directMembers.map(renderMemberRow)}</div>
                )}
              </div>
              {teamGroups.map((g) => (
                g.members.length === 0 ? null : (
                  <div key={g.id}>
                    <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-1.5">{g.name}</p>
                    <div className="space-y-1">{g.members.map(renderMemberRow)}</div>
                  </div>
                )
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
