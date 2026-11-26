// 단가 관리 API(/api/admin/domestic-trip-pricing) 호출 헬퍼 — 관리 탭에서만 쓴다.
// 서버가 총괄 관리자/마스터 권한을 다시 확인하므로 이 호출은 화면에서 숨기는 것과 별개로 안전하다.

export type PricingActionResult = { ok: true } | { ok: false; error: string }

export async function postPricingAction(
  action: 'saveRates' | 'deleteRates' | 'saveFuelPrices' | 'addVehicleType' | 'updateVehicleType',
  payload: Record<string, unknown>
): Promise<PricingActionResult> {
  try {
    const res = await fetch('/api/admin/domestic-trip-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body.error) return { ok: false, error: body.error || '저장에 실패했어요.' }
    return { ok: true }
  } catch {
    return { ok: false, error: '네트워크 오류로 저장하지 못했어요.' }
  }
}
