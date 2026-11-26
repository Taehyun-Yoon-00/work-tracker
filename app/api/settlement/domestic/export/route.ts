import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/apiAuth'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'
import { reportFileNameLabel, reportInsideName } from '@/app/lib/labels'
import { rankFromPosition } from '@/app/lib/settlement/domestic'
import { dayRowsToEntries, toRankLevel, type DayRow } from '@/app/lib/settlement/domesticMapping'
import { DomesticTemplateError, buildDomesticTripXlsx } from '@/app/lib/settlement/domesticSheet'
import {
  pickRankRate,
  resolveFuelUnitPrice,
  type FuelPriceRow,
  type RateRow,
} from '@/app/lib/settlement/pricing'

export const runtime = 'nodejs'

const BUCKET = 'report-templates'

/**
 * 국내 출장 정산(国内出張旅費精算) 엑셀 출력.
 *
 * 공개 범위: service role로 DB를 읽지만 조회 대상은 항상 "로그인한 본인"의 정산뿐이다.
 * 요청 본문으로 대상 사용자를 받지 않으므로 다른 사람의 정산서는 만들 수 없다.
 * 양식 원본은 비공개 버킷에 있고 일반 사용자는 직접 받을 수 없다.
 *
 * 금액은 저장된 값이 아니라 출력 시점의 DB 단가표(직급별 단가, 월별 차종별 유류 단가)로 계산한다.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year, month가 필요해요.' }, { status: 400 })
  }
  const target = { year, month }

  // 1) 본인의 정산월 + 날짜별 입력
  const { data: settlement, error: settlementError } = await supabaseAdmin
    .from('domestic_trip_settlements')
    .select(
      'rank_level, odometer_start, vehicle_type_id, fuel_unit_price, domestic_trip_days(date, lodging, from_place, to_place, route_s1, route_s2, route_s3, modes, fare, toll, parking, purpose, km, round_trip)'
    )
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (settlementError) {
    return NextResponse.json({ error: '정산 조회 실패: ' + settlementError.message }, { status: 500 })
  }
  const dayRows = (settlement?.domestic_trip_days ?? []) as DayRow[]
  if (!settlement || dayRows.length === 0) {
    return NextResponse.json(
      { error: `${month}월분으로 저장된 출장 정산 내용이 없어요.` },
      { status: 404 }
    )
  }

  // 2) 본인 프로필 — 파일명에는 이니셜, 양식 이름란에는 한자
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email, name_hanja, name_initial, position')
    .eq('id', user.id)
    .single()

  // 직급: 이 달에 저장된 값 → 마이페이지 직급
  const rank = toRankLevel(settlement.rank_level) ?? rankFromPosition(profile?.position)
  if (!rank) {
    return NextResponse.json(
      { error: '직급을 알 수 없어요. 출장 정산 화면에서 직급을 선택하거나 마이페이지에서 직급을 설정해 주세요.' },
      { status: 400 }
    )
  }

  // 3) 단가표
  const [ratesRes, pricesRes] = await Promise.all([
    supabaseAdmin.from('domestic_trip_rates').select('*'),
    supabaseAdmin.from('domestic_trip_fuel_prices').select('year, month, vehicle_type_id, price'),
  ])
  if (ratesRes.error || pricesRes.error) {
    return NextResponse.json(
      { error: '단가표 조회 실패: ' + (ratesRes.error ?? pricesRes.error)!.message },
      { status: 500 }
    )
  }
  const rate = pickRankRate((ratesRes.data ?? []) as RateRow[], target, rank)
  if (!rate) {
    return NextResponse.json(
      { error: '해당 직급의 단가표가 등록되지 않았어요. 총괄 관리자에게 문의해 주세요.' },
      { status: 400 }
    )
  }

  const entries = dayRowsToEntries(dayRows)
  const totalKm = Object.values(entries).reduce((sum, e) => sum + (e.km ?? 0), 0)
  const fuel = resolveFuelUnitPrice(
    (pricesRes.data ?? []) as FuelPriceRow[],
    settlement.vehicle_type_id ?? null,
    settlement.fuel_unit_price ?? null,
    target
  )
  // 주행거리가 없으면 단가가 필요 없다(0원). 있는데 단가를 모르면 잘못된 금액이 나가지 않게 막는다.
  if (fuel.price === null && totalKm > 0) {
    return NextResponse.json(
      {
        error:
          fuel.source === 'vehicle'
            ? `선택한 차종의 ${month}월분 유류 단가가 등록되지 않았어요. 총괄 관리자에게 문의해 주세요.`
            : '주행거리가 있어서 차종을 선택하거나 km당 단가를 입력해야 해요.',
      },
      { status: 400 }
    )
  }

  // 4) 총괄 관리자가 올려둔 최신 국내 출장 양식
  const { data: templateRow, error: templateError } = await supabaseAdmin
    .from('report_templates')
    .select('storage_path')
    .eq('kind', 'domestic_trip')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (templateError) {
    return NextResponse.json({ error: '양식 조회 실패: ' + templateError.message }, { status: 500 })
  }
  if (!templateRow) {
    return NextResponse.json(
      { error: '총괄 관리자가 아직 국내 출장 양식을 업로드하지 않았어요.' },
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

  // 5) 양식 채우기
  let out: Buffer
  try {
    out = await buildDomesticTripXlsx({
      template: await fileBlob.arrayBuffer(),
      year,
      month,
      personName: reportInsideName(profile, '이름 미설정'),
      rank,
      rate,
      fuelUnitPrice: fuel.price ?? 0,
      odometerStart: settlement.odometer_start ?? null,
      entries,
    })
  } catch (e) {
    if (e instanceof DomesticTemplateError) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
    throw e
  }

  // 파일명: TRENGKR_YY年_MM月_国内出張費_이니셜
  const yy = String(year).slice(-2)
  const mm = String(month).padStart(2, '0')
  const filename = `TRENGKR_${yy}年_${mm}月_国内出張費_${reportFileNameLabel(profile, '이름미설정')}.xlsx`

  return new NextResponse(out as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="domestic-trip.xlsx"; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
    },
  })
}
