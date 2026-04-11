'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useRouter } from 'next/navigation'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import Holidays from 'date-holidays'

const hd = new Holidays('KR')

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('60')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [weeklyLogs, setWeeklyLogs] = useState<any[]>([])
  const [vacation, setVacation] = useState<string | null>(null)
  const [vacationLoading, setVacationLoading] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [monthlyLogs, setMonthlyLogs] = useState<any[]>([])
  const [commutePlan, setCommutePlan] = useState<string | null>(null)
  const [isRemote, setIsRemote] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [monthlyVacations, setMonthlyVacations] = useState<any[]>([])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else setUser(user)
    }
    getUser()
  }, [])

useEffect(() => {
  if (user) {
    fetchWeeklyLogs()
    fetchMonthlyLogs()
    fetchMonthlyVacations()
    fetchMonthCommutePlans()
    fetchVacation(selectedDate)
    fetchDayLog(selectedDate)
    fetchRemote(selectedDate)
  }
}, [user, selectedDate])

const fetchWeeklyLogs = async () => {
  const startOfWeek = dayjs(selectedDate).startOf('isoWeek').format('YYYY-MM-DD')
  const endOfWeek = dayjs(selectedDate).endOf('isoWeek').format('YYYY-MM-DD')

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
  const startOfMonth = dayjs(selectedDate).startOf('month').format('YYYY-MM-DD')
  const endOfMonth = dayjs(selectedDate).endOf('month').format('YYYY-MM-DD')

  const { data } = await supabase
    .from('work_logs')
    .select('date')
    .eq('user_id', user.id)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth)

  if (data) setMonthlyLogs(data)
}

const fetchMonthlyVacations = async () => {
  const startOfMonth = dayjs(selectedDate).startOf('month').format('YYYY-MM-DD')
  const endOfMonth = dayjs(selectedDate).endOf('month').format('YYYY-MM-DD')
  const { data } = await supabase
    .from('vacations')
    .select('date, type')
    .eq('user_id', user.id)
    .gte('date', startOfMonth)
    .lte('date', endOfMonth)
  if (data) setMonthlyVacations(data)
}

const fetchCommutePlan = async () => {
  const weekStart = dayjs(selectedDate).startOf('isoWeek').format('YYYY-MM-DD')
  const { data } = await supabase
    .from('commute_plans')
    .select('commute_time')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()
  setCommutePlan(data?.commute_time || null)
}


const fetchDayLog = async (date: Date) => {
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
  } else {
    setStartTime('')
    setEndTime('')
    setBreakMinutes('60')
    setMemo('')
    setIsLocked(false)
  }
}

const fetchVacation = async (date: Date) => {
  const { data } = await supabase
    .from('vacations')
    .select('type')
    .eq('user_id', user.id)
    .eq('date', dayjs(date).format('YYYY-MM-DD'))
    .single()
  setVacation(data?.type || null)
}
const fetchRemote = async (date: Date) => {
  const { data } = await supabase
    .from('remote_works')
    .select('id')
    .eq('user_id', user.id)
    .eq('date', dayjs(date).format('YYYY-MM-DD'))
    .single()
  setIsRemote(!!data)
}

const handleRemote = async () => {
  setRemoteLoading(true)
  if (isRemote) {
    await supabase.from('remote_works')
      .delete()
      .eq('user_id', user.id)
      .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
    setIsRemote(false)
  } else {
    await supabase.from('remote_works').upsert({
      user_id: user.id,
      date: dayjs(selectedDate).format('YYYY-MM-DD'),
    }, { onConflict: 'user_id,date' })
    setIsRemote(true)
  }
  setRemoteLoading(false)
}

