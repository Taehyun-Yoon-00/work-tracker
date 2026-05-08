'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

export default function MyPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [name, setName] = useState('')
  const [totalVacation, setTotalVacation] = useState<number>(0)
  const [usedVacation, setUsedVacation] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isMaster, setIsMaster] = useState(false)
const [currentPassword, setCurrentPassword] = useState('')
const [newPassword, setNewPassword] = useState('')
const [passwordMessage, setPasswordMessage] = useState('')
const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      fetchProfile(user.id)
      fetchUsedVacation(user.id)
    }
    getUser()
  }, [])

  const fetchProfile = async (userId: string) => {
  const { data } = await supabase
    .from('profiles')
    .select('name, total_vacation, is_master')
    .eq('id', userId)
    .single()
  if (data) {
    setName(data.name || '')
    setTotalVacation(data.total_vacation || 0)
    if (data.is_master) setIsMaster(true)
  }
}

  const fetchUsedVacation = async (userId: string) => {
    const thisYear = dayjs().year()
    const { data } = await supabase
      .from('vacations')
      .select('type')
      .eq('user_id', userId)
      .gte('date', `${thisYear}-01-01`)
      .lte('date', `${thisYear}-12-31`)

    if (data) {
const used = data.reduce((acc, v) => {
  if (v.type === 'annual') return acc + 1
  if (v.type === 'morning' || v.type === 'afternoon') return acc + 0.5
  if (v.type === 'special') return acc + 0  // 연차에 영향 없음
  return acc
}, 0)
      setUsedVacation(used)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage('')
    const { error } = await supabase
      .from('profiles')
      .update({ name, total_vacation: totalVacation })
      .eq('id', user.id)

    if (error) setMessage('저장 실패: ' + error.message)
    else setMessage('저장 완료!')
    setLoading(false)
  }

  const remaining = totalVacation - usedVacation

    const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handlePasswordChange = async () => {
  if (!newPassword || newPassword.length < 6) {
    setPasswordMessage('비밀번호는 6자리 이상이어야 해요.')
    return
  }
  setPasswordLoading(true)
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) setPasswordMessage('변경 실패: ' + error.message)
  else {
    setPasswordMessage('비밀번호가 변경됐어요!')
    setNewPassword('')
  }
  setPasswordLoading(false)
}

  return (
<div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-28">
  <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
  <h1 className="text-2xl font-bold">마이페이지</h1>
  <div className="flex gap-3">
    {isMaster && (
      <button onClick={() => router.push('/admin')}
        className="text-sm text-red-500 hover:underline">
        회원 관리
      </button>
    )}
        <button onClick={handleLogout}
      className="text-sm text-gray-500 hover:underline">
      로그아웃
    </button>
  </div>
</div>

        {/* 프로필 설정 */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <h2 className="font-semibold mb-4">프로필 설정</h2>

          <div className="mb-4">
            <label className="text-sm text-gray-500">이메일</label>
            <p className="text-sm font-medium mt-1">{user?.email}</p>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-500">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력해주세요"
              className="w-full border rounded-lg px-3 py-2 mt-1"
            />
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-500">총 휴가 일수</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                value={totalVacation}
                onChange={(e) => setTotalVacation(parseFloat(e.target.value))}
                step="0.5"
                min="0"
                className="w-full border rounded-lg px-3 py-2"
              />
              <span className="text-sm text-gray-500 shrink-0">일</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              반차는 0.5일로 계산돼요
            </p>
          </div>

          {message && (
            <p className="text-sm text-center text-blue-500 mb-3">{message}</p>
          )}

          <button onClick={handleSave} disabled={loading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50">
            {loading ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 휴가 현황 */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-4">올해 휴가 현황</h2>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">총 휴가</p>
              <p className="text-xl font-bold text-blue-500">{totalVacation}일</p>
            </div>
            <div className="flex-1 bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">사용</p>
              <p className="text-xl font-bold text-orange-500">{usedVacation}일</p>
            </div>
            <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">잔여</p>
              <p className="text-xl font-bold text-green-500">{remaining}일</p>
            </div>
          </div>

          {/* 잔여 휴가 바 */}
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-green-400 h-3 rounded-full transition-all"
              style={{
                width: totalVacation > 0
                  ? `${Math.max(0, (remaining / totalVacation) * 100)}%`
                  : '0%'
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0일</span>
            <span>{totalVacation}일</span>
          </div>
        </div>
      
      {/* 비밀번호 변경 */}
<div className="bg-white rounded-xl shadow p-4 mt-4">
  <h2 className="font-semibold mb-4">비밀번호 변경</h2>
  <div className="mb-3">
    <label className="text-sm text-gray-500">새 비밀번호</label>
    <input
      type="password"
      value={newPassword}
      onChange={(e) => setNewPassword(e.target.value)}
      placeholder="6자리 이상"
      className="w-full border rounded-lg px-3 py-2 mt-1"
    />
  </div>
  {passwordMessage && (
    <p className="text-sm text-center text-blue-500 mb-3">{passwordMessage}</p>
  )}
  <button onClick={handlePasswordChange} disabled={passwordLoading}
    className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50">
    {passwordLoading ? '변경 중...' : '비밀번호 변경'}
  </button>
</div>

      </div>
    </div>
  )
}