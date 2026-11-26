'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  emptyMonthData,
  loadDomesticMonth,
  saveDomesticMonth,
  type DomesticMonthData,
} from '../../../lib/settlement/domesticRepo'
import {
  monthKey,
  type RankLevel,
  type SettlementMonth,
} from '../../../lib/settlement/domestic'

export type LoadStatus = 'loading' | 'ready' | 'error'
/** idle: 변경 없음 / pending: 저장 대기 / saving: 저장 중 / saved: 저장됨 / error: 저장 실패 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 800

/**
 * 정산월 한 달치 데이터를 불러오고, 고칠 때마다 자동 저장한다.
 *
 * - 입력이 멈추고 0.8초 뒤에 그 달 전체를 한 번에 저장한다 (RPC 1회).
 * - 저장은 한 번에 하나씩 순서대로 간다. 저장 중에 또 고치면 끝난 뒤 다시 저장한다.
 * - 달을 옮기기 전에 저장을 마친다. 저장이 실패하면 달을 옮기지 않아 입력값을 잃지 않는다.
 * - 저장이 끝나지 않은 채 페이지를 닫으려 하면 브라우저 경고를 띄운다.
 */
export function useDomesticMonth(initialMonth: SettlementMonth, defaultRank: RankLevel | null) {
  const [month, setMonth] = useState<SettlementMonth>(initialMonth)
  const [data, setData] = useState<DomesticMonthData>(emptyMonthData)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  // 저장 시점에 최신 값을 읽기 위한 ref들. dataRef가 속한 달은 monthRef에 따로 둔다
  // (달을 옮기는 도중에도 "이전 달" 데이터를 이전 달로 저장하기 위해).
  const dataRef = useRef<DomesticMonthData>(data)
  const monthRef = useRef<SettlementMonth>(initialMonth)
  const defaultRankRef = useRef<RankLevel | null>(defaultRank)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true))

  useEffect(() => {
    defaultRankRef.current = defaultRank
  }, [defaultRank])

  const runSave = useCallback((): Promise<boolean> => {
    chainRef.current = chainRef.current.then(async () => {
      if (!dirtyRef.current) return true
      const snapshot = dataRef.current
      const snapshotMonth = monthRef.current
      // 저장하는 동안 또 고쳐지면 update()가 다시 true로 바꾼다.
      dirtyRef.current = false
      setSaveStatus('saving')
      try {
        await saveDomesticMonth(snapshotMonth, snapshot, defaultRankRef.current)
        setSaveStatus(dirtyRef.current ? 'pending' : 'saved')
        return true
      } catch (e) {
        dirtyRef.current = true
        setErrorMessage(e instanceof Error ? e.message : '저장하지 못했어요.')
        setSaveStatus('error')
        return false
      }
    })
    return chainRef.current
  }, [])

  const flush = useCallback((): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return runSave()
  }, [runSave])

  /** 화면에서 값을 고칠 때 쓴다. 바꾼 뒤 자동 저장이 예약된다. */
  const update = useCallback(
    (fn: (prev: DomesticMonthData) => DomesticMonthData) => {
      const next = fn(dataRef.current)
      dataRef.current = next
      setData(next)
      dirtyRef.current = true
      setSaveStatus('pending')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void runSave()
      }, AUTOSAVE_DELAY_MS)
    },
    [runSave]
  )

  /** 정산월을 옮긴다. 먼저 저장을 마치고, 저장에 실패하면 옮기지 않고 false를 돌려준다. */
  const changeMonth = useCallback(
    async (next: SettlementMonth): Promise<boolean> => {
      const ok = await flush()
      if (!ok) return false
      setMonth(next)
      return true
    },
    [flush]
  )

  // 달이 바뀌면(또는 다시 시도하면) 그 달 데이터를 불러온다.
  const key = monthKey(month)
  useEffect(() => {
    let cancelled = false
    setLoadStatus('loading')
    loadDomesticMonth(month)
      .then((loaded) => {
        if (cancelled) return
        dataRef.current = loaded
        monthRef.current = month
        dirtyRef.current = false
        setData(loaded)
        setSaveStatus('idle')
        setLoadStatus('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setErrorMessage(e instanceof Error ? e.message : '불러오지 못했어요.')
        setLoadStatus('error')
      })
    return () => {
      cancelled = true
    }
    // month 객체 대신 key로 비교한다 (같은 달이면 다시 불러오지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadCount])

  // 화면을 떠날 때 남은 변경을 저장하고, 저장이 끝나기 전 새로고침/닫기는 경고한다.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dirtyRef.current) void runSave()
    }
  }, [runSave])

  useEffect(() => {
    if (saveStatus === 'idle' || saveStatus === 'saved') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveStatus])

  return {
    month,
    data,
    loadStatus,
    saveStatus,
    errorMessage,
    update,
    changeMonth,
    /** 대기 중인 변경을 지금 저장한다. 저장에 실패하면 false (엑셀 출력 전에 쓴다) */
    flush,
    /** 저장 실패 후 다시 시도 */
    retrySave: () => void flush(),
    /** 불러오기 실패 후 다시 시도 */
    reload: () => setReloadCount((c) => c + 1),
  }
}
