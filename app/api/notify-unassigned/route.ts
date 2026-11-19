import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'
import { getSessionUser } from '@/app/lib/apiAuth'
import { notifyAndPush } from '@/app/lib/notifications'
import { displayName } from '@/app/lib/labels'

// 미지정 인원(어느 팀·부서에도 속하지 않은 사람)이 생기면 소속을 배정할 수 있는 권한자들에게 알린다.
//
// - 알림은 "미지정이 된 사람 1명당 1건"이다. 여러 명이 동시에 대기 중이어도 "외 N명"으로 묶지 않고,
//   각자에 대한 알림이 따로 간다 (a가 대기 중일 때 b가 가입하면 b에 대한 알림만 새로 간다).
// - 이름을 아직 입력하지 않은 사람은 대상이 아니다. 회원가입 직후에는 프로필 이름이 비어 있고,
//   첫 로그인 때 마이페이지에서 이름을 저장하면 그때부터 미지정 인원으로 취급해 알린다.
// - 팀·부서 삭제나 소속 해제로 다시 미지정이 된 사람은 조직 관리 화면에서 데이터를 다시 불러오는 즉시 알린다.
//
// 호출 시점: 마이페이지에서 이름을 처음 저장했을 때, 조직 관리 화면에서 데이터를 다시 불러올 때.
// 호출자는 로그인만 되어 있으면 된다. 누구를 알릴지는 전부 서버가 DB로 판단하므로
// 클라이언트가 보내는 값은 없다(그래서 아무나 호출해도 "지금 실제로 새로 생긴 미지정 인원"만 알려진다).
//
// 중복 알림 방지: profiles.unassigned_notified_at 에 알린 시각을 남기고, 소속이 배정되면 null로 되돌린다.
//
// 알림을 받는 사람: 총괄 관리자, 부문장, 부장 (마스터는 시스템 관리자라 제외).

export async function POST() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
    }

    const [profilesRes, teamMembersRes, deptMembersRes, divisionsRes, departmentsRes, generalAdminsRes] =
      await Promise.all([
        supabaseAdmin.from('profiles').select('id, name, email, is_master, unassigned_notified_at'),
        supabaseAdmin.from('team_members').select('user_id'),
        supabaseAdmin.from('department_memberships').select('user_id'),
        supabaseAdmin.from('divisions').select('head_user_id'),
        supabaseAdmin.from('departments').select('head_user_id'),
        supabaseAdmin.from('general_admins').select('user_id'),
      ])

    const failed = [
      profilesRes,
      teamMembersRes,
      deptMembersRes,
      divisionsRes,
      departmentsRes,
      generalAdminsRes,
    ].find((r) => r.error)
    if (failed?.error) {
      console.error('notify-unassigned 조회 실패:', failed.error.message)
      return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
    }

    const profiles = profilesRes.data ?? []

    // 조직 관리 화면의 "미지정 인원"과 같은 기준: 마스터 계정은 조직 구성원 풀에서 빠지고,
    // 팀·부서 소속이 없으며 부문장/부장도 아닌 사람.
    const assignedIds = new Set<string>([
      ...(teamMembersRes.data ?? []).map((r) => r.user_id as string),
      ...(deptMembersRes.data ?? []).map((r) => r.user_id as string),
      ...(divisionsRes.data ?? []).map((r) => r.head_user_id as string | null).filter(Boolean) as string[],
      ...(departmentsRes.data ?? []).map((r) => r.head_user_id as string | null).filter(Boolean) as string[],
    ])
    // 이름을 아직 입력하지 않은 가입 직후 계정은 대상에서 뺀다 (이름 저장 뒤에 다시 판단된다).
    const unassigned = profiles.filter(
      (p) => !p.is_master && !assignedIds.has(p.id) && !!p.name?.trim()
    )
    const unassignedIds = new Set(unassigned.map((p) => p.id))

    // 소속이 배정된 사람은 표시를 지워서, 나중에 다시 미지정이 되면 새로 알림이 가게 한다.
    const resolvedIds = profiles
      .filter((p) => p.unassigned_notified_at && !unassignedIds.has(p.id))
      .map((p) => p.id)
    if (resolvedIds.length > 0) {
      await supabaseAdmin
        .from('profiles')
        .update({ unassigned_notified_at: null })
        .in('id', resolvedIds)
    }

    const fresh = unassigned.filter((p) => !p.unassigned_notified_at)
    if (fresh.length === 0) {
      return NextResponse.json({ success: true, notified: 0 })
    }

    // 동시에 여러 번 호출돼도 한 번만 알리도록, "아직 표시 없는 사람"만 먼저 선점(claim)한다.
    const claimedAt = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('profiles')
      .update({ unassigned_notified_at: claimedAt })
      .in(
        'id',
        fresh.map((p) => p.id)
      )
      .is('unassigned_notified_at', null)
      .select('id')
    if (claimError) {
      console.error('notify-unassigned 선점 실패:', claimError.message)
      return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
    }
    const claimedIds = new Set((claimed ?? []).map((r) => r.id as string))
    const targets = fresh.filter((p) => claimedIds.has(p.id))
    if (targets.length === 0) {
      return NextResponse.json({ success: true, notified: 0 })
    }

    // 받는 사람: 총괄 관리자 + 부문장 + 부장. 호출한 본인은 제외한다.
    // 마스터(시스템 관리자)는 받지 않는다 — 마스터 계정이 총괄 관리자도 겸하면 그쪽으로는 받는다.
    const recipientIds = new Set<string>([
      ...(generalAdminsRes.data ?? []).map((r) => r.user_id as string),
      ...(divisionsRes.data ?? []).map((r) => r.head_user_id as string | null).filter(Boolean) as string[],
      ...(departmentsRes.data ?? []).map((r) => r.head_user_id as string | null).filter(Boolean) as string[],
    ])
    recipientIds.delete(user.id)
    for (const p of profiles) if (p.is_master) recipientIds.delete(p.id)

    if (recipientIds.size === 0) {
      // 알릴 사람이 없으면 표시를 되돌려서, 권한자가 생긴 뒤에 다시 알림이 가게 한다.
      await supabaseAdmin
        .from('profiles')
        .update({ unassigned_notified_at: null })
        .in(
          'id',
          targets.map((p) => p.id)
        )
      return NextResponse.json({ success: true, notified: 0 })
    }

    // 한 사람당 한 건씩, 받는 사람마다 따로 보낸다.
    for (const target of targets) {
      const message = `${displayName(target, '이름 미설정')}님의 소속 배정이 필요해요.`
      await Promise.all(
        Array.from(recipientIds).map((receiverId) =>
          notifyAndPush(supabaseAdmin, {
            receiverId,
            type: 'UNASSIGNED',
            title: '소속 배정이 필요한 인원이 있어요',
            message,
            url: '/org?view=unassigned',
          })
        )
      )
    }

    return NextResponse.json({ success: true, notified: targets.length })
  } catch (err) {
    console.error('notify-unassigned error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