const handleVacation = async (type: string) => {
  setVacationLoading(true)
  if (vacation === type) {
    // 같은 버튼 누르면 취소
    await supabase.from('vacations')
      .delete()
      .eq('user_id', user.id)
      .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
    setVacation(null)
  } else {
    await supabase.from('vacations').upsert({
      user_id: user.id,
      date: dayjs(selectedDate).format('YYYY-MM-DD'),
      type,
    }, { onConflict: 'user_id,date' })
    setVacation(type)
  }
  setVacationLoading(false)
}
  const handleSave = async () => {
    if (!startTime || !endTime) {
      setMessage('출근/퇴근 시간을 입력해주세요.')
      return
    }
    setLoading(true)
    setMessage('')

    const { error } = await supabase.from('work_logs').upsert({
      user_id: user.id,
      date: dayjs(selectedDate).format('YYYY-MM-DD'),
      start_time: startTime,
      end_time: endTime,
      break_minutes: parseInt(breakMinutes),
      memo,
    }, { onConflict: 'user_id,date' })

    if (error) setMessage('저장 실패: ' + error.message)
else {
  setMessage('저장 완료!')
  setIsLocked(true)
  fetchWeeklyLogs()
}
    setLoading(false)
  }
const handleDelete = async () => {
  const confirmed = confirm('이 날의 근무기록을 삭제할까요?')
  if (!confirmed) return
  setDeleteLoading(true)
  await supabase.from('work_logs')
    .delete()
    .eq('user_id', user.id)
    .eq('date', dayjs(selectedDate).format('YYYY-MM-DD'))
  setStartTime('')
  setEndTime('')
  setBreakMinutes('60')
  setMemo('')
  setIsLocked(false)
  setMessage('')
  fetchWeeklyLogs()
  fetchMonthlyLogs()
  setDeleteLoading(false)
}
  const isHoliday = (date: Date) => {
  const day = dayjs(date).day()
  if (day === 0 || day === 6) return true
  return !!hd.isHoliday(date)
}
const getTileClassName = ({ date }: { date: Date }) => {
  const day = date.getDay()
  const dateStr = dayjs(date).format('YYYY-MM-DD')
  const isToday = dateStr === dayjs().format('YYYY-MM-DD')
  const hasLog = monthlyLogs.some((log) => log.date === dateStr)
  const hasVacation = monthlyVacations.some((v) => v.date === dateStr)

  let className = ''
  if (hasLog && !isToday) className += '!bg-blue-100 rounded-lg '
  if (hasVacation && !isToday) className += '!bg-orange-100 rounded-lg '
  if (day === 6) className += '!text-blue-500 font-semibold'
  else if (day === 0 || hd.isHoliday(date)) className += '!text-red-500 font-semibold'

  return className.trim()
}
const getWeekStart = (date: Date) => 
  dayjs(date).startOf('isoWeek').format('YYYY-MM-DD')

const [weekPlans, setWeekPlans] = useState<{ [key: string]: string }>({})

const fetchMonthCommutePlans = async () => {
  const { data } = await supabase
    .from('commute_plans')
    .select('week_number, commute_time')
    .eq('user_id', user.id)
  if (data) {
    const plans: { [key: string]: string } = {}
    data.forEach((d) => { plans[String(d.week_number)] = d.commute_time })
    setWeekPlans(plans)
  }
}

const handleCommutePlan = async (weekNumber: string, time: string) => {
  if (weekPlans[weekNumber] === time) {
    await supabase.from('commute_plans')
      .delete()
      .eq('user_id', user.id)
      .eq('week_number', parseInt(weekNumber))
    setWeekPlans((prev) => { const n = { ...prev }; delete n[weekNumber]; return n })
  } else {
    await supabase.from('commute_plans').upsert({
      user_id: user.id,
      week_number: parseInt(weekNumber),
      commute_time: time,
    }, { onConflict: 'user_id,week_number' })
    setWeekPlans((prev) => ({ ...prev, [weekNumber]: time }))
  }
}

const getTileContent = ({ date }: { date: Date }) => {
  return null
}
  const calcHours = (log: any) => {
    const start = dayjs(`2000-01-01 ${log.start_time}`)
    const end = dayjs(`2000-01-01 ${log.end_time}`)
    const diff = end.diff(start, 'minute') - log.break_minutes
    return (diff / 60).toFixed(1)
  }

  const totalWeeklyHours = weeklyLogs.reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)

const weekdayHours = weeklyLogs
  .filter((log) => !isHoliday(new Date(log.date)))
  .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)

const weekendHours = weeklyLogs
  .filter((log) => isHoliday(new Date(log.date)))
  .reduce((acc, log) => acc + parseFloat(calcHours(log)), 0)
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
<div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-20">
  <div className="w-full max-w-2xl mx-auto">

