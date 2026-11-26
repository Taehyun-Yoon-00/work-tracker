'use client'

import Button from '../../ui/Button'
import { useDomesticPricing } from '../domestic/useDomesticPricing'
import AdminFuelCard from './AdminFuelCard'
import AdminRatesCard from './AdminRatesCard'
import AdminTemplateCard from './AdminTemplateCard'

/**
 * 출장 정산 "관리" 탭 — 총괄 관리자/마스터 전용.
 * 양식 업로드, 직급별 숙박비·일당, 차종별 월별 유류 단가를 관리한다.
 * 화면에서 탭을 숨기는 것과 별개로, 쓰기 API가 서버에서 권한을 다시 확인한다.
 */
export default function SettlementAdmin() {
  const { pricing, status, error, refreshError, reload } = useDomesticPricing()

  return (
    <div className="max-w-3xl space-y-4">
      <AdminTemplateCard />
      {status === 'loading' && (
        <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-6">단가표를 불러오는 중...</p>
      )}
      {status === 'error' && (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-red-500">
            단가표를 불러오지 못했어요.
            <span className="block text-xs mt-1">{error}</span>
          </p>
          <Button size="sm" onClick={reload}>
            다시 시도
          </Button>
        </div>
      )}
      {status === 'ready' && (
        <>
          {refreshError && (
            <p className="text-xs text-red-500">
              저장은 됐지만 최신 값을 다시 불러오지 못했어요. 화면의 값이 오래됐을 수 있어요. ({refreshError}){' '}
              <button type="button" onClick={reload} className="underline">
                다시 불러오기
              </button>
            </p>
          )}
          <AdminRatesCard pricing={pricing} onChanged={reload} />
          <AdminFuelCard pricing={pricing} onChanged={reload} />
        </>
      )}
    </div>
  )
}
