'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import Card from '@/app/components/ui/Card'
import StatCard from '@/app/components/ui/StatCard'
import LoadError from '@/app/components/ui/LoadError'
import ConfirmDialog from '@/app/components/ui/ConfirmDialog'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'

export default function MyPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [name, setName] = useState('')
  const [totalVacation, setTotalVacation] = useState<number>(0)
  const [usedVacation, setUsedVacation] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isMaster, setIsMaster] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteSection, setShowDeleteSection] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const fetchProfile = async (userId: string) => {
    setLoadFailed(false)
    const { data, error } = await supabase
      .from('profiles')
      .select('name, total_vacation, is_master')
      .eq('id', userId)
      .single()
    if (error) {
      // 실패를 넘기면 이름이 빈칸, 총 휴가가 0으로 보인다. 그대로 저장하면 값이 덮인다.
      setLoadFailed(true)
      return
    }
    if (data) {
      setName(data.name || '')
      setTotalVacation(data.total_vacation || 0)
      if (data.is_master) setIsMaster(true)
    }
  }

  const fetchUsedVacation = async (userId: string) => {
    const now = dayjs()
    const fiscalYearStart = now.month() >= 3 ? now.year() : now.year() - 1
    const startDate = `${fiscalYearStart}-04-01`
    const endDate = `${fiscalYearStart + 1}-03-31`

    const { data } = await supabase
      .from('vacations')
      .select('type')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (data) {
      const used = data.reduce((acc, v) => {
        if (v.type === 'annual') return acc + 1
        if (v.type === 'morning' || v.type === 'afternoon') return acc + 0.5
        if (v.type === 'special') return acc + 0
        return acc
      }, 0)
      setUsedVacation(used)
    }
  }

  // 데이터 조회는 선언 뒤에서, 그리고 마이크로태스크로 미뤄서 부른다.
  // effect 본문에서 곧바로 부르면 setState가 동기로 일어나 렌더가 연쇄된다.
  useEffect(() => {
    if (!user) return
    const id = user.id
    void Promise.resolve().then(() => {
      fetchProfile(id)
      fetchUsedVacation(id)
    })
  }, [user])

  const handleSave = async () => {
    if (!user) return
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage('비밀번호는 6자리 이상이어야 해요.')
      return
    }
    // 확인 입력이 없으면 오타를 친 채로 바뀌고, 그 값을 아무도 모른다.
    if (newPassword !== newPasswordConfirm) {
      setPasswordMessage('두 비밀번호가 서로 달라요.')
      return
    }
    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setPasswordMessage('변경 실패: ' + error.message)
    else {
      setPasswordMessage('비밀번호가 변경됐어요.')
      setNewPassword('')
      setNewPasswordConfirm('')
    }
    setPasswordLoading(false)
  }

  const handleDeleteAccount = async () => {
    if (!user) return
    if (deleteConfirm !== user.email) {
      setDeleteMessage('이메일 주소가 일치하지 않아요.')
      return
    }

    setDeleteMessage('')
    setDeleteLoading(true)

    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })

    if (!res.ok) {
      const data = await res.json()
      setDeleteMessage('탈퇴 처리 중 오류가 발생했어요: ' + (data.error || '알 수 없는 오류'))
      setDeleteLoading(false)
      return
    }

    await supabase.auth.signOut()
    router.push('/login')
    setDeleteLoading(false)
  }

  const remaining = totalVacation - usedVacation

  return (
    <main className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-6">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">마이페이지</h1>
          <div className="flex gap-3">
            {isMaster && (
              <button
                onClick={() => router.push('/admin')}
                className="text-sm text-red-500 hover:underline"
              >
                회원 관리
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 dark:text-zinc-400 hover:underline"
            >
              로그아웃
            </button>
          </div>
        </header>

        {loadFailed && (
          <LoadError
            message="프로필을 불러오지 못했습니다. 이 상태로 저장하면 기존 값이 덮일 수 있습니다."
            onRetry={() => user && fetchProfile(user.id)}
            className="mb-4"
          />
        )}

        {/* 프로필 설정 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-4 dark:text-white">프로필 설정</h2>

          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-zinc-400">이메일</label>
            <p className="text-sm font-medium mt-1 dark:text-zinc-200">{user?.email}</p>
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-zinc-400">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력해주세요"
              className="w-full border rounded-lg px-3 py-2 mt-1 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            />
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-500 dark:text-zinc-400">총 휴가 일수</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                value={totalVacation}
                onChange={(e) => setTotalVacation(parseFloat(e.target.value))}
                step="0.5"
                min="0"
                className="w-full border rounded-lg px-3 py-2 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              />
              <span className="text-sm text-gray-500 dark:text-zinc-400 shrink-0">일</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">반차는 0.5일로 계산돼요</p>
          </div>

          {message && <p className="text-sm text-center text-blue-500 mb-3">{message}</p>}

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '저장 중...' : '저장'}
          </button>
        </Card>

        {/* 휴가 현황 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-4 dark:text-white">올해 휴가 현황</h2>
          <div className="flex gap-3 mb-4">
            <StatCard label="총 휴가" tone="blue" valueSize="xl" value={`${totalVacation}일`} />
            <StatCard label="사용" tone="orange" valueSize="xl" value={`${usedVacation}일`} />
            {/* 잔여가 음수면 초과 사용이다. 초록으로 두면 색이 정반대를 말한다. */}
            <StatCard
              label="잔여"
              tone={remaining < 0 ? 'red' : 'green'}
              valueSize="xl"
              value={`${remaining}일`}
            />
          </div>
          {/* 총 휴가가 0이면 0일~0일짜리 빈 막대만 남아 아무 정보도 주지 않는다. */}
          {totalVacation > 0 ? (
            <>
              <div className="w-full bg-gray-100 dark:bg-zinc-700 rounded-full h-3">
                <div
                  className="bg-green-400 h-3 rounded-full transition-all"
                  style={{ width: `${Math.max(0, (remaining / totalVacation) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 dark:text-zinc-500 mt-1">
                <span>0일</span>
                <span>{totalVacation}일</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              총 휴가 일수를 입력하면 잔여 비율이 표시됩니다.
            </p>
          )}
        </Card>

        {/* 비밀번호 변경 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-4 dark:text-white">비밀번호 변경</h2>
          <div className="mb-3">
            <label className="text-sm text-gray-500 dark:text-zinc-400">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6자리 이상"
              className="w-full border rounded-lg px-3 py-2 mt-1 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            />
          </div>
          <div className="mb-3">
            <label className="text-sm text-gray-500 dark:text-zinc-400">새 비밀번호 확인</label>
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              placeholder="한 번 더 입력"
              className="w-full border rounded-lg px-3 py-2 mt-1 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            />
          </div>
          {passwordMessage && (
            <p className="text-sm text-center text-blue-500 mb-3">{passwordMessage}</p>
          )}
          <button
            onClick={handlePasswordChange}
            disabled={passwordLoading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {passwordLoading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </Card>

        {/* 회원 탈퇴 */}
        <Card>
          <div className="flex justify-between items-center">
            <h2 className="font-semibold dark:text-white">회원 탈퇴</h2>
            <button
              onClick={() => setShowDeleteSection(!showDeleteSection)}
              className="text-sm text-red-400 hover:text-red-600"
            >
              {showDeleteSection ? '닫기' : '탈퇴하기'}
            </button>
          </div>

          {showDeleteSection && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
                탈퇴하면 모든 근무 기록, 휴가, 팀 정보가 삭제되며 복구할 수 없어요.
                <br />
                확인을 위해 이메일 주소를 입력해주세요.
              </p>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user?.email}
                className="w-full border border-red-200 rounded-lg px-3 py-2 mb-3 dark:bg-zinc-700 dark:border-red-900 dark:text-zinc-200"
              />
              {deleteMessage && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400">{deleteMessage}</p>
              )}
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteLoading || deleteConfirm !== user?.email}
                className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 disabled:opacity-40"
              >
                {deleteLoading ? '처리 중...' : '회원 탈퇴'}
              </button>
            </div>
          )}
        </Card>

        <ConfirmDialog
          open={confirmingDelete}
          tone="danger"
          busy={deleteLoading}
          title="정말 탈퇴할까요?"
          description="근무 기록, 휴가, 팀 정보가 모두 삭제됩니다. 되돌릴 수 없습니다."
          confirmLabel="탈퇴"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            handleDeleteAccount()
          }}
        />
      </div>
    </main>
  )
}
