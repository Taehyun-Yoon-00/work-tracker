import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'

const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

interface Range {
  from: string
  to: string
}

// from~to 구간에 걸친 달들의 'YYYY-MM' 목록 (구간은 항상 달 단위로 가져온다).
function monthsIn(from: string, to: string): string[] {
  const out: string[] = []
  let cur = dayjs(from).startOf('month')
  const end = dayjs(to).startOf('month')
  while (!cur.isAfter(end)) {
    out.push(cur.format('YYYY-MM'))
    cur = cur.add(1, 'month')
  }
  return out
}

const NO_ROWS: any[] = []

function mergeById(prev: any[], incoming: any[]): any[] {
  const map = new Map<string, any>()
  prev.forEach((r) => map.set(r.id, r))
  incoming.forEach((r) => map.set(r.id, r))
  return Array.from(map.values())
}

/**
 * 팀/부서 캘린더용 휴가·재택 조회.
 *
 * 예전에는 구성원의 휴가·재택 기록을 날짜 제한 없이 전부 가져왔기 때문에 기록이 쌓일수록
 * 화면이 느려졌다(조회 행 수 제한에 걸려 오래된 기록이 조용히 빠질 위험도 있었다).
 * 지금은 보고 있는 달만 가져오고, 다른 달로 넘길 때 아직 안 본 구간만 추가로 가져온다.
 * 한 번 가져온 구간은 그대로 유지하므로 화면에 보이는 내용은 이전과 같다.
 *
 * - reloadToken: 값이 바뀌면 지금까지 본 구간 전체를 다시 불러온다(창에 다시 포커스될 때 최신화).
 * - ready: 첫 구간 로딩이 끝났는지 여부.
 */
export function useScheduleRange(
  userIds: string[],
  month: Date,
  reloadToken: number,
  vacationSelect = '*',
  remoteSelect = '*'
) {
  const [vacations, setVacations] = useState<any[]>([])
  const [remoteWorks, setRemoteWorks] = useState<any[]>([])
  // 어떤 사용자 목록에 대해 첫 로딩이 끝났는지 기억해 두고, 목록이 바뀐 렌더에서도 곧바로 "아직 준비 안 됨"으로 판단한다.
  const [readyKey, setReadyKey] = useState('')
  // 실제로 데이터가 도착해 있는 달들. 모달처럼 "특정 날짜의 일정이 비었다"고 단정해서 보여주는
  // 곳이 아직 불러오지 못한 달을 "없음"으로 오해하지 않도록 isLoaded로 확인한다.
  const [loaded, setLoaded] = useState<{ key: string; months: Set<string> } | null>(null)
  const rangeRef = useRef<Range | null>(null)
  const idsKeyRef = useRef('')
  const loadedKeyRef = useRef('')

  const idsKey = [...userIds].sort().join(',')
  const monthKey = dayjs(month).format('YYYY-MM')

  useEffect(() => {
    if (userIds.length === 0) {
      rangeRef.current = null
      idsKeyRef.current = ''
      loadedKeyRef.current = ''
      return
    }

    const monthStart = fmt(dayjs(month).startOf('month'))
    const monthEnd = fmt(dayjs(month).endOf('month'))
    const stateKey = `${idsKey}|${reloadToken}`
    const idsChanged = idsKeyRef.current !== idsKey
    const needsReload = loadedKeyRef.current !== stateKey

    const fetchRange = (from: string, to: string) =>
      Promise.all([
        supabase
          .from('vacations')
          .select(vacationSelect)
          .in('user_id', userIds)
          .gte('date', from)
          .lte('date', to),
        supabase
          .from('remote_works')
          .select(remoteSelect)
          .in('user_id', userIds)
          .gte('date', from)
          .lte('date', to),
      ])

    let cancelled = false
    const run = async () => {
      const prev = rangeRef.current

      if (needsReload || !prev) {
        // 다시 불러오기: 사용자 목록이 바뀌면 이번 달만, 같은 사용자의 새로고침이면
        // 지금까지 본 구간 전체(+이번 달)를 최신으로 바꾼다.
        const from = prev && !idsChanged ? (prev.from < monthStart ? prev.from : monthStart) : monthStart
        const to = prev && !idsChanged ? (prev.to > monthEnd ? prev.to : monthEnd) : monthEnd
        idsKeyRef.current = idsKey
        loadedKeyRef.current = stateKey
        rangeRef.current = { from, to }
        const [vac, rem] = await fetchRange(from, to)
        if (loadedKeyRef.current !== stateKey) return
        // 이 조회가 끝나기 전에 사용자가 다른 달로 넘겨 추가 구간이 먼저 도착했을 수 있으므로,
        // 그런 경우(cancelled)에는 덮어쓰지 않고 합친다.
        if (vac.data) setVacations((cur) => (cancelled ? mergeById(cur, vac.data as any[]) : (vac.data as any[])))
        if (rem.data) setRemoteWorks((cur) => (cancelled ? mergeById(cur, rem.data as any[]) : (rem.data as any[])))
        setReadyKey(idsKey)
        const months = monthsIn(from, to)
        setLoaded((cur) =>
          cancelled && cur && cur.key === idsKey
            ? { key: idsKey, months: new Set([...cur.months, ...months]) }
            : { key: idsKey, months: new Set(months) }
        )
        return
      }

      // 이미 불러온 구간 밖의 달로 넘어간 경우, 비어 있는 구간만 추가로 가져온다.
      const parts: Range[] = []
      let { from, to } = prev
      if (monthStart < from) {
        parts.push({ from: monthStart, to: fmt(dayjs(from).subtract(1, 'day')) })
        from = monthStart
      }
      if (monthEnd > to) {
        parts.push({ from: fmt(dayjs(to).add(1, 'day')), to: monthEnd })
        to = monthEnd
      }
      if (parts.length === 0) return
      rangeRef.current = { from, to }

      const results = await Promise.all(parts.map((p) => fetchRange(p.from, p.to)))
      if (loadedKeyRef.current !== stateKey) return
      const vacAdd = results.flatMap(([vac]) => (vac.data as any[]) || [])
      const remAdd = results.flatMap(([, rem]) => (rem.data as any[]) || [])
      if (vacAdd.length) setVacations((cur) => mergeById(cur, vacAdd))
      if (remAdd.length) setRemoteWorks((cur) => mergeById(cur, remAdd))
      const addedMonths = parts.flatMap((p) => monthsIn(p.from, p.to))
      setLoaded((cur) => {
        const base = cur && cur.key === idsKey ? cur.months : new Set<string>()
        return { key: idsKey, months: new Set([...base, ...addedMonths]) }
      })
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, monthKey, reloadToken])

  const ready = userIds.length === 0 || readyKey === idsKey
  const isLoaded = (date: Date) =>
    userIds.length === 0 ||
    (!!loaded && loaded.key === idsKey && loaded.months.has(dayjs(date).format('YYYY-MM')))
  // 사용자가 없으면 이전에 불러온 값이 남아 있어도 빈 목록으로 돌려준다.
  const empty = userIds.length === 0
  return {
    vacations: empty ? NO_ROWS : vacations,
    remoteWorks: empty ? NO_ROWS : remoteWorks,
    ready,
    isLoaded,
  }
}