{/* 헤더 */}
<div className="flex justify-between items-center mb-6">
  <h1 className="text-2xl font-bold">근무시간 기록</h1>
  <div className="flex gap-3">
    <button onClick={() => router.push('/mypage')}
      className="text-sm text-blue-500 hover:underline">
      마이페이지
    </button>
    <button onClick={() => router.push('/team')}
      className="text-sm text-blue-500 hover:underline">
      팀 관리
    </button>
    <button onClick={handleLogout}
      className="text-sm text-gray-500 hover:underline">
      로그아웃
    </button>
  </div>
</div>


{/* 달력 */}
<div className="bg-white rounded-xl shadow p-3 mb-4">
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
<div className="flex flex-col shrink-0 mt-[64px] sm:mt-[90px]">
      {(() => {
        const monthStart = dayjs(selectedDate).startOf('month')
        const monthEnd = dayjs(selectedDate).endOf('month')
        const firstWeekStart = monthStart.startOf('isoWeek')
        const weeks = []
        let current = firstWeekStart
        while (current.isBefore(monthEnd) || current.isSame(monthEnd, 'day')) {
          weeks.push(current)
          current = current.add(1, 'week')
        }
        return weeks.map((weekStart, index) => {
          const weekNumber = String(index + 1)
          const plan = weekPlans[weekNumber]
          return (
            <div key={weekNumber}
              className="flex items-center justify-center h-8 sm:h-11">
              <div className="flex gap-0.5">
                <button
                  onClick={() => handleCommutePlan(weekNumber, '8시')}
                  className={`text-[8px] w-6 py-0.5 rounded-full border transition ${
                    plan === '8시'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-400 border-gray-300'
                  }`}>
                  8시
                </button>
                <button
                  onClick={() => handleCommutePlan(weekNumber, '9시')}
                  className={`text-[8px] w-6 py-0.5 rounded-full border transition ${
                    plan === '9시'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-400 border-gray-300'
                  }`}>
                  9시
                </button>
              </div>
            </div>
          )
        })
      })()}
    </div>
  </div>
</div>
        {/* 근무시간 입력 */}
<div className="bg-white rounded-xl shadow p-4 mb-4">
  <div className="flex justify-between items-center mb-3">
    <h2 className="font-semibold">
      {dayjs(selectedDate).format('YYYY년 MM월 DD일')} 근무 입력
    </h2>
    {isLocked && (
      <div className="flex gap-2">
    <button
      onClick={() => setIsLocked(false)}
      className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-200">
      ✏️ 수정
    </button>
    <button
      onClick={handleDelete}
      disabled={deleteLoading}
      className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-lg hover:bg-red-100">
      🗑️ 삭제
    </button>
  </div>
    )}
  </div>
  <div className="flex gap-2 mb-2">
    <div className="flex gap-20 mb-2">
  <div className="flex-1">
    <label className="text-sm text-gray-500">출근</label>
    <div className="flex gap-1 mt-1">
      <select
        value={startTime ? startTime.split(':')[0] : ''}
        onChange={(e) => setStartTime(`${e.target.value}:${startTime ? startTime.split(':')[1] : '00'}`)}
        disabled={isLocked}
        className={`flex-1 border rounded-lg px-2 py-2 ${isLocked ? 'bg-gray-50 text-gray-400' : ''}`}>
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
        onChange={(e) => setStartTime(`${startTime ? startTime.split(':')[0] : '00'}:${e.target.value}`)}
        disabled={isLocked}
        className={`flex-1 border rounded-lg px-2 py-2 ${isLocked ? 'bg-gray-50 text-gray-400' : ''}`}>
        <option value="">분</option>
        <option value="00">00</option>
        <option value="30">30</option>
      </select>
    </div>
  </div>

  <div className="flex-1">
    <label className="text-sm text-gray-500">퇴근</label>
    <div className="flex gap-1 mt-1">
      <select
        value={endTime ? endTime.split(':')[0] : ''}
        onChange={(e) => setEndTime(`${e.target.value}:${endTime ? endTime.split(':')[1] : '00'}`)}
        disabled={isLocked}
        className={`flex-1 border rounded-lg px-2 py-2 ${isLocked ? 'bg-gray-50 text-gray-400' : ''}`}>
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
        onChange={(e) => setEndTime(`${endTime ? endTime.split(':')[0] : '00'}:${e.target.value}`)}
        disabled={isLocked}
        className={`flex-1 border rounded-lg px-2 py-2 ${isLocked ? 'bg-gray-50 text-gray-400' : ''}`}>
        <option value="">분</option>
        <option value="00">00</option>
        <option value="30">30</option>
      </select>
    </div>
  </div>
