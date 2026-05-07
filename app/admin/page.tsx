'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'


export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [holidays, setHolidays] = useState<any[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      // 마스터 계정 확인
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_master')
        .eq('id', user.id)
        .single()
      if (!profileData?.is_master) {
        router.push('/')
        return
      }
      fetchProfiles()
      fetchHolidays()
    }
    getUser()
  }, [])

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, name, is_master, total_vacation')
      .order('email', { ascending: true })
    if (data) setProfiles(data)
  }
const fetchHolidays = async () => {
  const { data } = await supabase
    .from('substitute_holidays')
    .select('*')
    .order('date', { ascending: true })
  if (data) setHolidays(data)
}
  const handleDelete = async (profile: any) => {
  if (profile.is_master) {
    setMessage('마스터 계정은 삭제할 수 없어요.')
    return
  }
  const confirmed = confirm(`"${profile.name || profile.email}" 회원을 강제 탈퇴시킬까요? 모든 데이터가 삭제돼요.`)
  if (!confirmed) return
  const confirmed2 = confirm('정말요? 복구할 수 없어요.')
  if (!confirmed2) return

  setLoading(true)

  // 관련 데이터 먼저 삭제
  await supabase.from('work_logs').delete().eq('user_id', profile.id)
  await supabase.from('vacations').delete().eq('user_id', profile.id)
  await supabase.from('remote_works').delete().eq('user_id', profile.id)
  await supabase.from('commute_plans').delete().eq('user_id', profile.id)
  await supabase.from('team_members').delete().eq('user_id', profile.id)
  await supabase.from('team_requests').delete().eq('user_id', profile.id)

  // auth 유저 삭제
  const res = await fetch('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: profile.id })
  })
  const data = await res.json()

  if (!res.ok || data.error) {
    setMessage('삭제 실패: ' + (data.error || '알 수 없는 오류'))
  } else {
    setMessage(`${profile.name || profile.email} 회원이 탈퇴됐어요.`)
    fetchProfiles()
  }

  setLoading(false)
}

  const handleToggleMaster = async (profile: any) => {
    if (profile.id === user?.id) {
      setMessage('본인의 마스터 권한은 변경할 수 없어요.')
      return
    }
    await supabase.from('profiles')
      .update({ is_master: !profile.is_master })
      .eq('id', profile.id)
    fetchProfiles()
  }
  
  const handleAddHoliday = async () => {
  if (!newHolidayDate || !newHolidayName) {
    setMessage('날짜와 이름을 모두 입력해주세요.')
    return
  }
  const { error } = await supabase
    .from('substitute_holidays')
    .insert({ date: newHolidayDate, name: newHolidayName })
  if (error) setMessage('추가 실패: ' + error.message)
  else {
    setMessage('대체공휴일이 추가됐어요!')
    setNewHolidayDate('')
    setNewHolidayName('')
    fetchHolidays()
  }
}

const handleDeleteHoliday = async (id: string) => {
  await supabase.from('substitute_holidays').delete().eq('id', id)
  fetchHolidays()
}
  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">회원 관리</h1>
          <button onClick={() => router.push('/mypage')}
            className="text-sm text-gray-500 hover:underline">
            ← 마이페이지
          </button>
        </div>

        {message && (
          <div className="bg-blue-50 text-blue-500 text-sm rounded-xl p-3 mb-4 text-center">
            {message}
          </div>
        )}

        {/* 회원 목록 */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-3">전체 회원 ({profiles.length}명)</h2>
          {profiles.map((profile) => (
            <div key={profile.id}
              className="flex justify-between items-center py-3 border-b last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {profile.name || '이름 미설정'}
                  </span>
                  {profile.is_master && (
                    <span className="text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full">
                      마스터
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{profile.email}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleMaster(profile)}
                  className={`text-xs px-2 py-1 rounded-lg ${
                    profile.is_master
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-red-50 text-red-500 hover:bg-red-100'
                  }`}>
                  {profile.is_master ? '마스터 해제' : '마스터 지정'}
                </button>
                {!profile.is_master && (
                  <button
                    onClick={() => handleDelete(profile)}
                    disabled={loading}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                    강제 탈퇴
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* 대체공휴일 관리 */}
<div className="bg-white rounded-xl shadow p-4 mt-4">
  <h2 className="font-semibold mb-3">대체공휴일 관리</h2>
  
  {/* 추가 */}
  <div className="flex gap-2 mb-4">
    <input
      type="date"
      value={newHolidayDate}
      onChange={(e) => setNewHolidayDate(e.target.value)}
      className="flex-1 border rounded-lg px-3 py-2 text-sm"
    />
    <input
      type="text"
      value={newHolidayName}
      onChange={(e) => setNewHolidayName(e.target.value)}
      placeholder="명칭 (예: 석가탄신일 대체)"
      className="flex-1 border rounded-lg px-3 py-2 text-sm"
    />
    <button
      onClick={handleAddHoliday}
      className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600">
      추가
    </button>
  </div>

  {/* 목록 */}
  {holidays.length === 0 ? (
    <p className="text-sm text-gray-400">등록된 대체공휴일이 없어요.</p>
  ) : (
    holidays.map((h) => (
      <div key={h.id}
        className="flex justify-between items-center py-2 border-b last:border-0">
        <div>
          <span className="text-sm font-medium">{h.date}</span>
          <span className="text-xs text-gray-400 ml-2">{h.name}</span>
        </div>
        <button
          onClick={() => handleDeleteHoliday(h.id)}
          className="text-xs text-red-500 hover:underline">
          삭제
        </button>
      </div>
    ))
  )}
</div>
        </div>

      </div>
    </div>
  )
}