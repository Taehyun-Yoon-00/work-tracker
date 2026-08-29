'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import Card from '@/app/components/ui/Card'
import LoadError from '@/app/components/ui/LoadError'
import ConfirmDialog from '@/app/components/ui/ConfirmDialog'
import SkeletonRows from '@/app/components/ui/SkeletonRows'
import type { Profile, SubstituteHoliday } from '@/app/lib/types'

type AdminProfile = Pick<Profile, 'id' | 'email' | 'name' | 'is_master' | 'total_vacation'>

export default function AdminPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [confirming, setConfirming] = useState<{
    kind: 'delete' | 'reset'
    profile: AdminProfile
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [holidays, setHolidays] = useState<SubstituteHoliday[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')

  useEffect(() => {
    if (!user) return
    const checkAccess = async () => {
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
    checkAccess()
  }, [user])

  const fetchProfiles = async () => {
    setLoadFailed(false)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, is_master, total_vacation')
      .order('email', { ascending: true })
    setInitialLoading(false)
    if (error) {
      setLoadFailed(true)
      return
    }
    if (data) setProfiles(data)
  }
  const fetchHolidays = async () => {
    const { data } = await supabase
      .from('substitute_holidays')
      .select('*')
      .order('date', { ascending: true })
    if (data) setHolidays(data)
  }
  const handleDelete = async (profile: AdminProfile) => {
    if (profile.is_master) {
      setMessage('마스터 계정은 삭제할 수 없어요.')
      return
    }
    setLoading(true)

    // 관련 테이블과 auth 계정 삭제는 전부 서버가 한다.
    // 예전에는 여기서 브라우저가 anon key로 남의 행을 직접 지웠는데,
    // 그 때문에 RLS 정책에 마스터용 DELETE를 넓게 열어둬야 했다.
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.id }),
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

  const handleToggleMaster = async (profile: AdminProfile) => {
    if (profile.id === user?.id) {
      setMessage('본인의 마스터 권한은 변경할 수 없어요.')
      return
    }
    await supabase.from('profiles').update({ is_master: !profile.is_master }).eq('id', profile.id)
    fetchProfiles()
  }

  const handleResetPassword = async (profile: AdminProfile) => {
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.id }),
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
    <div className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">회원 관리</h1>
          <button
            onClick={() => router.push('/mypage')}
            className="text-sm text-gray-500 dark:text-zinc-400 hover:underline"
          >
            ← 마이페이지
          </button>
        </div>

        {loadFailed && (
          <LoadError
            message="회원 목록을 불러오지 못했습니다."
            onRetry={fetchProfiles}
            className="mb-4"
          />
        )}

        {message && (
          <div className="bg-blue-50 dark:bg-blue-950 text-blue-500 text-sm rounded-xl p-3 mb-4 text-center">
            {message}
          </div>
        )}

        {/* 회원 목록 */}
        <Card>
          <h2 className="font-semibold mb-3 dark:text-white">
            전체 회원 {initialLoading ? '' : `(${profiles.length}명)`}
          </h2>
          {initialLoading && <SkeletonRows rows={4} label="회원 목록" />}
          {!initialLoading &&
            profiles.map((profile) => (
              <div
                key={profile.id}
                className="flex justify-between items-center py-3 border-b dark:border-zinc-700 last:border-0"
              >
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
                  </div>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{profile.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleMaster(profile)}
                    className={`text-xs px-2 py-1 rounded-lg ${
                      profile.is_master
                        ? 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                        : 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                    }`}
                  >
                    {profile.is_master ? '마스터 해제' : '마스터 지정'}
                  </button>
                  {!profile.is_master && (
                    <>
                      <button
                        onClick={() => setConfirming({ kind: 'reset', profile })}
                        className="text-xs px-2 py-1 rounded-lg bg-yellow-50 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                      >
                        비밀번호 초기화
                      </button>
                      <button
                        onClick={() => setConfirming({ kind: 'delete', profile })}
                        disabled={loading}
                        className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
                      >
                        강제 탈퇴
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </Card>

        {/* 대체공휴일 관리 */}
        <Card className="mt-4">
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
              className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600"
            >
              추가
            </button>
          </div>

          {/* 목록 */}
          {holidays.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500">등록된 대체공휴일이 없어요.</p>
          ) : (
            holidays.map((h) => (
              <div
                key={h.id}
                className="flex justify-between items-center py-2 border-b dark:border-zinc-700 last:border-0"
              >
                <div>
                  <span className="text-sm font-medium dark:text-zinc-200">{h.date}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 ml-2">{h.name}</span>
                </div>
                <button
                  onClick={() => handleDeleteHoliday(h.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  삭제
                </button>
              </div>
            ))
          )}
        </Card>

        <ConfirmDialog
          open={confirming !== null}
          tone={confirming?.kind === 'delete' ? 'danger' : 'normal'}
          busy={loading}
          title={
            confirming?.kind === 'delete' ? '회원을 강제 탈퇴시킬까요?' : '비밀번호를 초기화할까요?'
          }
          description={
            confirming?.kind === 'delete' ? (
              <>
                <strong>{confirming.profile.name || confirming.profile.email}</strong> 회원의 근무
                기록, 휴가, 팀 정보가 모두 삭제됩니다. 되돌릴 수 없습니다.
              </>
            ) : (
              <>
                <strong>{confirming?.profile.name || confirming?.profile.email}</strong> 회원의
                비밀번호를 임시 비밀번호로 바꿉니다. 발급된 값을 직접 전달해야 합니다.
              </>
            )
          }
          confirmLabel={confirming?.kind === 'delete' ? '강제 탈퇴' : '초기화'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            if (!confirming) return
            const { kind, profile } = confirming
            setConfirming(null)
            if (kind === 'delete') handleDelete(profile)
            else handleResetPassword(profile)
          }}
        />
      </div>
    </div>
  )
}
