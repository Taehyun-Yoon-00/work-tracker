'use client'

import { useCallback, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { isHoliday } from '../../../lib/holidays'
import {
  RANK_LABELS,
  computeSettlement,
  emptyDay,
  getPeriodDates,
  getPeriodRange,
  isDayFilled,
  monthKey,
  rankFromPosition,
  routeVisibility,
  settlementMonthOf,
  shiftMonth,
  type DateStr,
  type RankLevel,
  type TripDayEntry,
} from '../../../lib/settlement/domestic'
import SegmentedControl from '../../ui/SegmentedControl'
import Button from '../../ui/Button'
import DomesticBulkPanel from './DomesticBulkPanel'
import DomesticDayEditor from './DomesticDayEditor'
import { useDomesticMonth } from './useDomesticMonth'
import { INPUT_CLS, LABEL_CLS, fmt, toNum } from '../ui'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  /** 처음 열 날짜 (근무기록 페이지에서 넘어온 날짜). 없으면 오늘이 속한 정산월을 연다. */
  initialDate?: Date
  /** 마이페이지의 직급(profiles.position) */
  position: string | null
  substituteHolidays: string[]
}

const CARD = 'bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4'

/**
 * 국내 출장 정산 화면 (양식: 国内出張旅費精算 — 출장여비 / 교통비 / 운전주보 3개 시트).
 *
 * 근무시간(work_logs)과 별개로 다룬다 — 출근하지 않은 날도 입력해야 하기 때문.
 * 입력은 정산월 단위로 DB(domestic_trip_settlements / domestic_trip_days)에 자동 저장된다.
 * 불러오기·자동 저장은 useDomesticMonth 훅이 맡는다.
 * 해외 출장이 추가되면 이 폴더와 나란히 overseas/ 를 만들고 settlement 페이지의 탭에서 전환한다.
 */
