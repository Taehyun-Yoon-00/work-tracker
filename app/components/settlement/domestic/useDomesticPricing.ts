'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDomesticPricing } from '../../../lib/settlement/domesticRepo'
import { EMPTY_PRICING, type DomesticPricing } from '../../../lib/settlement/pricing'

/**
 * 직급별 단가 · 차종 · 월별 유류 단가를 불러온다 (모든 사용자가 읽을 수 있는 테이블).
 * 양이 적어서 통째로 가져오고, 정산월에 맞는 값은 lib/settlement/pricing.ts의 함수로 고른다.
 *
 * 처음 불러올 때만 status가 'loading'이 된다. 이후 reload()는 화면을 그대로 둔 채 값만 갱신한다
 * (관리 화면에서 한 카드를 저장해도 다른 카드에 입력 중이던 값이 사라지지 않도록).
 * 첫 로딩 이후 갱신에 실패하면 이전 값을 유지하고 refreshError에 이유를 담는다.
 */
export function useDomesticPricing() {
  const [pricing, setPricing] = useState<DomesticPricing>(EMPTY_PRICING)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const loadedOnce = useRef(false)
  const aliveRef = useRef(true)

  const load = useCallback(() => {
    if (!loadedOnce.current) setStatus('loading')
    loadDomesticPricing()
      .then((p) => {
        if (!aliveRef.current) return
        loadedOnce.current = true
        setPricing(p)
        setRefreshError('')
        setStatus('ready')
      })
      .catch((e) => {
        if (!aliveRef.current) return
        const message = e instanceof Error ? e.message : '단가표를 불러오지 못했어요.'
        if (loadedOnce.current) {
          setRefreshError(message)
        } else {
          setError(message)
          setStatus('error')
        }
      })
  }, [])

  useEffect(() => {
    aliveRef.current = true
    load()
    return () => {
      aliveRef.current = false
    }
  }, [load])

  return { pricing, status, error, refreshError, reload: load }
}
