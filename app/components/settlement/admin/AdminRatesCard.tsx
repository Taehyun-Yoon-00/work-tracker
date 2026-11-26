'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import Button from '../../ui/Button'
import { RANK_LABELS, settlementMonthOf } from '../../../lib/settlement/domestic'
import { listRateVersions, pickRateVersion, type DomesticPricing } from '../../../lib/settlement/pricing'
import { postPricingAction } from '../../../lib/settlement/pricingApi'
import { INPUT_CLS, LABEL_CLS, toNum } from '../ui'

interface Props {
  pricing: DomesticPricing
  onChanged: () => void
}

type Grid = Record<number, { a: string; b: string; allowance: string }>

const keyOf = (v: { year: number; month: number }) => `${v.year}-${String(v.month).padStart(2, '0')}`

/** 직급별 숙박비(A/B)·일당. 적용 시작월 단위로 버전을 쌓아서, 단가를 바꿔도 지난 달 정산은 그대로 둔다. */
export default function AdminRatesCard({ pricing, onChanged }: Props) {
  const versions = useMemo(() => listRateVersions(pricing.rates), [pricing.rates])
  const current = useMemo(
    () => pickRateVersion(pricing.rates, settlementMonthOf(new Date())),
    [pricing.rates]
  )

  // 처음부터 현재 적용 중인 버전을 골라 둔다 (마운트 직후 뒤늦게 바뀌면 입력값을 덮어쓸 수 있다)
  const [selected, setSelected] = useState<string>(() => {
    const first = current ?? versions[0]
    return first ? keyOf(first) : 'new'
  })
  const [newYear, setNewYear] = useState(dayjs().year())
  const [newMonth, setNewMonth] = useState(dayjs().month() + 1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // 입력칸 값 = 선택한 버전의 저장값 위에 사용자가 고친 칸만 얹은 것.
  // (새 버전은 가장 최근 버전을 복사해서 시작한다)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const dirty = Object.keys(edits).length > 0
  const base = useMemo<Grid>(() => {
    const source =
      selected && selected !== 'new' ? versions.find((v) => keyOf(v) === selected) : versions[0]
    const next: Grid = {}
    for (let rank = 1; rank <= 4; rank++) {
      const row = source
        ? pricing.rates.find(
            (r) =>
              r.effective_year === source.year &&
              r.effective_month === source.month &&
              r.rank_level === rank
          )
        : undefined
      next[rank] = {
        a: row ? String(row.lodging_a) : '',
        b: row ? String(row.lodging_b) : '',
        allowance: row ? String(row.allowance) : '',
      }
    }
    return next
  }, [selected, versions, pricing.rates])
  const cell = (rank: number, field: 'a' | 'b' | 'allowance') =>
    edits[`${rank}.${field}`] ?? base[rank]?.[field] ?? ''

  // 선택한 버전이 삭제 등으로 사라지면 현재 적용 중인 버전으로 돌아간다
  useEffect(() => {
    if (selected === 'new') return
    if (versions.some((v) => keyOf(v) === selected)) return
    const fallback = current ?? versions[0]
    setSelected(fallback ? keyOf(fallback) : 'new')
  }, [versions, current, selected])

  const isNew = selected === 'new'
  const target = isNew
    ? { year: newYear, month: newMonth }
    : (() => {
        const [y, m] = selected.split('-').map(Number)
        return { year: y, month: m }
      })()

  const setCell = (rank: number, field: 'a' | 'b' | 'allowance', value: string) =>
    setEdits((cur) => ({ ...cur, [`${rank}.${field}`]: value }))

  const changeSelected = (value: string) => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있어요. 다른 단가표로 바꾸면 사라져요. 바꿀까요?')) return
    setEdits({})
    setSelected(value)
  }

  const save = async () => {
    setMessage(null)
    const rates = []
    for (let rank = 1; rank <= 4; rank++) {
      const a = toNum(cell(rank, 'a'))
      const b = toNum(cell(rank, 'b'))
      const al = toNum(cell(rank, 'allowance'))
      if (a === null || b === null || al === null || ![a, b, al].every(Number.isInteger)) {
        setMessage({ ok: false, text: `${RANK_LABELS[rank - 1]}의 금액을 0 이상의 정수로 모두 입력해 주세요.` })
        return
      }
      rates.push({ rank_level: rank, lodging_a: a, lodging_b: b, allowance: al })
    }
    if (isNew && versions.some((v) => keyOf(v) === keyOf(target))) {
      setMessage({ ok: false, text: '이미 그 적용 시작월의 단가표가 있어요. 목록에서 골라 수정해 주세요.' })
      return
    }
    setBusy(true)
    const result = await postPricingAction('saveRates', { ...target, rates })
    setBusy(false)
    if (!result.ok) {
      setMessage({ ok: false, text: result.error })
      return
    }
    setMessage({ ok: true, text: `${target.year}년 ${target.month}월부터 적용되는 단가표를 저장했어요.` })
    setEdits({})
    setSelected(keyOf(target))
    onChanged()
  }

  const remove = async () => {
    if (isNew) return
    if (!window.confirm(`${target.year}년 ${target.month}월부터 적용하던 단가표를 삭제할까요?\n이 단가표가 적용되던 달은 이전 단가표로 계산돼요.`)) return
    setBusy(true)
    const result = await postPricingAction('deleteRates', target)
    setBusy(false)
    if (!result.ok) {
      setMessage({ ok: false, text: result.error })
      return
    }
    setMessage({ ok: true, text: '단가표를 삭제했어요.' })
    setEdits({})
    setSelected('')
    onChanged()
  }

  return (
    <section className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-3">
      <div>
        <h2 className="font-semibold dark:text-white">직급별 숙박비 · 일당</h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
          각 정산월에는 그 달 이전에 시작한 가장 최근 단가표가 적용돼요. 새 단가표를 추가해도 이미
          지난 달 정산은 바뀌지 않아요.
          {current && ` (이번 정산월에는 ${current.year}년 ${current.month}월 시작분이 적용 중)`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <label className={LABEL_CLS}>적용 시작월</label>
          <select value={selected} onChange={(e) => changeSelected(e.target.value)} className={INPUT_CLS}>
            {versions.map((v) => (
              <option key={keyOf(v)} value={keyOf(v)}>
                {v.year}년 {v.month}월부터
                {current && keyOf(current) === keyOf(v) ? ' (현재 적용 중)' : ''}
              </option>
            ))}
            <option value="new">+ 새 단가표 추가</option>
          </select>
        </div>
        {isNew && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={LABEL_CLS}>연도</label>
              <input type="number" value={newYear} min={2000} max={2100} onChange={(e) => setNewYear(Number(e.target.value))} className={INPUT_CLS} />
            </div>
            <div className="w-20">
              <label className={LABEL_CLS}>월</label>
              <input type="number" value={newMonth} min={1} max={12} onChange={(e) => setNewMonth(Number(e.target.value))} className={INPUT_CLS} />
            </div>
          </div>
        )}
      </div>
      {isNew && (
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 -mt-1">
          정산월 기준이에요. 예) 2027년 1월 = 2026.12.16~2027.1.15 정산분부터 적용. 값은 가장 최근
          단가표를 복사해서 시작해요.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 dark:text-zinc-400">
              <th className="text-left font-normal pb-1 pr-2">직급</th>
              <th className="text-left font-normal pb-1 px-1">숙박비 A</th>
              <th className="text-left font-normal pb-1 px-1">숙박비 B</th>
              <th className="text-left font-normal pb-1 pl-1">일당</th>
            </tr>
          </thead>
          <tbody>
            {RANK_LABELS.map((label, i) => {
              const rank = i + 1
              return (
                <tr key={label}>
                  <td className="pr-2 py-1 whitespace-nowrap dark:text-zinc-200">
                    {label} <span className="text-[10px] text-gray-400">({rank})</span>
                  </td>
                  {(['a', 'b', 'allowance'] as const).map((field) => (
                    <td key={field} className="px-1 py-1">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={cell(rank, field)}
                        onChange={(e) => setCell(rank, field, e.target.value)}
                        className={`${INPUT_CLS} min-w-[5.5rem]`}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-zinc-500">
        일당은 숙박(A/B)이 있는 날에만 붙어요. 금액 단위는 원이에요.
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? '저장 중...' : isNew ? '새 단가표 저장' : '변경 저장'}
        </Button>
        {!isNew && versions.length > 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="text-xs px-3 py-1.5 rounded-lg text-red-500 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-50"
          >
            이 단가표 삭제
          </button>
        )}
      </div>
      {!isNew && (
        <p className="text-[11px] text-gray-400 dark:text-zinc-500">
          기존 단가표를 고쳐 저장하면 그 단가표가 적용되는 모든 달의 금액이 바뀌어요. 지난 달은 그대로
          두려면 &lsquo;새 단가표 추가&rsquo;를 쓰세요.
        </p>
      )}
      {message && (
        <p className={`text-xs ${message.ok ? 'text-blue-500' : 'text-red-500'}`}>{message.text}</p>
      )}
    </section>
  )
}
