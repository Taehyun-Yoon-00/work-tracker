'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'


export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profiles, setProfiles] = useState<any[]>([])
  const [generalAdminIds, setGeneralAdminIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [holidays, setHolidays] = useState<any[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testName, setTestName] = useState('')
  const [creatingTestUser, setCreatingTestUser] = useState(false)

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
    const [{ data }, { data: generalAdminRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, name, is_master, total_vacation')
        .order('email', { ascending: true }),
      supabase.from('general_admins').select('user_id'),
    ])
    setGeneralAdminIds(new Set((generalAdminRows || []).map((r: any) => r.user_id)))
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

  const handleToggleGeneralAdmin = async (profile: any) => {
    const isCurrentlyGeneralAdmin = generalAdminIds.has(profile.id)
    if (isCurrentlyGeneralAdmin) {
      const { error } = await supabase.from('general_admins').delete().eq('user_id', profile.id)
      if (error) { setMessage('총괄 관리자 해제 실패: ' + error.message); return }
    } else {
      const { error } = await supabase
        .from('general_admins')
        .insert({ user_id: profile.id, created_by: user?.id })
      if (error) { setMessage('총괄 관리자 지정 실패: ' + error.message); return }
    }
    fetchProfiles()
  }

  const handleCreateTestUser = async () => {
    if (!testEmail.trim()) {
      setMessage('이메일을 입력해주세요.')
      return
    }
    setCreatingTestUser(true)
    setMessage('')

    const res = await fetch('/api/admin/create-test-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail.trim(), name: testName.trim() || undefined }),
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      setMessage('테스트 계정 생성 실패: ' + (data.error || '알 수 없는 오류'))
    } else {
      setMessage(`테스트 계정이 생성됐어요! 이메일: ${data.email} / 비밀번호: ${data.password}`)
      setTestEmail('')
      setTestName('')
      fetchProfiles()
    }
    setCreatingTestUser(false)
  }

  const handleResetPassword = async (profile: any) => {
    const confirmed = confirm(`"${profile.name || profile.email}" 의 비밀번호를 초기화할까요?`)
    if (!confirmed) return

    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.id })
    })
    const data = await res.json()

    if (data.error) {
      setMessage('초기화 실패: ' + data.error)
    } else {
      setMessage(`임시 비밀번호: ${data.tempPassword} (사용자에게 전달해주세요)`)
    }
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
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">관리</h1>
          <button onClick={() => router.push('/mypage')}
            className="text-sm text-gray-500 dark:text-zinc-400 hover:underline">
            ← 마이페이지
          </button>
        </div>

        {message && (
          <div className="bg-blue-50 dark:bg-blue-950 text-blue-500 text-sm rounded-xl p-3 mb-4 text-center">
            {message}
          </div>
        )}

        {/* 테스트 계정 생성 (이메일 인증 없이 즉시 로그인 가능한 계정을 만든다) */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-4">
          <h2 className="font-semibold mb-1 dark:text-white">테스트 계정 생성</h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
            이메일 인증 없이 바로 로그인 가능한 계정을 만들어요. 테스트 용도로만 사용해주세요.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="이메일 (예: test1@example.com)"
              className="flex-1 min-w-[180px] border dark:border-zinc-600 rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:text-zinc-200"
            />
            <input
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="이름 (선택)"
              className="flex-1 min-w-[120px] border dark:border-zinc-600 rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:text-zinc-200"
            />
            <button
              onClick={handleCreateTestUser}
              disabled={creatingTestUser}
              className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50">
              {creatingTestUser ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>

        {/* 회원 목록 */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4">
          <h2 className="font-semibold mb-3 dark:text-white">전체 회원 ({profiles.length}명)</h2>
          {profiles.map((profile) => (
            <div key={profile.id}
              className="flex justify-between items-center py-3 border-b dark:border-zinc-700 last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm dark:text-zinc-200">
                    {profile.name || '이름 미설정'}
                  </span>
                  {profile.is_master && (
                    <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-500 px-2 py-0.5 rounded-full">
                      마스터
                    </span>
                  )}
                  {generalAdminIds.has(profile.id) && (
                    <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-500 px-2 py-0.5 rounded-full">
                      총괄 관리자
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-zinc-500">{profile.email}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={() => handleToggleMaster(profile)}
                  className={`text-xs px-2 py-1 rounded-lg ${profile.is_master
                      ? 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200'
                      : 'bg-red-50 dark:bg-red-950 text-red-500 hover:bg-red-100'
                    }`}>
                  {profile.is_master ? '마스터 해제' : '마스터 지정'}
                </button>
                <button
                  onClick={() => handleToggleGeneralAdmin(profile)}
                  className={`text-xs px-2 py-1 rounded-lg ${generalAdminIds.has(profile.id)
                      ? 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200'
                      : 'bg-indigo-50 dark:bg-indigo-950 text-indigo-500 hover:bg-indigo-100'
                    }`}>
                  {generalAdminIds.has(profile.id) ? '총괄 관리자 해제' : '총괄 관리자 지정'}
                </button>
                {!profile.is_master && (
                  <>
                    <button
                      onClick={() => handleResetPassword(profile)}
                      className="text-xs px-2 py-1 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100">
                      비밀번호 초기화
                    </button>
                    <button
                      onClick={() => handleDelete(profile)}
                      disabled={loading}
                      className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200">
                      강제 탈퇴
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {/* 대체공휴일 관리 */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mt-4">
            <h2 className="font-semibold mb-3 dark:text-white">대체공휴일 관리</h2>

            {/* 추가 */}
            <div className="flex gap-2 mb-4">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="flex-1 border dark:border-zinc-600 rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:text-zinc-200"
              />
              <input
                type="text"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="명칭 (예: 광복절 대체)"
                className="flex-1 border dark:border-zinc-600 rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:text-zinc-200"
              />
              <button
                onClick={handleAddHoliday}
                className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600">
                추가
              </button>
            </div>

            {/* 목록 */}
            {holidays.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-zinc-500">등록된 대체공휴일이 없어요.</p>
            ) : (
              holidays.map((h) => (
                <div key={h.id}
                  className="flex justify-between items-center py-2 border-b dark:border-zinc-700 last:border-0">
                  <div>
                    <span className="text-sm font-medium dark:text-zinc-200">{h.date}</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 ml-2">{h.name}</span>
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