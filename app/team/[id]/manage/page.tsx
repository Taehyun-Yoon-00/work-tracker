'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function ManagePage() {
  const router = useRouter()
  const { id } = useParams()
  const [user, setUser] = useState<any>(null)
  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [isMaster, setIsMaster] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)
      fetchData(user.id)
    }
    getUser()
  }, [])

  const fetchData = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('is_master')
      .eq('id', userId)
      .single()
    if (profileData?.is_master) setIsMaster(true)

    const { data: teamData } = await supabase
      .from('teams').select('*').eq('id', id).single()
    if (teamData) setTeam(teamData)

    const { data: memberData } = await supabase
      .from('team_members')
      .select('*, profiles(id, email, name)')
      .eq('team_id', id)
    if (memberData) {
      setMembers(memberData)
      // 팀장이 아니면 접근 차단
      const myRole = memberData.find((m) => m.user_id === userId)
      if (myRole?.role !== 'admin' && !profileData?.is_master) router.push(`/team/${id}`)
    }
  }

  const adminCount = members.filter((m) => m.role === 'admin').length

  const handleToggleAdmin = async (member: any) => {
    setMessage('')
    if (member.role === 'admin' && adminCount <= 1) {
      setMessage('팀장이 최소 1명은 있어야 해요.')
      return
    }
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await supabase.from('team_members')
      .update({ role: newRole })
      .eq('id', member.id)
    fetchData(user.id)
  }

  const handleKick = async (member: any) => {
    setMessage('')
    if (member.role === 'admin' && adminCount <= 1) {
      setMessage('마지막 팀장은 내보낼 수 없어요.')
      return
    }
    const confirmed = confirm(`${member.profiles?.name || member.profiles?.email} 님을 팀에서 내보낼까요?`)
    if (!confirmed) return
    await supabase.from('team_members')
      .delete()
      .eq('id', member.id)
    fetchData(user.id)
  }

  const handleDeleteTeam = async () => {
    const confirmed = confirm(`"${team?.name}" 팀을 정말 삭제할까요? 모든 데이터가 삭제되며 복구할 수 없어요.`)
    if (!confirmed) return

    const confirmed2 = confirm('정말요? 팀원들의 가입 정보와 근무기록 연결이 모두 끊겨요.')
    if (!confirmed2) return

    await supabase.from('team_members').delete().eq('team_id', id)
    await supabase.from('team_requests').delete().eq('team_id', id)
    await supabase.from('teams').delete().eq('id', id)

    router.push('/team')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 pb-28">
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{team?.name} 관리</h1>
          <button onClick={() => router.push(`/team/${id}`)}
            className="text-sm text-gray-500 hover:underline">
            ← 팀으로
          </button>
        </div>

        {message && (
          <div className="bg-red-50 text-red-500 text-sm rounded-xl p-3 mb-4 text-center">
            {message}
          </div>
        )}

        {/* 팀원 목록 */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-3">팀원 관리</h2>
          {members.map((member) => (
            <div key={member.id}
              className="flex justify-between items-center py-3 border-b last:border-0">
              <div>
                <span className="font-medium">
                  {member.profiles?.name || member.profiles?.email?.split('@')[0]}
                </span>
                <span className="text-xs text-gray-400 ml-1">
                  {member.profiles?.email}
                </span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${member.role === 'admin'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                  {member.role === 'admin' ? '팀장' : '팀원'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleAdmin(member)}
                  className={`text-xs px-3 py-1 rounded-lg ${member.role === 'admin'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                    }`}>
                  {member.role === 'admin' ? '팀장 해제' : '팀장 지정'}
                </button>
                {member.user_id !== user?.id && (
                  <button
                    onClick={() => handleKick(member)}
                    className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                    내보내기
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* 팀 삭제 */}
        <div className="bg-red-50 rounded-xl shadow p-4 mt-4">
          <h2 className="font-semibold text-red-500 mb-2">주의</h2>
          <p className="text-xs text-gray-500 mb-3">팀을 삭제하면 모든 팀 데이터가 삭제돼요.</p>
          <button
            onClick={handleDeleteTeam}
            className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600">
            팀 삭제
          </button>
        </div>
      </div>
    </div>
  )
}