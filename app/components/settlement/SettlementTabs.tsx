'use client'

import { visibleSettlementTypes, type SettlementTypeKey } from '../../lib/settlement/types'

interface Props {
  value: SettlementTypeKey
  onChange: (value: SettlementTypeKey) => void
  /** 총괄 관리자/마스터인지 — 관리 탭을 보여줄지 결정한다 */
  isAdmin: boolean
}

/** 출장 정산 탭 (국내 / 해외 / 관리). 비활성 탭은 눌러도 반응하지 않고, 관리 탭은 관리자에게만 보인다. */
export default function SettlementTabs({ value, onChange, isAdmin }: Props) {
  return (
    <div
      role="tablist"
      aria-label="출장 정산 유형"
      className="flex border-b border-gray-200 dark:border-zinc-700 mb-4"
    >
      {visibleSettlementTypes(isAdmin).map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={!t.enabled}
            disabled={!t.enabled}
            onClick={() => t.enabled && onChange(t.key)}
            className={`flex-1 sm:flex-none sm:px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              !t.enabled
                ? 'border-transparent text-gray-300 dark:text-zinc-600 cursor-not-allowed'
                : active
                  ? 'border-blue-500 text-blue-500 font-semibold'
                  : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
            {!t.enabled && (
              <span className="ml-1.5 text-[10px] font-normal align-middle">준비 중</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
