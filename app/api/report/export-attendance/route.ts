import { NextRequest, NextResponse } from 'next/server'
import dayjs from 'dayjs'
import { getSessionUser } from '@/app/lib/apiAuth'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'
import { getSettlementPeriod } from '@/app/lib/dates'
<<<<<<< HEAD
import { displayName } from '@/app/lib/labels'
=======
import { reportFileNameLabel, reportInsideName } from '@/app/lib/labels'
>>>>>>> feature/UI_Refactoring
import { AttendanceTemplateError, buildAttendanceXlsx } from '@/app/lib/attendanceSheet'

export const runtime = 'nodejs'

const BUCKET = 'report-templates'

/**
 * 근무관리표(勤務管理表) 출력.
 *
 * 공개 범위: 이 라우트는 service role로 DB를 읽지만, 조회 대상은 항상 "로그인한 본인"의
 * 근무기록/휴가뿐이다. 요청 본문으로 대상 사용자를 받지 않으므로 다른 사람의 근무관리표는
 * 만들 수 없다(팀원/부서원 대리 출력은 지원하지 않는다). 양식 원본은 비공개 버킷에 있고
 * 일반 사용자는 직접 받을 수 없으며, 본인 데이터가 채워진 결과물만 내려받는다.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year, month가 필요해요.' }, { status: 400 })
  }

  // 1) 총괄 관리자가 올려둔 최신 근무관리표 양식
  const { data: templateRow, error: templateError } = await supabaseAdmin
    .from('report_templates')
    .select('storage_path')
    .eq('kind', 'attendance')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (templateError) {
    return NextResponse.json({ error: '양식 조회 실패: ' + templateError.message }, { status: 500 })
  }
  if (!templateRow) {
    return NextResponse.json(
      { error: '총괄 관리자가 아직 근무관리표 양식을 업로드하지 않았어요.' },
      { status: 404 }
    )
  }
  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(templateRow.storage_path)
  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: '양식 파일을 불러오지 못했어요: ' + (downloadError?.message ?? '') },
      { status: 500 }
    )
  }

<<<<<<< HEAD
  // 2) 본인 프로필(파일명에 들어갈 이름)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .single()
  const personName = displayName(profile, '이름미설정')
=======
  // 2) 본인 프로필 — 파일명에는 이니셜, 파일 내부 이름란(姓名)에는 한자가 들어간다.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email, name_hanja, name_initial')
    .eq('id', user.id)
    .single()
  const fileNameLabel = reportFileNameLabel(profile, '이름미설정')
  const insideName = reportInsideName(profile, '이름 미설정')
>>>>>>> feature/UI_Refactoring

  // 3) 정산 기간(전월 16일 ~ 당월 15일) — 리포트 화면/서포트리스트와 같은 규칙
  const monthStart = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
  const { start: periodStart, end: periodEnd } = getSettlementPeriod(monthStart)
  // 양식은 31행 고정이라 기간이 짧으면 뒤쪽 행이 기간 밖 날짜가 된다. 이 행들의 휴일 구분(A열)에
  // 쓰도록 대체공휴일은 31일 뒤까지 읽는다.
  const holidayRangeEnd = dayjs(periodStart).add(30, 'day').format('YYYY-MM-DD')

  // 4) 본인의 기간 내 근무기록 / 휴가 / 사내 대체공휴일
  const [logsRes, vacationsRes, holidaysRes] = await Promise.all([
    supabaseAdmin
      .from('work_logs')
      .select('date, start_time, end_time, is_next_day')
      .eq('user_id', user.id)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabaseAdmin
      .from('vacations')
      .select('date, type')
      .eq('user_id', user.id)
      .gte('date', periodStart)
      .lte('date', periodEnd),
    supabaseAdmin
      .from('substitute_holidays')
      .select('date')
      .gte('date', periodStart)
      .lte('date', holidayRangeEnd),
  ])
  const failed = logsRes.error || vacationsRes.error || holidaysRes.error
  if (failed) {
    return NextResponse.json({ error: '근무 기록 조회 실패: ' + failed.message }, { status: 500 })
  }

  // 5) 양식 채우기
  let out: Buffer
  try {
    out = await buildAttendanceXlsx({
      template: await fileBlob.arrayBuffer(),
      year,
      month,
<<<<<<< HEAD
=======
      personName: insideName,
>>>>>>> feature/UI_Refactoring
      logs: logsRes.data ?? [],
      vacations: vacationsRes.data ?? [],
      substituteHolidays: new Set((holidaysRes.data ?? []).map((h: { date: string }) => h.date)),
    })
  } catch (e) {
    if (e instanceof AttendanceTemplateError) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
    throw e
  }

  // 파일명: TRENGKR YY年 MM月 勤務管理表_이름
  const yy = String(year).slice(-2)
  const mm = String(month).padStart(2, '0')
<<<<<<< HEAD
  const nameSlug = personName.replace(/[\s\\/:*?"<>|]+/g, '')
  const filename = `TRENGKR ${yy}年 ${mm}月 勤務管理表_${nameSlug}.xlsx`
=======
  const filename = `TRENGKR ${yy}年 ${mm}月 勤務管理表_${fileNameLabel}.xlsx`
>>>>>>> feature/UI_Refactoring

  return new NextResponse(out as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
    },
  })
}
