'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

export default function TeamPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [myTeams, setMyTeams] = useState<any[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isMaster, setIsMaster] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/login')
      else {
        setUser(user)
        fetchTeams(user.id)
      }
    }
    getUser()
  }, [])

  const fetchTeams = async (userId: string) => {
    // 내가 속한 팀
    const { data: myTeamData } = await supabase
      .from('team_members')
      .select('team_id, role, teams(id, name)')
      .eq('user_id', userId)

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
    if (!newTeamName.trim()) return
    setLoading(true)
    setMessage('')

    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name: newTeamName, created_by: user.id })
      .select()
      .single()

    if (error) {
      setMessage('팀 생성 실패: ' + error.message)
    } else {
      // 생성자를 팀장으로 자동 등록
      await supabase.from('team_members').insert({
        team_id: team.id,
        user_id: user.id,
        role: 'admin'
      })
      setMessage('팀이 생성됐어요!')
      setNewTeamName('')
      fetchTeams(user.id)
    }
    setLoading(false)
  }

  const handleJoinRequest = async (teamId: string) => {
    const { error } = await supabase
      .from('team_requests')
      .insert({ team_id: teamId, user_id: user.id })

    if (error) setMessage('이미 신청했거나 오류가 발생했어요.')
    else setMessage('가입 신청이 완료됐어요! 팀장 승인을 기다려주세요.')
  }

  const isMyTeam = (teamId: string) => {
    return myTeams.some((t) => t.team_id === teamId)
  }

    const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }
  
  return (
<div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-28">
  <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">팀 관리</h1>
    <button onClick={handleLogout}
      className="text-sm text-gray-500 hover:underline">
      로그아웃
    </button>
        </div>

        {/* 팀 생성 */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <h2 className="font-semibold mb-3">새 팀 만들기</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="팀 이름"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2"
            />
            <button onClick={handleCreateTeam} disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50">
              생성
            </button>
          </div>
          {message && <p className="text-sm text-blue-500 mt-2">{message}</p>}
        </div>

        {/* 내 팀 목록 */}
        {myTeams.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <h2 className="font-semibold mb-3">내 팀</h2>
            {myTeams.map((t) => (
              <div key={t.team_id}
                className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <span className="font-medium">{t.teams?.name}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    t.role === 'admin' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {t.role === 'admin' ? '팀장' : '팀원'}
                  </span>
                </div>
                <button onClick={() => router.push(`/team/${t.team_id}`)}
                  className="text-sm text-blue-500 hover:underline">
                  입장 →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 전체 팀 목록 */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-3">전체 팀 목록</h2>
          {teams.length === 0 ? (
            <p className="text-sm text-gray-400">아직 팀이 없어요.</p>
          ) : (
            teams.map((team) => (
              <div key={team.id}
                className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="font-medium">{team.name}</span>
                {isMyTeam(team.id) || isMaster ? (
  <button onClick={() => router.push(`/team/${team.id}`)}
    className="text-sm text-blue-500 hover:underline">
    입장 →
  </button>
) : (
  <button onClick={() => handleJoinRequest(team.id)}
    className="text-sm bg-gray-100 px-3 py-1 rounded-lg hover:bg-gray-200">
    가입 신청
  </button>
)}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}