export default function DomesticSettlement({ initialDate, position, substituteHolidays }: Props) {
  const positionRank = rankFromPosition(position)
  const store = useDomesticMonth(settlementMonthOf(initialDate ?? new Date()), positionRank)
  const { month, data, loadStatus, saveStatus, errorMessage, update } = store
  const entries = data.entries

  const [openDate, setOpenDate] = useState<DateStr | null>(
    initialDate ? dayjs(initialDate).format('YYYY-MM-DD') : null
  )
  const [filter, setFilter] = useState<'all' | 'filled'>('all')
  const [bulkOpen, setBulkOpen] = useState(true)
  const [exportMsg, setExportMsg] = useState('')

  const key = monthKey(month)
  const cfg = { odometerStart: data.odometerStart, unitPrice: data.fuelUnitPrice }
  const setCfg = (patch: { odometerStart?: number | null; unitPrice?: number }) =>
    update((d) => ({
      ...d,
      odometerStart: patch.odometerStart !== undefined ? patch.odometerStart : d.odometerStart,
      fuelUnitPrice: patch.unitPrice !== undefined ? patch.unitPrice : d.fuelUnitPrice,
    }))

  // 이 달에 직급을 따로 정해 저장했으면 그 값, 아니면 마이페이지 직급
  const rank: RankLevel | null = data.rank ?? positionRank

  const dates = useMemo(() => getPeriodDates(month), [month])
  const range = useMemo(() => getPeriodRange(month), [month])

  const isOffDay = useCallback(
    (d: DateStr) => isHoliday(dayjs(d).toDate(), substituteHolidays),
    [substituteHolidays]
  )

  const { days, totals } = useMemo(
    () => computeSettlement(dates, entries, rank, cfg.unitPrice, cfg.odometerStart),
    [dates, entries, rank, cfg.unitPrice, cfg.odometerStart]
  )

  // 장소·목적 칩: 지금 펼쳐 둔 날을 뺀 나머지 날의 값 중 많이 쓴 순.
  // (입력 중인 글자가 바로 칩으로 생기는 걸 막기 위해 펼친 날은 제외한다)
  const { places, purposes } = useMemo(() => {
    const placeCount = new Map<string, number>()
    const purposeCount = new Map<string, number>()
    for (const [d, e] of Object.entries(entries)) {
      if (d === openDate) continue
      for (const p of [e.from, e.to]) {
        const t = p.trim()
        if (t) placeCount.set(t, (placeCount.get(t) ?? 0) + 1)
      }
      const pu = e.purpose.trim()
      if (pu) purposeCount.set(pu, (purposeCount.get(pu) ?? 0) + 1)
    }
    const top = (m: Map<string, number>, n: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
    return { places: top(placeCount, 8), purposes: top(purposeCount, 4) }
  }, [entries, openDate])

  const bulkPlaces = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of Object.values(entries)) {
      for (const p of [e.from, e.to]) {
        const t = p.trim()
        if (t) count.set(t, (count.get(t) ?? 0) + 1)
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k)
  }, [entries])

  const updateEntry = (date: DateStr, next: TripDayEntry) =>
    update((d) => ({ ...d, entries: { ...d.entries, [date]: next } }))

  const clearEntry = (date: DateStr) =>
    update((d) => {
      const { [date]: _removed, ...rest } = d.entries
      return { ...d, entries: rest }
    })

  const copyPrev = (date: DateStr) => {
    const prev = entries[dayjs(date).subtract(1, 'day').format('YYYY-MM-DD')]
    if (!prev) return
    updateEntry(date, { ...prev, showRoute: { ...prev.showRoute }, modes: [...prev.modes] })
  }

  // 달을 옮기기 전에 저장을 마친다. 저장에 실패하면 옮기지 않는다(입력값을 잃지 않도록).
  const moveMonth = async (diff: number) => {
    const ok = await store.changeMonth(shiftMonth(month, diff))
    if (ok) setOpenDate(null)
  }

  const filledCount = dates.filter((d) => isDayFilled(entries[d])).length
  const visibleDates = filter === 'filled' ? dates.filter((d) => isDayFilled(entries[d])) : dates
  // 근무기록에서 넘어온 날짜는 목록에서 살짝 강조해 준다.
  const highlightStr = initialDate ? dayjs(initialDate).format('YYYY-MM-DD') : null

  // 정산월 이동 (달을 옮기기 전에 저장을 마친다)
  const monthNav = (
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
      <span className="text-xs text-gray-500 dark:text-zinc-400">
        {dayjs(range.start).format('YY.M.D')} ~ {dayjs(range.end).format('M.D')}
      </span>
    </div>
  )

  // 저장 상태 — 입력하면 자동으로 저장되고, 실패하면 다시 시도할 수 있다.
  const errorHint = /schema cache|does not exist|could not find/i.test(errorMessage)
    ? ' (DB 마이그레이션 030이 적용됐는지 확인하세요)'
    : ''
  const noteLine = (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-400 dark:text-zinc-500">
          근무시간 기록과 별도로 저장돼요. 입력하면 자동 저장돼요.
        </span>
        {saveStatus === 'saving' && <span className="shrink-0 text-gray-400">저장 중...</span>}
        {saveStatus === 'pending' && <span className="shrink-0 text-gray-400">저장 대기</span>}
        {saveStatus === 'saved' && (
          <span className="shrink-0 text-green-600 dark:text-green-400">✓ 저장됨</span>
        )}
        {saveStatus === 'error' && (
          <button
            type="button"
            onClick={store.retrySave}
            className="shrink-0 text-red-500 underline underline-offset-2"
          >
            저장 실패 · 다시 시도
          </button>
        )}
      </div>
      {saveStatus === 'error' && (
        <p className="text-[11px] text-red-500">
          {errorMessage}
          {errorHint}
        </p>
      )}
    </div>
  )

  // 불러오는 중이거나 불러오기에 실패했을 때는 달 이동만 남기고 안내를 보여준다.
  if (loadStatus !== 'ready') {
    return (
      <div className={`${CARD} space-y-4`}>
        {noteLine}
        {monthNav}
        {loadStatus === 'loading' ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-10">불러오는 중...</p>
        ) : (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-red-500">
              출장 정산을 불러오지 못했어요.
              <span className="block text-xs mt-1">
                {errorMessage}
                {errorHint}
              </span>
            </p>
            <Button size="sm" onClick={store.reload}>
              다시 시도
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-4 lg:items-start">
      {/* 왼쪽(데스크톱): 정산월 · 기본 정보 · 일괄 입력 */}
      <div className={`${CARD} space-y-4 lg:col-start-1 lg:row-start-1`}>
        {noteLine}

        {monthNav}

          {/* 기본 정보: 직급 · 시작 계기판 · 단가 */}
          <div className="rounded-lg border border-gray-200 dark:border-zinc-700 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500 dark:text-zinc-400">직급 (양식 AT3)</span>
              <select
                value={rank ?? ''}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    rank: e.target.value ? (Number(e.target.value) as RankLevel) : null,
                  }))
                }
                className="border rounded-lg px-2 py-1.5 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              >
                {!rank && <option value="">직급 선택</option>}
                {RANK_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label} ({i + 1})
                  </option>
                ))}
              </select>
            </div>
            {positionRank ? (
              <p className="text-[11px] text-gray-400 dark:text-zinc-500">
                마이페이지 직급({RANK_LABELS[positionRank - 1]})이 기본값이에요. 이 달만 다르게
                정산해야 하면 바꿔 주세요.
              </p>
            ) : (
              <p className="text-[11px] text-orange-500">
                마이페이지 직급이 {position ? `"${position}"(사원/선임/책임/수석이 아님)` : '비어 있어'}{' '}
                자동으로 연결되지 않았어요. 위에서 직접 선택하거나 마이페이지에서 직급을 고르세요.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>시작 계기판 (km)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cfg.odometerStart ?? ''}
                  onChange={(e) => setCfg({ odometerStart: toNum(e.target.value) })}
                  placeholder="전월 말 누적"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>유류대 (km당 원)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cfg.unitPrice}
                  onChange={(e) => setCfg({ unitPrice: toNum(e.target.value) ?? 0 })}
                  className={INPUT_CLS}
                />
              </div>
            </div>
          </div>

          {/* 기간 일괄 입력 */}
          <div>
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              aria-expanded={bulkOpen}
              className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-2"
            >
              <span>기간 일괄 입력</span>
              {bulkOpen ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
            </button>
            {bulkOpen && (
              <DomesticBulkPanel
                key={key}
                dates={dates}
                entries={entries}
                isOffDay={isOffDay}
                places={bulkPlaces}
                onApply={(updates) =>
                  update((d) => ({ ...d, entries: { ...d.entries, ...updates } }))
                }
              />
            )}
          </div>
      </div>

      {/* 오른쪽(데스크톱): 날짜별 입력 목록 */}
      <div className={`${CARD} lg:col-start-2 lg:row-start-1 lg:row-span-2`}>
          {/* 날짜별 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-zinc-200">날짜별 입력</span>
              <SegmentedControl<'all' | 'filled'>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'filled', label: `입력된 날 ${filledCount}` },
                ]}
              />
            </div>

            {visibleDates.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-6">
                아직 입력된 날이 없어요. 위의 일괄 입력을 쓰거나 &lsquo;전체&rsquo;에서 날짜를 눌러 입력하세요.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-zinc-700 border-y border-gray-100 dark:border-zinc-700">
                {visibleDates.map((d) => {
                  const e = entries[d]
                  const c = days[d]
                  const expanded = openDate === d
                  const dj = dayjs(d)
                  const dow = dj.day()
                  const off = isOffDay(d)
                  const dateColor =
                    dow === 6
                      ? 'text-blue-500'
                      : off
                        ? 'text-red-500'
                        : 'text-gray-800 dark:text-zinc-200'
                  const vis = e ? routeVisibility(e) : null
                  const routeText =
                    e && (e.from.trim() || e.to.trim())
                      ? `${e.from.trim() || '?'} → ${e.to.trim() || '?'}`
                      : ''
                  const dayTotal = c.lodging + c.allowance + c.transport + c.km * cfg.unitPrice
                  return (
                    <li
                      key={d}
                      className={`py-1 ${d === highlightStr ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenDate(expanded ? null : d)}
                        aria-expanded={expanded}
                        className="w-full flex items-center gap-2 px-1 py-2 text-left"
                      >
                        <span className={`w-[4.5rem] shrink-0 text-sm font-medium ${dateColor}`}>
                          {dj.format('M/D')} ({WEEKDAY[dow]})
                        </span>
                        <span className="flex-1 min-w-0">
                          {isDayFilled(e) ? (
                            <>
                              <span className="flex flex-wrap gap-1">
                                {e!.lodging > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                                    숙박 {e!.lodging === 1 ? 'A' : 'B'}
                                  </span>
                                )}
                                {c.transport > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-300">
                                    교통 {fmt(c.transport)}
                                  </span>
                                )}
                                {c.km > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                                    {fmt(c.km)}km
                                  </span>
                                )}
                              </span>
                              {routeText && (
                                <span className="block text-xs text-gray-500 dark:text-zinc-400 truncate mt-0.5">
                                  {routeText}
                                  {vis && (
                                    <span className="text-gray-400 dark:text-zinc-500">
                                      {' '}
                                      · 표시 {[vis.s1 && '①', vis.s2 && '②', vis.s3 && '③']
                                        .filter(Boolean)
                                        .join('') || '없음'}
                                    </span>
                                  )}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-zinc-600">입력 없음</span>
                          )}
                        </span>
                        {dayTotal > 0 && (
                          <span className="shrink-0 text-xs text-gray-500 dark:text-zinc-400">
                            {fmt(dayTotal)}
                          </span>
                        )}
                        {expanded ? (
                          <ChevronUp size={14} className="shrink-0 text-gray-400" />
                        ) : (
                          <ChevronDown size={14} className="shrink-0 text-gray-400" />
                        )}
                      </button>
                      {expanded && (
                        <div className="px-1 pb-2">
                          <DomesticDayEditor
                            entry={e ?? emptyDay()}
                            computed={c}
                            rank={rank}
                            places={places}
                            purposes={purposes}
                            canCopyPrev={
                              !!entries[dayjs(d).subtract(1, 'day').format('YYYY-MM-DD')] &&
                              isDayFilled(entries[dayjs(d).subtract(1, 'day').format('YYYY-MM-DD')])
                            }
                            onChange={(next) => updateEntry(d, next)}
                            onCopyPrev={() => copyPrev(d)}
                            onClear={() => clearEntry(d)}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
      </div>

      {/* 왼쪽 아래: 정산 요약 · 출력 */}
      <div className={`${CARD} space-y-4 lg:col-start-1 lg:row-start-2`}>
          {/* 합계 */}
          <div className="rounded-lg bg-gray-50 dark:bg-zinc-900/40 border border-gray-200 dark:border-zinc-700 p-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-2">정산 요약</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-zinc-400">
                  ① 출장여비
                  <span className="block text-[11px] text-gray-400 dark:text-zinc-500">
                    숙박 {totals.lodgingDays}일 · 숙박비 {fmt(totals.lodging)} + 일당 {fmt(totals.allowance)}
                  </span>
                </dt>
                <dd className="font-medium dark:text-zinc-200">{fmt(totals.sheet1)}원</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-zinc-400">
                  ② 교통비
                  <span className="block text-[11px] text-gray-400 dark:text-zinc-500">
                    운임 {fmt(totals.fare)} · 통행료 {fmt(totals.toll)} · 주차료 {fmt(totals.parking)}
                  </span>
                </dt>
                <dd className="font-medium dark:text-zinc-200">{fmt(totals.sheet2)}원</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-zinc-400">
                  ③ 운전주보
                  <span className="block text-[11px] text-gray-400 dark:text-zinc-500">
                    {fmt(totals.km)}km × {fmt(cfg.unitPrice)}원 · 운행 {totals.driveDays}일
                    {cfg.odometerStart !== null &&
                      ` · 계기판 ${fmt(cfg.odometerStart)} → ${fmt(cfg.odometerStart + totals.km)}`}
                  </span>
                </dt>
                <dd className="font-medium dark:text-zinc-200">{fmt(totals.sheet3)}원</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-gray-200 dark:border-zinc-700 pt-2">
                <dt className="font-semibold dark:text-white">합계</dt>
                <dd className="font-semibold text-blue-600 dark:text-blue-400">{fmt(totals.grand)}원</dd>
              </div>
            </dl>
            {!rank && (
              <p className="text-[11px] text-orange-500 mt-2">
                직급을 알 수 없어 숙박비·일당이 0원으로 계산돼요.
              </p>
            )}
          </div>

          {/* 액션 */}
          <div className="space-y-2">
            <Button
              fullWidth
              onClick={() =>
                setExportMsg('엑셀 출력은 다음 단계에서 연결할 예정이에요. (지금은 입력 화면만 확인용)')
              }
            >
              엑셀 출력
            </Button>
            {exportMsg && <p className="text-xs text-center text-blue-500">{exportMsg}</p>}
          </div>
      </div>
    </div>
  )
}
