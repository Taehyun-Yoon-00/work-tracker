'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/app/hooks/useCurrentUser'
import Card from '@/app/components/ui/Card'
import type { MyTeamOption, Team } from '@/app/lib/types'

export default function TeamPage() {
  const router = useRouter()
  const { user } = useCurrentUser()
  const [teams, setTeams] = useState<Team[]>([])
  const [myTeams, setMyTeams] = useState<MyTeamOption[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isMaster, setIsMaster] = useState(false)

  useEffect(() => {
    if (user) fetchTeams(user.id)
  }, [user])

  const fetchTeams = async (userId: string) => {
    // 내가 속한 팀
    const { data: myTeamData } = await supabase
      .from('team_members')
      .select('team_id, role, teams(id, name)')
      .eq('user_id', userId)
      // 조인 결과를 supabase-js는 배열로 추론하지만, FK 관계라 실제로는 단일 객체다
      .returns<MyTeamOption[]>()

    if (myTeamData) setMyTeams(myTeamData)

    // 전체 팀 목록
    const { data: allTeams } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })

    if (allTeams) setTeams(allTeams)

    // 마스터 계정
    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_master')
      .eq('id', userId)
      .single()
    if (profileData?.is_master) setIsMaster(true)
  }

  const handleCreateTeam = async () => {
    if (!user) return
    if (!newTeamName.trim()) return
    setLoading(true)
    setMessage('')

    // 동일명 팀 존재 여부 확인
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('name', newTeamName.trim())
      .maybeSingle()

    if (existingTeam) {
      setMessage('이미 같은 이름의 팀이 있어요.')
      setLoading(false)
      return
    }

    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name: newTeamName.trim(), created_by: user.id })
      .select()
      .single()

    if (error) {
      setMessage('팀 생성 실패: ' + error.message)
    } else {
      // 생성자를 팀장으로 자동 등록
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: user.id,
        role: 'admin',
      })
      setMessage('팀이 생성됐어요!')
      setNewTeamName('')
      fetchTeams(user.id)
    }
    setLoading(false)
  }

  const handleJoinRequest = async (teamId: string) => {
    if (!user) return
    const { data: existing, error: fetchError } = await supabase
      .from('team_requests')
      .select('id, status')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'pending') {
        setMessage('이미 가입 신청 중이에요. 팀장 승인을 기다려주세요.')
        return
      }
      if (existing.status === 'rejected') {
        const { error } = await supabase
          .from('team_requests')
          .update({ status: 'pending' })
          .eq('id', existing.id)
        if (error) setMessage('재신청 실패: ' + error.message)
        else {
          setMessage('가입 신청이 완료됐어요! 팀장 승인을 기다려주세요.')
          fetchTeams(user.id)
        }
        return
      }
      if (existing.status === 'approved') {
        setMessage('이미 팀원이에요.')
        return
      }
    }

    const { error } = await supabase
      .from('team_requests')
      .insert({ team_id: teamId, user_id: user.id })

    if (error) setMessage('오류: ' + error.message)
    else {
      setMessage('가입 신청이 완료됐어요! 팀장 승인을 기다려주세요.')
      fetchTeams(user.id)
    }
  }

  const isMyTeam = (teamId: string) => {
    return myTeams.some((t) => t.team_id === teamId)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="grow bg-gray-50 dark:bg-zinc-900 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold dark:text-white">팀 관리</h1>
        </div>

        {/* 팀 생성 */}
        <Card className="mb-4">
          <h2 className="font-semibold mb-3 dark:text-white">새 팀 만들기</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="팀 이름"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            />
            <button
              onClick={handleCreateTeam}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              생성
            </button>
          </div>
          {message && <p className="text-sm text-blue-500 mt-2">{message}</p>}
        </Card>

        {/* 내 팀 목록 */}
        {myTeams.length > 0 && (
          <Card className="mb-4">
            <h2 className="font-semibold mb-3 dark:text-white">내 팀</h2>
            {myTeams.map((t) => (
              <div
                key={t.team_id}
                className="flex justify-between items-center py-2 border-b dark:border-zinc-700 last:border-0"
              >
                <div>
                  <span className="font-medium dark:text-zinc-200">{t.teams?.name}</span>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      t.role === 'admin'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400'
                    }`}
                  >
                    {t.role === 'admin' ? '팀장' : '팀원'}
                  </span>
                </div>
                <button
                  onClick={() => router.push(`/team/${t.team_id}`)}
                  className="text-sm text-blue-500 hover:underline"
                >
                  입장 →
                </button>
              </div>
            ))}
          </Card>
        )}

        {/* 전체 팀 목록 */}
        <Card>
          <h2 className="font-semibold mb-3 dark:text-white">전체 팀 목록</h2>
          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500">아직 팀이 없어요.</p>
          ) : (
            teams.map((team) => (
              <div
                key={team.id}
                className="flex justify-between items-center py-2 border-b dark:border-zinc-700 last:border-0"
              >
                <span className="font-medium dark:text-zinc-200">{team.name}</span>
                {isMyTeam(team.id) || isMaster ? (
                  <button
                    onClick={() => router.push(`/team/${team.id}`)}
                    className="text-sm text-blue-500 hover:underline"
                  >
                    입장 →
                  </button>
                ) : (
                  <button
                    onClick={() => handleJoinRequest(team.id)}
                    className="text-sm bg-gray-100 dark:bg-zinc-700 dark:text-zinc-300 px-3 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    가입 신청
                  </button>
                )}
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
