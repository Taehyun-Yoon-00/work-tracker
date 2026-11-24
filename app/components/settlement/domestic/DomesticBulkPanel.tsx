'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import SegmentedControl from '../../ui/SegmentedControl'
import Button from '../../ui/Button'
import {
  emptyDay,
  isDayFilled,
  type DateStr,
  type LodgingType,
  type TripDayEntry,
} from '../../../lib/settlement/domestic'
import { Chip, INPUT_CLS, LABEL_CLS, NumberField } from '../ui'

export interface BulkForm {
  start: DateStr
  end: DateStr
  lodging: LodgingType
  /** 출발지(숙소) / 도착지(근무지) */
  stay: string
  site: string
  /** 평일 주행거리 (왕복이면 하루 합계) */
  km: number | null
  roundTrip: boolean
  /** 주말·공휴일에도 숙박(숙박비·일당)을 유지할지 */
  offDayLodging: boolean
}

/**
 * 기간 일괄 입력 규칙 (순수 함수 — 미리보기와 적용이 같은 결과를 쓰도록 분리).
 *  - 평일     : 숙박 · 출발지(숙소)→도착지(근무지) · 주행거리
 *  - 휴일·주말: 숙박 유지 시 숙소→숙소로 출장여비 시트에만 표시, 주행거리 없음
 * 교통비(운임/통행료/주차료)와 이용 목적은 날마다 달라서 건드리지 않는다.
 */
export function buildBulkEntries(
  form: BulkForm,
  entries: Record<DateStr, TripDayEntry | undefined>,
  isOffDay: (d: DateStr) => boolean
): Record<DateStr, TripDayEntry> {
  const out: Record<DateStr, TripDayEntry> = {}
  let cur = dayjs(form.start)
  const last = dayjs(form.end)
  while (cur.isBefore(last) || cur.isSame(last, 'day')) {
    const d = cur.format('YYYY-MM-DD')
    const base = entries[d] ?? emptyDay()
    if (isOffDay(d)) {
      const lodging = form.offDayLodging ? form.lodging : 0
      out[d] = {
        ...base,
        lodging,
        from: lodging > 0 ? form.stay : '',
        to: lodging > 0 ? form.stay : '',
        km: null,
        showRoute: {},
      }
    } else {
      out[d] = {
        ...base,
        lodging: form.lodging,
        from: form.stay,
        to: form.site,
        km: form.km,
        roundTrip: form.roundTrip,
        showRoute: {},
      }
    }
    cur = cur.add(1, 'day')
  }
  return out
}

interface Props {
  dates: DateStr[]
  entries: Record<DateStr, TripDayEntry | undefined>
  isOffDay: (d: DateStr) => boolean
  places: string[]
  onApply: (updates: Record<DateStr, TripDayEntry>) => void
}

/** 2주 출장처럼 같은 내용이 며칠씩 반복될 때 한 번에 채우는 패널. */
export default function DomesticBulkPanel({ dates, entries, isOffDay, places, onApply }: Props) {
  const [form, setForm] = useState<BulkForm>(() => ({
    start: dates[0],
    end: dates[Math.min(13, dates.length - 1)],
    lodging: 1,
    stay: '',
    site: '',
    km: null,
    roundTrip: true,
    offDayLodging: true,
  }))
  const [target, setTarget] = useState<'stay' | 'site'>('stay')
  const [done, setDone] = useState('')
  const set = (patch: Partial<BulkForm>) => {
    setDone('')
    setForm((f) => ({ ...f, ...patch }))
  }

  const preview = useMemo(() => {
    if (!form.start || !form.end || form.end < form.start) return null
    const list = buildBulkEntries(form, entries, isOffDay)
    const keys = Object.keys(list)
    const off = keys.filter((d) => isOffDay(d)).length
    const overwrite = keys.filter((d) => isDayFilled(entries[d])).length
    return { total: keys.length, off, work: keys.length - off, overwrite }
  }, [form, entries, isOffDay])

  const pickPlace = (p: string) => {
    set({ [target]: p } as Partial<BulkForm>)
    if (target === 'stay') setTarget('site')
  }

  const apply = () => {
    if (!preview) return
    onApply(buildBulkEntries(form, entries, isOffDay))
    setDone(`${preview.total}일에 적용했어요. 아래 목록에서 날짜별로 고칠 수 있어요.`)
  }

  const first = dates[0]
  const last = dates[dates.length - 1]

  return (
    <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-3">
      <p className="text-xs text-gray-600 dark:text-zinc-300">
        같은 내용이 반복되는 기간을 한 번에 채워요. 평일은 숙소→근무지로, 주말·공휴일은 숙소→숙소로
        출장여비 시트에만 표시돼요. 교통비·목적은 날짜별로 따로 입력하세요.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>시작일</label>
          <input
            type="date"
            min={first}
            max={last}
            value={form.start}
            onChange={(e) => set({ start: e.target.value })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>종료일</label>
          <input
            type="date"
            min={first}
            max={last}
            value={form.end}
            onChange={(e) => set({ end: e.target.value })}
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>숙박 구분</label>
        <SegmentedControl<string>
          fullWidth
          value={String(form.lodging)}
          onChange={(v) => set({ lodging: Number(v) as LodgingType })}
          options={[
            { value: '0', label: '없음' },
            { value: '1', label: 'A' },
            { value: '2', label: 'B' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>출발지 (숙소)</label>
          <input
            type="text"
            value={form.stay}
            onFocus={() => setTarget('stay')}
            onChange={(e) => set({ stay: e.target.value })}
            placeholder="예) 光州Hotel"
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>도착지 (근무지)</label>
          <input
            type="text"
            value={form.site}
            onFocus={() => setTarget('site')}
            onChange={(e) => set({ site: e.target.value })}
            placeholder="예) Amkor K4"
            className={INPUT_CLS}
          />
        </div>
      </div>
      {places.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 dark:text-zinc-500">
            {target === 'stay' ? '출발지로' : '도착지로'}
          </span>
          {places.map((p) => (
            <Chip key={p} onClick={() => pickPlace(p)}>
              {p}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="w-32 shrink-0">
          <NumberField
            label="평일 주행거리"
            value={form.km}
            onChange={(v) => set({ km: v })}
            suffix="km"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-zinc-300 pb-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.roundTrip}
            onChange={(e) => set({ roundTrip: e.target.checked })}
            className="w-4 h-4"
          />
          왕복
        </label>
      </div>

      <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-200 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.offDayLodging}
          onChange={(e) => set({ offDayLodging: e.target.checked })}
          className="w-4 h-4"
        />
        주말·공휴일에도 숙박 유지 (숙박비·일당 지급)
      </label>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs text-gray-500 dark:text-zinc-400">
          {preview
            ? `${dayjs(form.start).format('M/D')}~${dayjs(form.end).format('M/D')} · 평일 ${preview.work}일, 휴일 ${preview.off}일${
                preview.overwrite > 0 ? ` · 입력된 ${preview.overwrite}일은 덮어써요` : ''
              }`
            : '종료일이 시작일보다 빠를 수 없어요.'}
        </p>
        <Button size="sm" className="shrink-0 whitespace-nowrap" disabled={!preview} onClick={apply}>
          적용
        </Button>
      </div>
      {done && <p className="text-xs text-blue-600 dark:text-blue-400">{done}</p>}
    </div>
  )
}
