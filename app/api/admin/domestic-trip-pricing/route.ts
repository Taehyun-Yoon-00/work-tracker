import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isGeneralAdmin, isMaster } from '@/app/lib/apiAuth'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'

export const runtime = 'nodejs'

/**
 * 국내 출장 정산 단가 관리 (직급별 단가표 · 차종 · 월별 유류 단가).
 * 총괄 관리자 또는 마스터만 쓸 수 있다. 읽기는 RLS(SELECT 허용)로 브라우저가 직접 하므로
 * 이 라우트는 쓰기만 맡는다 — 단가 테이블에는 쓰기 정책이 없어서 서버(service role)로만 바꿀 수 있다.
 *
 * 요청: POST { action, ...payload }
 *   saveRates        { year, month, rates: [{ rank_level 1~4, lodging_a, lodging_b, allowance }] }
 *   deleteRates      { year, month }                        — 마지막 남은 단가표는 지울 수 없다
 *   saveFuelPrices   { year, month, prices: [{ vehicle_type_id, price | null }] }  — null은 그 달 값 삭제(이월로 돌아감)
 *   addVehicleType   { label }
 *   updateVehicleType{ id, label?, is_active? }
 */

const MAX_AMOUNT = 100_000_000

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

function validYearMonth(body: any): { year: number; month: number } | null {
  return isInt(body?.year, 2000, 2100) && isInt(body?.month, 1, 12)
    ? { year: body.year, month: body.month }
    : null
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!((await isMaster(user.id)) || (await isGeneralAdmin(user.id)))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.action !== 'string') return bad('요청 형식이 올바르지 않아요.')
  const now = new Date().toISOString()

  switch (body.action) {
    case 'saveRates': {
      const ym = validYearMonth(body)
      if (!ym) return bad('적용 시작월이 올바르지 않아요.')
      const rates = body.rates
      if (!Array.isArray(rates) || rates.length !== 4) return bad('사원·선임·책임·수석 4개 직급의 단가가 모두 필요해요.')
      const ranks = new Set<number>()
      const rows = []
      for (const r of rates) {
        if (
          !isInt(r?.rank_level, 1, 4) ||
          !isInt(r?.lodging_a, 0, MAX_AMOUNT) ||
          !isInt(r?.lodging_b, 0, MAX_AMOUNT) ||
          !isInt(r?.allowance, 0, MAX_AMOUNT)
        ) {
          return bad('금액은 0 이상의 정수로 입력해 주세요.')
        }
        ranks.add(r.rank_level)
        rows.push({
          effective_year: ym.year,
          effective_month: ym.month,
          rank_level: r.rank_level,
          lodging_a: r.lodging_a,
          lodging_b: r.lodging_b,
          allowance: r.allowance,
          updated_by: user.id,
          updated_at: now,
        })
      }
      if (ranks.size !== 4) return bad('직급이 중복되었어요.')
      const { error } = await supabaseAdmin
        .from('domestic_trip_rates')
        .upsert(rows, { onConflict: 'effective_year,effective_month,rank_level' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    case 'deleteRates': {
      const ym = validYearMonth(body)
      if (!ym) return bad('적용 시작월이 올바르지 않아요.')
      const { data: all, error: listError } = await supabaseAdmin
        .from('domestic_trip_rates')
        .select('effective_year, effective_month')
      if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })
      const versions = new Set((all ?? []).map((r) => `${r.effective_year}-${r.effective_month}`))
      if (!versions.has(`${ym.year}-${ym.month}`)) return bad('그 적용 시작월의 단가표가 없어요.')
      if (versions.size <= 1) {
        return bad('마지막 단가표는 지울 수 없어요. 새 단가표를 먼저 추가한 뒤 지워 주세요.')
      }
      const { error } = await supabaseAdmin
        .from('domestic_trip_rates')
        .delete()
        .eq('effective_year', ym.year)
        .eq('effective_month', ym.month)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    case 'saveFuelPrices': {
      const ym = validYearMonth(body)
      if (!ym) return bad('정산월이 올바르지 않아요.')
      if (!Array.isArray(body.prices)) return bad('단가 목록이 필요해요.')
      const upserts = []
      const clearIds: string[] = []
      for (const p of body.prices) {
        if (typeof p?.vehicle_type_id !== 'string') return bad('차종이 올바르지 않아요.')
        if (p.price === null) {
          clearIds.push(p.vehicle_type_id)
        } else if (isInt(p.price, 0, MAX_AMOUNT)) {
          upserts.push({
            year: ym.year,
            month: ym.month,
            vehicle_type_id: p.vehicle_type_id,
            price: p.price,
            updated_by: user.id,
            updated_at: now,
          })
        } else {
          return bad('단가는 0 이상의 정수로 입력해 주세요.')
        }
      }
      if (upserts.length > 0) {
        const { error } = await supabaseAdmin
          .from('domestic_trip_fuel_prices')
          .upsert(upserts, { onConflict: 'year,month,vehicle_type_id' })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (clearIds.length > 0) {
        const { error } = await supabaseAdmin
          .from('domestic_trip_fuel_prices')
          .delete()
          .eq('year', ym.year)
          .eq('month', ym.month)
          .in('vehicle_type_id', clearIds)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    case 'addVehicleType': {
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      if (label.length < 1 || label.length > 50) return bad('차종 이름은 1~50자로 입력해 주세요.')
      const { data: last } = await supabaseAdmin
        .from('domestic_trip_vehicle_types')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { error } = await supabaseAdmin
        .from('domestic_trip_vehicle_types')
        .insert({ label, sort_order: (last?.sort_order ?? 0) + 10 })
      if (error) {
        return NextResponse.json(
          { error: error.code === '23505' ? '이미 있는 차종 이름이에요.' : error.message },
          { status: error.code === '23505' ? 400 : 500 }
        )
      }
      return NextResponse.json({ success: true })
    }

    case 'updateVehicleType': {
      if (typeof body.id !== 'string') return bad('차종이 올바르지 않아요.')
      const patch: { label?: string; is_active?: boolean } = {}
      if (body.label !== undefined) {
        const label = typeof body.label === 'string' ? body.label.trim() : ''
        if (label.length < 1 || label.length > 50) return bad('차종 이름은 1~50자로 입력해 주세요.')
        patch.label = label
      }
      if (body.is_active !== undefined) {
        if (typeof body.is_active !== 'boolean') return bad('활성 여부가 올바르지 않아요.')
        patch.is_active = body.is_active
      }
      if (Object.keys(patch).length === 0) return bad('바꿀 내용이 없어요.')
      const { error } = await supabaseAdmin
        .from('domestic_trip_vehicle_types')
        .update(patch)
        .eq('id', body.id)
      if (error) {
        return NextResponse.json(
          { error: error.code === '23505' ? '이미 있는 차종 이름이에요.' : error.message },
          { status: error.code === '23505' ? 400 : 500 }
        )
      }
      return NextResponse.json({ success: true })
    }

    default:
      return bad('알 수 없는 요청이에요.')
  }
}
