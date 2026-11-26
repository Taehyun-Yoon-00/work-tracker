'use client'

import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import SegmentedControl from '../../ui/SegmentedControl'
import {
  TRANSPORT_MODES,
  allowanceAmount,
  autoRouteVisibility,
  lodgingAmount,
  routeVisibility,
  type DayComputed,
  type LodgingType,
  type RankRate,
  type TripDayEntry,
} from '../../../lib/settlement/domestic'
import { Chip, INPUT_CLS, LABEL_CLS, NumberField, SheetTitle, fmt } from '../ui'

interface Props {
  entry: TripDayEntry
  computed: DayComputed
  /** 이 달·이 직급에 적용되는 단가 (DB 단가표). 모르면 null */
  rate: RankRate | null
  /** 이미 입력한 장소/목적 중 자주 쓴 것 — 탭 한 번으로 채우는 칩 */
  places: string[]
  purposes: string[]
  canCopyPrev: boolean
  onChange: (next: TripDayEntry) => void
  onCopyPrev: () => void
  onClear: () => void
}

const SHEETS = [
  { key: 's1', label: '출장여비' },
  { key: 's2', label: '교통비' },
  { key: 's3', label: '운전주보' },
] as const

/** 하루치 입력 폼. 출발/도착지는 한 번만 적고, 시트별 표시 여부는 아래에서 고른다. */
export default function DomesticDayEditor({
  entry,
  computed,
  rate,
  places,
  purposes,
  canCopyPrev,
  onChange,
  onCopyPrev,
  onClear,
}: Props) {
  // 장소 칩을 눌렀을 때 채울 칸. 출발지를 채우면 자동으로 도착지로 넘어간다.
  const [target, setTarget] = useState<'from' | 'to'>('from')
  const set = (patch: Partial<TripDayEntry>) => onChange({ ...entry, ...patch })

  const pickPlace = (place: string) => {
    set({ [target]: place } as Partial<TripDayEntry>)
    if (target === 'from') setTarget('to')
  }

  const vis = routeVisibility(entry)
  const auto = autoRouteVisibility(entry)
  const toggleSheet = (key: 's1' | 's2' | 's3', checked: boolean) => {
    const next = { ...entry.showRoute }
    // 자동 값과 같아지면 직접 지정을 풀어서 다시 "자동"으로 돌아가게 한다.
    if (checked === auto[key]) delete next[key]
    else next[key] = checked
    set({ showRoute: next })
  }

  const lodgingA = lodgingAmount(1, rate)
  const lodgingB = lodgingAmount(2, rate)
  const hasRoute = entry.from.trim() !== '' || entry.to.trim() !== ''
  const showKmOdo = (entry.km ?? 0) > 0 && computed.odoBefore !== null

  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-zinc-900/40 border border-gray-200 dark:border-zinc-700 p-3 space-y-4">
      {/* 행선지 — 세 시트 공통 */}
      <div>
        <SheetTitle no="📍" name="행선지" hint="세 시트 공통 · 한 번만 입력" />
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS}>출발지</label>
            <input
              type="text"
              list="trip-places"
              value={entry.from}
              onFocus={() => setTarget('from')}
              onChange={(e) => set({ from: e.target.value })}
              placeholder="예) 光州Hotel"
              className={INPUT_CLS}
            />
          </div>
          <button
            type="button"
            aria-label="출발지와 도착지 바꾸기"
            onClick={() => set({ from: entry.to, to: entry.from })}
            className="shrink-0 w-9 h-9 mb-0 flex items-center justify-center rounded-lg border border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            <ArrowLeftRight size={15} />
          </button>
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS}>도착지</label>
            <input
              type="text"
              list="trip-places"
              value={entry.to}
              onFocus={() => setTarget('to')}
              onChange={(e) => set({ to: e.target.value })}
              placeholder="예) Amkor K4"
              className={INPUT_CLS}
            />
          </div>
        </div>
        <datalist id="trip-places">
          {places.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {places.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] text-gray-400 dark:text-zinc-500">
              {target === 'from' ? '출발지로' : '도착지로'}
            </span>
            {places.map((p) => (
              <Chip key={p} onClick={() => pickPlace(p)}>
                {p}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* ① 출장여비 */}
      <div>
        <SheetTitle no="①" name="출장여비" hint="숙박 구분 → 숙박비·일당 자동" />
        <SegmentedControl<string>
          fullWidth
          value={String(entry.lodging)}
          onChange={(v) => set({ lodging: Number(v) as LodgingType })}
          options={[
            { value: '0', label: '없음' },
            { value: '1', label: rate ? `A · ${fmt(lodgingA)}` : 'A' },
            { value: '2', label: rate ? `B · ${fmt(lodgingB)}` : 'B' },
          ]}
        />
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1.5">
          {entry.lodging === 0
            ? '숙박이 없는 날이에요. (주말 숙박도 A/B를 선택하면 숙박비·일당이 붙어요)'
            : rate
              ? `숙박비 ${fmt(computed.lodging)} + 일당 ${fmt(allowanceAmount(entry.lodging, rate))} = ${fmt(computed.lodging + computed.allowance)}원`
              : '직급 또는 단가표를 확인할 수 없어 금액을 계산하지 못했어요.'}
        </p>
      </div>

      {/* ② 교통비 */}
      <div>
        <SheetTitle no="②" name="교통비" hint="교통비가 발생한 날만 입력" />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {TRANSPORT_MODES.map((m) => (
            <Chip
              key={m.key}
              selected={entry.modes.includes(m.key)}
              title={m.jp}
              onClick={() =>
                set({
                  modes: entry.modes.includes(m.key)
                    ? entry.modes.filter((k) => k !== m.key)
                    : [...entry.modes, m.key],
                })
              }
            >
              {entry.modes.includes(m.key) ? '■ ' : '□ '}
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="운임" value={entry.fare} onChange={(v) => set({ fare: v })} suffix="원" />
          <NumberField label="통행료" value={entry.toll} onChange={(v) => set({ toll: v })} suffix="원" />
          <NumberField label="주차료" value={entry.parking} onChange={(v) => set({ parking: v })} suffix="원" />
        </div>
        <div className="mt-2">
          <label className={LABEL_CLS}>이용 목적</label>
          <input
            type="text"
            value={entry.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
            placeholder="예) FC3000L2#113 Setup"
            className={INPUT_CLS}
          />
          {purposes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {purposes.map((p) => (
                <Chip key={p} onClick={() => set({ purpose: p })}>
                  {p}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ③ 운전주보 */}
      <div>
        <SheetTitle no="③" name="운전주보" hint="자가용 운행한 날만 입력" />
        <div className="flex items-end gap-3">
          <div className="w-32 shrink-0">
            <NumberField label="주행거리" value={entry.km} onChange={(v) => set({ km: v })} suffix="km" />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-zinc-300 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={entry.roundTrip}
              onChange={(e) => set({ roundTrip: e.target.checked })}
              className="w-4 h-4"
            />
            왕복 (A↔B)
          </label>
        </div>
        {showKmOdo && (
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1.5">
            계기판 {fmt(computed.odoBefore!)} → {fmt(computed.odoAfter!)} km
          </p>
        )}
      </div>

      {/* 시트별 행선지 표시 */}
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-3">
        <p className="text-xs font-medium text-gray-600 dark:text-zinc-300 mb-1.5">
          행선지를 적을 시트
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SHEETS.map((s) => (
            <label
              key={s.key}
              className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-200 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={vis[s.key]}
                onChange={(e) => toggleSheet(s.key, e.target.checked)}
                className="w-4 h-4"
              />
              {s.label}
              {entry.showRoute[s.key] === undefined && (
                <span className="text-[10px] text-gray-400 dark:text-zinc-500">자동</span>
              )}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">
          숙박이 있으면 출장여비, 교통비가 있으면 교통비, 주행거리가 있으면 운전주보에 자동으로 적혀요.
          {!hasRoute && ' (출발지/도착지가 비어 있으면 어느 시트에도 적히지 않아요)'}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canCopyPrev}
          onClick={onCopyPrev}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-40"
        >
          전날 내용 복사
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-xs px-3 py-1.5 rounded-lg text-red-500 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60"
        >
          이 날 비우기
        </button>
      </div>
    </div>
  )
}
