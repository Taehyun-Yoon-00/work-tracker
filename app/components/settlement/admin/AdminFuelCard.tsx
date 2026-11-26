'use client'

import { useMemo, useState } from 'react'
import Button from '../../ui/Button'
import { settlementMonthOf, shiftMonth, type SettlementMonth } from '../../../lib/settlement/domestic'
import { pickFuelPrice, type DomesticPricing } from '../../../lib/settlement/pricing'
import { postPricingAction } from '../../../lib/settlement/pricingApi'
import { INPUT_CLS, LABEL_CLS, fmt, toNum } from '../ui'

interface Props {
  pricing: DomesticPricing
  onChanged: () => void
}

/** 차종별 km당 유류 단가 — 정산월마다 입력하고, 입력하지 않은 달은 이전 달 값이 이월된다. */
export default function AdminFuelCard({ pricing, onChanged }: Props) {
  const [month, setMonth] = useState<SettlementMonth>(() => settlementMonthOf(new Date()))
  // 서버에 저장된 값 위에 "사용자가 고친 칸"만 얹어서 보여준다.
  // (저장값을 입력 상태로 복사해 동기화하면, 다른 카드 저장으로 단가가 다시 로드될 때 입력 중인 값과 경합한다)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const dirty = Object.keys(edits).length > 0
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  // 이 달에 저장된 값 (저장 후 서버 값으로 다시 맞춘다)
  const saved = useMemo(() => {
    const map: Record<string, string> = {}
    for (const v of pricing.vehicleTypes) {
      const row = pricing.fuelPrices.find(
        (p) => p.vehicle_type_id === v.id && p.year === month.year && p.month === month.month
      )
      map[v.id] = row ? String(row.price) : ''
    }
    return map
  }, [pricing, month])

  const valueOf = (id: string) => edits[id] ?? saved[id] ?? ''

  const moveMonth = (diff: number) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있어요. 이동하면 사라져요. 이동할까요?')) return
    setEdits({})
    setMonth((m) => shiftMonth(m, diff))
    setMessage(null)
  }

  const carried = (id: string) => {
    const lookup = pickFuelPrice(pricing.fuelPrices, id, month)
    return lookup && lookup.carried ? lookup : null
  }

  const fillCarried = () => {
    const next: Record<string, string> = {}
    for (const v of pricing.vehicleTypes) {
      if (!v.is_active || valueOf(v.id) !== '') continue
      const c = carried(v.id)
      if (c) next[v.id] = String(c.price)
    }
    if (Object.keys(next).length > 0) setEdits((cur) => ({ ...cur, ...next }))
  }

  const save = async () => {
    setMessage(null)
    const prices = []
    for (const v of pricing.vehicleTypes) {
      const raw = valueOf(v.id).trim()
      if (raw === '') {
        prices.push({ vehicle_type_id: v.id, price: null })
        continue
      }
      const n = toNum(raw)
      if (n === null || !Number.isInteger(n)) {
        setMessage({ ok: false, text: `${v.label}의 단가를 0 이상의 정수로 입력해 주세요.` })
        return
      }
      prices.push({ vehicle_type_id: v.id, price: n })
    }
    setBusy(true)
    const result = await postPricingAction('saveFuelPrices', { ...month, prices })
    setBusy(false)
    if (!result.ok) {
      setMessage({ ok: false, text: result.error })
      return
    }
    setMessage({ ok: true, text: `${month.year}년 ${month.month}월분 유류 단가를 저장했어요.` })
    // 저장한 값은 곧 다시 로드되는 서버 값으로 보이게 된다
    setEdits({})
    onChanged()
  }

  const addType = async () => {
    const label = newLabel.trim()
    if (!label) return
    setBusy(true)
    const result = await postPricingAction('addVehicleType', { label })
    setBusy(false)
    if (!result.ok) {
      setMessage({ ok: false, text: result.error })
      return
    }
    setNewLabel('')
    setMessage({ ok: true, text: `차종 "${label}"을 추가했어요. 위에서 단가를 입력해 주세요.` })
    onChanged()
  }

  const updateType = async (id: string, patch: { label?: string; is_active?: boolean }) => {
    setBusy(true)
    const result = await postPricingAction('updateVehicleType', { id, ...patch })
    setBusy(false)
    if (!result.ok) {
      setMessage({ ok: false, text: result.error })
      return false
    }
    onChanged()
    return true
  }

  return (
    <section className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-3">
      <div>
        <h2 className="font-semibold dark:text-white">차종별 유류 단가 (km당)</h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
          정산월마다 입력해요. 입력하지 않은 달은 이전 달 값이 그대로 이월돼서 적용돼요.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="이전 정산월"
            onClick={() => moveMonth(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            ‹
          </button>
          <span className="text-sm font-semibold dark:text-white">
            {month.year}년 {month.month}월분
          </span>
          <button
            type="button"
            aria-label="다음 정산월"
            onClick={() => moveMonth(1)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={fillCarried}
          className="text-xs text-blue-500 hover:underline"
        >
          이월 값으로 빈칸 채우기
        </button>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-zinc-700">
        {pricing.vehicleTypes.map((v) => {
          const c = carried(v.id)
          const editing = editingId === v.id
          return (
            <li key={v.id} className={`py-2 ${v.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <input
                      type="text"
                      value={editingLabel}
                      maxLength={50}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      className={INPUT_CLS}
                      autoFocus
                    />
                  ) : (
                    <span className="text-sm dark:text-zinc-200 break-words">
                      {v.label}
                      {!v.is_active && <span className="ml-1 text-[10px] text-gray-400">(사용 중지)</span>}
                    </span>
                  )}
                </div>
                <div className="relative w-28 shrink-0">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={valueOf(v.id)}
                    placeholder={c ? `이월 ${fmt(c.price)}` : '미입력'}
                    onChange={(e) => {
                      const value = e.target.value
                      setEdits((cur) => ({ ...cur, [v.id]: value }))
                    }}
                    className={`${INPUT_CLS} pr-9`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">
                    원/km
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px]">
                {editing ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (await updateType(v.id, { label: editingLabel })) setEditingId(null)
                      }}
                      className="text-blue-500"
                    >
                      이름 저장
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-gray-400">
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(v.id)
                        setEditingLabel(v.label)
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                    >
                      이름 변경
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateType(v.id, { is_active: !v.is_active })}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                    >
                      {v.is_active ? '사용 중지' : '다시 사용'}
                    </button>
                    {c && (
                      <span className="text-gray-400 dark:text-zinc-500">
                        {c.fromYear}년 {c.fromMonth}월 값 이월 중
                      </span>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중...' : `${month.month}월분 단가 저장`}
        </Button>
        {dirty && <span className="text-[11px] text-orange-500">저장하지 않은 변경이 있어요</span>}
      </div>

      <div className="border-t border-gray-100 dark:border-zinc-700 pt-3">
        <label className={LABEL_CLS}>차종 추가</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            maxLength={50}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="예) 하이브리드 1990cc 미만"
            className={INPUT_CLS}
          />
          <Button size="sm" disabled={busy || !newLabel.trim()} onClick={addType}>
            추가
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1">
          &lsquo;사용 중지&rsquo;한 차종은 새로 고르는 목록에서만 빠져요. 이미 그 차종으로 저장한 달은 그대로 계산돼요.
        </p>
      </div>

      {message && (
        <p className={`text-xs ${message.ok ? 'text-blue-500' : 'text-red-500'}`}>{message.text}</p>
      )}
    </section>
  )
}