</div>
  </div>
  <div className="mb-2">
    <label className="text-sm text-gray-500">휴게시간 (분)</label>
    <input type="number" value={breakMinutes}
      onChange={(e) => setBreakMinutes(e.target.value)}
      disabled={isLocked}
      className={`w-full border rounded-lg px-3 py-2 mt-1 ${
        isLocked ? 'bg-gray-50 text-gray-400' : ''
      }`} />
  </div>
  <div className="mb-3">
    <label className="text-sm text-gray-500">메모</label>
    <input type="text" value={memo}
      onChange={(e) => setMemo(e.target.value)}
      disabled={isLocked}
      className={`w-full border rounded-lg px-3 py-2 mt-1 ${
        isLocked ? 'bg-gray-50 text-gray-400' : ''
      }`} />
  </div>
  {message && <p className="text-sm text-center text-blue-500 mb-2">{message}</p>}
  {!isLocked && (
    <button onClick={handleSave} disabled={loading}
      className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50">
      {loading ? '저장 중...' : '저장'}
    </button>
  )}
</div>
{/* 휴가 입력 */}
<div className="bg-white rounded-xl shadow p-4 mb-4">
  <h2 className="font-semibold mb-3">
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
        }`}>
        {vacation === type ? `✓ ${label}` : label}
      </button>
    ))}
  </div>
  {vacation && (
    <p className="text-xs text-center text-gray-400 mt-2">
      다시 누르면 취소돼요
    </p>
  )}
</div>

{/* 원격근무 */}
<div className="bg-white rounded-xl shadow p-4 mb-4">
  <h2 className="font-semibold mb-3">
    {dayjs(selectedDate).format('YYYY년 MM월 DD일')} 원격근무
  </h2>
  <button
    onClick={handleRemote}
    disabled={remoteLoading}
    className={`w-full py-2 rounded-lg text-sm font-medium transition ${
      isRemote
        ? 'bg-indigo-500 text-white'
        : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
    }`}>
    {isRemote ? '✓ 원격근무' : '원격근무'}
  </button>
  {isRemote && (
    <p className="text-xs text-center text-gray-400 mt-2">
      다시 누르면 취소돼요
    </p>
  )}
</div>

        {/* 주간 합산 */}
        <div className="bg-white rounded-xl shadow p-4">
<h2 className="font-semibold mb-3">이번 주 근무시간</h2>
<div className="flex gap-2 mb-3">
  <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
    <p className="text-xs text-gray-500 mb-1">전체</p>
    <p className="text-lg font-bold text-blue-500">{totalWeeklyHours.toFixed(1)}시간</p>
  </div>
  <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
    <p className="text-xs text-gray-500 mb-1">평일</p>
    <p className="text-lg font-bold text-green-500">{weekdayHours.toFixed(1)}시간</p>
  </div>
  <div className="flex-1 bg-orange-50 rounded-lg p-3 text-center">
    <p className="text-xs text-gray-500 mb-1">휴일</p>
    <p className="text-lg font-bold text-orange-500">{weekendHours.toFixed(1)}시간</p>
  </div>
</div>
          {weeklyLogs.length === 0 ? (
            <p className="text-sm text-gray-400">이번 주 기록이 없어요.</p>
          ) : (
            weeklyLogs.map((log) => (
              <div key={log.id} className="flex justify-between text-sm py-2 border-b">
                <span>{dayjs(log.date).format('MM/DD (ddd)')}</span>
                <span>{log.start_time} ~ {log.end_time}</span>
                <span className="font-semibold">{calcHours(log)}시간</span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}