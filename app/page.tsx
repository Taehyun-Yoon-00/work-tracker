'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import { isHoliday, isPublicHoliday, fetchSubstituteHolidays } from '@/app/lib/holidays'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import WorkMattersEditor, {
  MatterEntry,
  emptyMatterEntry,
} from './components/worklog/WorkMattersEditor'
import { recordMatterUsage } from './lib/matterHistory'
import { calcWorkHours } from '@/app/lib/workTime'
import { getMonthRange, getWeekRange, getWeeksOfMonth, todayStr } from '@/app/lib/dates'
import type { RemoteWork, Vacation, WorkCategory, WorkLog, WorkLogMatter } from '@/app/lib/types'
import Card from '@/app/components/ui/Card'
import StatCard from '@/app/components/ui/StatCard'

export default function Home() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('60')
  const [memo, setMemo] = useState('')
  const [matters, setMatters] = useState<MatterEntry[]>([emptyMatterEntry()])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [weeklyLogs, setWeeklyLogs] = useState<WorkLog[]>([])
  const [vacation, setVacation] = useState<string | null>(null)
  const [vacationLoading, setVacationLoading] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  // 달력 표시에는 날짜만 쓰므로 date 컬럼만 조회한다
  const [monthlyLogs, setMonthlyLogs] = useState<Pick<WorkLog, 'date'>[]>([])
  const [commutePlan, setCommutePlan] = useState<string | null>(null)
  const [isRemote, setIsRemote] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [monthlyVacations, setMonthlyVacations] = useState<Pick<Vacation, 'date' | 'type'>[]>([])
  const [monthlyRemoteWorks, setMonthlyRemoteWorks] = useState<Pick<RemoteWork, 'date'>[]>([])
  const [isNextDay, setIsNextDay] = useState(false)
  const [substituteHolidays, setSubstituteHolidays] = useState<string[]>([])
  const [viewedWeek, setViewedWeek] = useState<Date>(new Date())

  useEffect(() => {
    fetchSubstituteHolidays().then(setSubstituteHolidays)
  }, [])

  useEffect(() => {
    if (user) {
      fetchMonthlyLogs()
      fetchMonthlyVacations()
      fetchMonthlyRemoteWorks()
      fetchMonthCommutePlans()
      fetchVacation(selectedDate)
      fetchDayLog(selectedDate)
      fetchRemote(selectedDate)
    }
  }, [user, selectedDate])

  useEffect(() => {
    if (user) fetchWeeklyLogs()
  }, [user, viewedWeek])

  // 날짜를 클릭하면 보고 있는 주간도 그 날짜의 주로 동기화
  useEffect(() => {
    setViewedWeek(selectedDate)
  }, [selectedDate])

  const fetchWeeklyLogs = async () => {
    if (!user) return
    const { start: startOfWeek, end: endOfWeek } = getWeekRange(viewedWeek)

    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startOfWeek)
      .lte('date', endOfWeek)
      .order('date', { ascending: true })

    if (data) setWeeklyLogs(data)
  }
  const fetchMonthlyLogs = async () => {
    if (!user) return
    const { start: startOfMonth, end: endOfMonth } = getMonthRange(selectedDate)

    const { data } = await supabase
      .from('work_logs')
      .select('date')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)

    if (data) setMonthlyLogs(data)
  }

  const fetchMonthlyVacations = async () => {
    if (!user) return
    const { start: startOfMonth, end: endOfMonth } = getMonthRange(selectedDate)
    const { data } = await supabase
      .from('vacations')
      .select('date, type')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
    if (data) setMonthlyVacations(data)
  }

  const fetchMonthlyRemoteWorks = async () => {
    if (!user) return
    const { start: startOfMonth, end: endOfMonth } = getMonthRange(selectedDate)
    const { data } = await supabase
      .from('remote_works')
      .select('date')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth)
    if (data) setMonthlyRemoteWorks(data)
  }

  const fetchCommutePlan = async () => {
    if (!user) return
    const weekStart = getWeekRange(selectedDate).start
    const { data } = await supabase
      .from('commute_plans')
      .select('commute_time')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .single()
    setCommutePlan(data?.commute_time || null)
  }

  const fetchMattersFor = async (workLogId: string): Promise<MatterEntry[]> => {
    const { data } = await supabase
      .from('work_log_matters')
      .select('*')
      .eq('work_log_id', workLogId)
      .order('sort_order', { ascending: true })

    if (!data || data.length === 0) return [emptyMatterEntry()]
    return data.map((m: WorkLogMatter) => ({
      key: m.id,
      category: m.category as WorkCategory,
      hours: String(m.hours),
      matter: {
        place: m.matter_place || '',
        division: m.matter_division || '',
        content: m.matter_content || '',
        costCode: m.matter_cost_code || '',
      },
    }))
  }

  const fetchDayLog = async (date: Date) => {
    if (!user) return
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dayjs(date).format('YYYY-MM-DD'))
      .single()

    if (data) {
      setStartTime(data.start_time.slice(0, 5))
      setEndTime(data.end_time.slice(0, 5))
      setBreakMinutes(String(data.break_minutes))
      setMemo(data.memo || '')
      setIsLocked(true)
      setIsNextDay(data.is_next_day || false)
      setMatters(await fetchMattersFor(data.id))
    } else {
      // 기록이 없으면 가장 최근에 "저장"한 기록을 기본값으로 채워줌
      let lastLog = null
      const { data: lastByCreated, error: createdErr } = await supabase
        .from('work_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!createdErr && lastByCreated) {
        lastLog = lastByCreated
      } else {
        // created_at 컬럼이 없는 경우 날짜 기준으로 폴백
        const { data: lastByDate } = await supabase
          .from('work_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        lastLog = lastByDate
      }

      if (lastLog) {
        setStartTime(lastLog.start_time.slice(0, 5))
        setEndTime(lastLog.end_time.slice(0, 5))
        setBreakMinutes(String(lastLog.break_minutes))
        setMemo(lastLog.memo || '')
        setIsNextDay(lastLog.is_next_day || false)
        // 안건 세부 내용은 이어서 쓰되, key/시간은 새 항목으로 취급(그대로 저장 안 되게)
        const carried = await fetchMattersFor(lastLog.id)
        setMatters(carried.map((m) => ({ ...m, key: Math.random().toString(36).slice(2) })))
      } else {
        setStartTime('')
        setEndTime('')
        setBreakMinutes('60')
        setMemo('')
        setIsNextDay(false)
        setMatters([emptyMatterEntry()])
      }
      setIsLocked(false)
    }
  }

  const fetchVacation = async (date: Date) => {
    if (!user) return
    const { data } = await supabase
      .from('vacations')
      .select('type')
      .eq('user_id', user.id)
      .eq('date', dayjs(date).format('YYYY-MM-DD'))
      .single()
    setVacation(data?.type || null)
  }
  const fetchRemote = async (date: Date) => {
    if (!user) return
    const { data } = await supabase
      .from('remote_works')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', dayjs(date).format('YYYY-MM-DD'))
      .single()
    setIsRemote(!!data)
  }

  const handleRemote = async () => {
    if (!user) return
    setRemoteLoading(true)
    if (isRemote) {
      await supabase
        .from('remote_works')
        .delete()
        .eq('user_id', user.id)
        .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
      setIsRemote(false)
    } else {
      await supabase.from('remote_works').upsert(
        {
          user_id: user.id,
          date: dayjs(selectedDate).format('YYYY-MM-DD'),
        },
        { onConflict: 'user_id,date' }
      )
      setIsRemote(true)
    }
    fetchMonthlyRemoteWorks()
    setRemoteLoading(false)
  }

  const handleVacation = async (type: string) => {
    if (!user) return
    setVacationLoading(true)
    if (vacation === type) {
      // 같은 버튼 누르면 취소
      await supabase
        .from('vacations')
        .delete()
        .eq('user_id', user.id)
        .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
      setVacation(null)
    } else {
      await supabase.from('vacations').upsert(
        {
          user_id: user.id,
          date: dayjs(selectedDate).format('YYYY-MM-DD'),
          type,
        },
        { onConflict: 'user_id,date' }
      )
      setVacation(type)

      // 연차를 선택하면 근무입력은 비활성화되고, 이미 저장된 근무기록이 있다면 자동으로 삭제한다
      if (type === 'annual' || type === 'special') {
        await supabase
          .from('work_logs')
          .delete()
          .eq('user_id', user.id)
          .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
        setStartTime('')
        setEndTime('')
        setBreakMinutes('60')
        setMemo('')
        setIsNextDay(false)
        setMatters([emptyMatterEntry()])
        setIsLocked(false)
        setMessage('')
        fetchWeeklyLogs()
        fetchMonthlyLogs()
      }
    }
    setVacationLoading(false)
  }
  // 연차인 날은 근무입력을 아예 막는다 (저장되어 있어도 자동으로 지움)
  const isAnnualVacation = vacation === 'annual' || vacation === 'special'
  const workInputDisabled = isLocked || isAnnualVacation
  const calcCurrentTotalHours = () =>
    calcWorkHours({
      start_time: startTime,
      end_time: endTime,
      break_minutes: parseInt(breakMinutes) || 0,
      is_next_day: isNextDay,
    })

  const handleSave = async () => {
    if (!user) return
    if (isAnnualVacation) {
      setMessage('연차인 날은 근무 입력을 저장할 수 없어요.')
      return
    }
    if (!startTime || !endTime) {
      setMessage('출근/퇴근 시간을 입력해주세요.')
      return
    }
    if (matters.length === 0) {
      setMessage('안건을 1개 이상 추가해주세요.')
      return
    }
    for (const m of matters) {
      if (!m.hours || parseFloat(m.hours) <= 0) {
        setMessage('모든 안건에 시간을 입력해주세요.')
        return
      }
      if (m.category === '청구안건' && !m.matter.content && !m.matter.place) {
        setMessage('청구 안건의 장소 또는 내용을 입력해주세요.')
        return
      }
    }
    const sumHours = matters.reduce((acc, m) => acc + (parseFloat(m.hours) || 0), 0)
    const total = calcCurrentTotalHours()
    if (Math.abs(total - sumHours) > 0.01) {
      setMessage('안건별 시간 합계가 총 근무시간과 일치하지 않아요.')
      return
    }

    setLoading(true)
    setMessage('')

    const { data: savedLog, error } = await supabase
      .from('work_logs')
      .upsert(
        {
          user_id: user.id,
          date: dayjs(selectedDate).format('YYYY-MM-DD'),
          start_time: startTime,
          end_time: endTime,
          break_minutes: parseInt(breakMinutes),
          memo,
          is_next_day: isNextDay,
        },
        { onConflict: 'user_id,date' }
      )
      .select('id')
      .single()

    if (error || !savedLog) {
      setMessage('저장 실패: ' + (error?.message || '알 수 없는 오류'))
      setLoading(false)
      return
    }

    // 기존 안건들을 지우고 지금 입력된 안건들로 교체
    await supabase.from('work_log_matters').delete().eq('work_log_id', savedLog.id)
    const { error: mattersError } = await supabase.from('work_log_matters').insert(
      matters.map((m, idx) => ({
        work_log_id: savedLog.id,
        category: m.category,
        hours: parseFloat(m.hours),
        matter_place: m.category === '청구안건' ? m.matter.place || null : null,
        matter_division: m.category === '청구안건' ? m.matter.division || null : null,
        matter_content: m.category === '청구안건' ? m.matter.content || null : null,
        matter_cost_code: m.category === '청구안건' ? m.matter.costCode || null : null,
        sort_order: idx,
      }))
    )

    if (mattersError) {
      setMessage('저장 실패: ' + mattersError.message)
    } else {
      setMessage('저장 완료!')
      setIsLocked(true)
      fetchWeeklyLogs()
      matters.filter((m) => m.category === '청구안건').forEach((m) => recordMatterUsage(m.matter))
    }
    setLoading(false)
  }
  const handleDelete = async () => {
    if (!user) return
    const confirmed = confirm('이 날의 근무기록을 삭제할까요?')
    if (!confirmed) return
    setDeleteLoading(true)
    await supabase
      .from('work_logs')
      .delete()
      .eq('user_id', user.id)
      .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
    setStartTime('')
    setEndTime('')
    setBreakMinutes('60')
    setMemo('')
    setIsLocked(false)
    setMatters([emptyMatterEntry()])
    setMessage('')
    fetchWeeklyLogs()
    fetchMonthlyLogs()
    setDeleteLoading(false)
  }
  const getTileClassName = ({ date }: { date: Date }) => {
    const day = date.getDay()
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    const isToday = dateStr === todayStr()
    const hasLog = monthlyLogs.some((log) => log.date === dateStr)
    const vacationOnDate = monthlyVacations.find((v) => v.date === dateStr)
    const isHalfDay = vacationOnDate?.type === 'morning' || vacationOnDate?.type === 'afternoon'
    const isSubstitute = substituteHolidays.includes(dateStr)

    let className = 'relative '
    // 반차인 날은 대각선 오버레이(getTileContent)가 색을 전부 담당하므로 button 자체 배경은 비움
    if (hasLog && !isToday && !isHalfDay) className += '!bg-blue-100 dark:!bg-blue-950 rounded-lg '
    if (vacationOnDate && !isHalfDay && !isToday)
      className += '!bg-orange-100 dark:!bg-orange-950 rounded-lg '
    if (isHalfDay && !isToday) className += 'rounded-lg '
    if (day === 6) className += '!text-blue-500 font-semibold'
    else if (day === 0 || isPublicHoliday(date) || isSubstitute)
      className += '!text-red-500 font-semibold'

    return className.trim()
  }
  const getWeekStart = (date: Date) => dayjs(date).startOf('isoWeek').format('YYYY-MM-DD')

  const [weekPlans, setWeekPlans] = useState<{ [key: string]: string }>({})

  const fetchMonthCommutePlans = async () => {
    if (!user) return
    const { data } = await supabase
      .from('commute_plans')
      .select('week_number, commute_time')
      .eq('user_id', user.id)
    if (data) {
      const plans: { [key: string]: string } = {}
      data.forEach((d) => {
        plans[String(d.week_number)] = d.commute_time
      })
      setWeekPlans(plans)
    }
  }

  const handleCommutePlan = async (weekNumber: string, time: string) => {
    if (!user) return
    if (weekPlans[weekNumber] === time) {
      await supabase
        .from('commute_plans')
        .delete()
        .eq('user_id', user.id)
        .eq('week_number', parseInt(weekNumber))
      setWeekPlans((prev) => {
        const n = { ...prev }
        delete n[weekNumber]
        return n
      })
    } else {
      await supabase.from('commute_plans').upsert(
        {
          user_id: user.id,
          week_number: parseInt(weekNumber),
          commute_time: time,
        },
        { onConflict: 'user_id,week_number' }
      )
      setWeekPlans((prev) => ({ ...prev, [weekNumber]: time }))
    }
  }

  const getTileContent = ({ date }: { date: Date }) => {
    const dateStr = dayjs(date).format('YYYY-MM-DD')
    const isToday = dateStr === todayStr()
    const isRemoteOnDate = monthlyRemoteWorks.some((r) => r.date === dateStr)

    // 원격근무 표시: 해당 날짜칸 왼쪽위에 작은 동그라미 (원격근무 버튼과 동일한 인디고 색)
    const remoteDot = isRemoteOnDate ? (
      <span
        className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 pointer-events-none"
        style={{ zIndex: 1 }}
      />
    ) : null

    if (isToday) return remoteDot

    const vacationOnDate = monthlyVacations.find((v) => v.date === dateStr)
    if (
      !vacationOnDate ||
      (vacationOnDate.type !== 'morning' && vacationOnDate.type !== 'afternoon')
    ) {
      return remoteDot
    }

    const hasLog = monthlyLogs.some((log) => log.date === dateStr)
    const isDark =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    const workColor = hasLog ? (isDark ? '#172554' : '#dbeafe') : isDark ? '#27272a' : '#ffffff'
    const vacationColor = isDark ? '#431407' : '#ffedd5'

    // 오전반차: 좌상 주황, 우하 근무색 / 오후반차: 좌상 근무색, 우하 주황
    const topLeft = vacationOnDate.type === 'morning' ? vacationColor : workColor
    const bottomRight = vacationOnDate.type === 'morning' ? workColor : vacationColor

    return (
      <>
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(to bottom right, ${topLeft} 49.5%, ${bottomRight} 50.5%)`,
            zIndex: 0,
          }}
        />
        {remoteDot}
      </>
    )
  }
  const calcHours = (log: WorkLog) => calcWorkHours(log).toFixed(2)

  const totalWeeklyHours = weeklyLogs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)

  const weekdayHours = weeklyLogs
    .filter((log) => !isHoliday(new Date(log.date), substituteHolidays))
    .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)

  const weekendHours = weeklyLogs
    .filter((log) => isHoliday(new Date(log.date), substituteHolidays))
    .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">근무시간 기록</h1>
          <div className="flex gap-3">
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 dark:text-zinc-400 hover:underline"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 달력 */}
        <Card padding="p-3" className="mb-4">
          <div className="flex items-start gap-2 w-full">
            <div className="min-w-0">
              <Calendar
                onChange={(date) => setSelectedDate(date as Date)}
                onActiveStartDateChange={({ activeStartDate }) => {
                  if (activeStartDate) setSelectedDate(activeStartDate)
                }}
                value={selectedDate}
                locale="ko-KR"
                tileClassName={getTileClassName}
                tileContent={getTileContent}
              />
            </div>

            {/* 주차별 출근예정 버튼 */}
            <div className="flex flex-col shrink-0 mt-[74px] sm:mt-[90px]">
              {(() => {
                return getWeeksOfMonth(selectedDate).map((weekStart, index) => {
                  const weekNumber = String(index + 1)
                  const plan = weekPlans[weekNumber]
                  return (
                    <div key={weekNumber} className="flex items-center justify-center h-8 sm:h-11">
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => handleCommutePlan(weekNumber, '8시')}
                          className={`text-[12px] w-6 py-1.5 rounded-lg border transition ${
                            plan === '8시'
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white dark:bg-zinc-700 text-gray-400 dark:text-zinc-300 border-gray-300 dark:border-zinc-500'
                          }`}
                        >
                          8시
                        </button>
                        <button
                          onClick={() => handleCommutePlan(weekNumber, '9시')}
                          className={`text-[12px] w-6 py-1.5 rounded-lg border transition ${
                            plan === '9시'
                              ? 'bg-green-500 text-white border-green-500'
                              : 'bg-white dark:bg-zinc-700 text-gray-400 dark:text-zinc-300 border-gray-300 dark:border-zinc-500'
                          }`}
                        >
                          9시
                        </button>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </Card>
        {/* 근무시간 입력 */}
        <Card className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold dark:text-white">
              {dayjs(selectedDate).format('YYYY년 MM월 DD일')} 근무 입력
            </h2>
            {isLocked && !isAnnualVacation && (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsLocked(false)}
                  className="text-xs bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 px-3 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  ✏️ 수정
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-lg hover:bg-red-100"
                >
                  🗑️ 삭제
                </button>
              </div>
            )}
          </div>
          {isAnnualVacation && (
            <p className="text-xs text-orange-500 mb-3">
              연차인 날은 근무 입력을 할 수 없어요. 저장된 근무기록이 있었다면 자동으로 삭제됐어요.
            </p>
          )}
          <div className="flex gap-2 mb-2">
            <div className="flex gap-20 mb-2">
              <div className="flex-1">
                <label className="text-sm text-gray-500 dark:text-zinc-400">출근</label>
                <div className="flex gap-1 mt-1">
                  <select
                    value={startTime ? startTime.split(':')[0] : ''}
                    onChange={(e) =>
                      setStartTime(
                        `${e.target.value}:${startTime ? startTime.split(':')[1] : '00'}`
                      )
                    }
                    disabled={workInputDisabled}
                    className={`flex-1 border rounded-lg px-2 py-2 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''}`}
                  >
                    <option value="">시</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i).padStart(2, '0')}>
                        {String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center text-gray-400">:</span>
                  <select
                    value={startTime ? startTime.split(':')[1] : ''}
                    onChange={(e) =>
                      setStartTime(
                        `${startTime ? startTime.split(':')[0] : '00'}:${e.target.value}`
                      )
                    }
                    disabled={workInputDisabled}
                    className={`flex-1 border rounded-lg px-2 py-2  dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''}`}
                  >
                    <option value="">분</option>
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                </div>
              </div>

              <div className="flex-1">
                <label className="text-sm text-gray-500 dark:text-zinc-400">퇴근</label>
                <div className="flex gap-1 mt-1 items-center">
                  <select
                    value={endTime ? endTime.split(':')[0] : ''}
                    onChange={(e) =>
                      setEndTime(`${e.target.value}:${endTime ? endTime.split(':')[1] : '00'}`)
                    }
                    disabled={workInputDisabled}
                    className={`flex-1 border rounded-lg px-2 py-2  dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''}`}
                  >
                    <option value="">시</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i).padStart(2, '0')}>
                        {String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center text-gray-400">:</span>
                  <select
                    value={endTime ? endTime.split(':')[1] : ''}
                    onChange={(e) =>
                      setEndTime(`${endTime ? endTime.split(':')[0] : '00'}:${e.target.value}`)
                    }
                    disabled={workInputDisabled}
                    className={`flex-1 border rounded-lg px-2 py-2  dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''}`}
                  >
                    <option value="">분</option>
                    <option value="00">00</option>
                    <option value="15">15</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                  </select>
                  {!workInputDisabled && (
                    <button
                      onClick={() => setIsNextDay(!isNextDay)}
                      className={`text-[12px] px-1.5 py-1 rounded-lg border transition shrink-0 ${
                        isNextDay
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white dark:bg-zinc-700 text-gray-400 dark:text-zinc-300 border-gray-300 dark:border-zinc-500'
                      }`}
                    >
                      익일
                    </button>
                  )}
                  {isLocked && isNextDay && (
                    <span className="text-[10px] text-blue-500 shrink-0">익일</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <WorkMattersEditor
            entries={matters}
            onChange={setMatters}
            totalHours={calcCurrentTotalHours()}
            disabled={workInputDisabled}
          />
          <div className="mb-2">
            <label className="text-sm text-gray-500 dark:text-zinc-400">휴게시간 (분)</label>
            <input
              type="number"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              disabled={workInputDisabled}
              className={`w-full border rounded-lg px-3 py-2 mt-1 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${
                workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''
              }`}
            />
          </div>
          <div className="mb-3">
            <label className="text-sm text-gray-500 dark:text-zinc-400">메모</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={workInputDisabled}
              className={`w-full border rounded-lg px-3 py-2 mt-1 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${
                workInputDisabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''
              }`}
            />
          </div>
          {message && <p className="text-sm text-center text-blue-500 mb-2">{message}</p>}
          {!workInputDisabled && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? '저장 중...' : '저장'}
            </button>
          )}
        </Card>
        {/* 휴가 입력 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-3 dark:text-white">
            {dayjs(selectedDate).format('YYYY년 MM월 DD일')} 휴가
          </h2>
          <div className="flex gap-2">
            {[
              { type: 'annual', label: '연차' },
              { type: 'morning', label: '오전반차' },
              { type: 'afternoon', label: '오후반차' },
              { type: 'special', label: '특휴/대휴' },
            ].map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleVacation(type)}
                disabled={vacationLoading}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  vacation === type
                    ? 'bg-orange-500 text-white'
                    : 'bg-orange-50 text-orange-500 hover:bg-orange-100'
                }`}
              >
                {vacation === type ? `✓ ${label}` : label}
              </button>
            ))}
          </div>
          {vacation && (
            <p className="text-xs text-center text-gray-400 dark:text-zinc-500 mt-2">
              다시 누르면 취소돼요
            </p>
          )}
        </Card>

        {/* 원격근무 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-3 dark:text-white">
            {dayjs(selectedDate).format('YYYY년 MM월 DD일')} 원격근무
          </h2>
          <button
            onClick={handleRemote}
            disabled={remoteLoading}
            className={`w-full py-2 rounded-lg text-sm font-medium transition ${
              isRemote
                ? 'bg-indigo-500 text-white'
                : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
            }`}
          >
            {isRemote ? '✓ 원격근무' : '원격근무'}
          </button>
          {isRemote && (
            <p className="text-xs text-center text-gray-400 dark:text-zinc-500 mt-2">
              다시 누르면 취소돼요
            </p>
          )}
        </Card>

        {/* 주간 합산 */}
        <Card className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold flex-1 dark:text-white">주간 근무시간</h2>
            <button
              onClick={() => setViewedWeek(dayjs(viewedWeek).subtract(1, 'week').toDate())}
              className="px-3 py-1 bg-gray-100 dark:bg-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
            >
              ◀
            </button>
            <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
              {dayjs(viewedWeek).startOf('isoWeek').format('MM/DD')} ~{' '}
              {dayjs(viewedWeek).endOf('isoWeek').format('MM/DD')}
            </span>
            <button
              onClick={() => setViewedWeek(dayjs(viewedWeek).add(1, 'week').toDate())}
              className="px-3 py-1 bg-gray-100 dark:bg-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
            >
              ▶
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <StatCard label="전체" tone="blue" value={`${totalWeeklyHours.toFixed(2)}시간`} />
            <StatCard label="평일" tone="green" value={`${weekdayHours.toFixed(2)}시간`} />
            <StatCard label="휴일" tone="orange" value={`${weekendHours.toFixed(2)}시간`} />
          </div>
          {weeklyLogs.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500">이 주 기록이 없어요.</p>
          ) : (
            weeklyLogs.map((log) => (
              <div
                key={log.id}
                className="flex justify-between text-sm py-2 border-b dark:border-zinc-700 dark:text-zinc-300"
              >
                <span>{dayjs(log.date).format('MM/DD (ddd)')}</span>
                <span>
                  {log.start_time} ~ {log.end_time}
                </span>
                <span className="font-semibold">{calcHours(log)}시간</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
