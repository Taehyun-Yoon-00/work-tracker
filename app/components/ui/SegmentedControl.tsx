import type { ReactNode } from 'react'

export interface SegmentedControlOption<T extends string = string> {
  value: T
  label: ReactNode
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  /** 옵션이 컨테이너 폭을 꽉 채우며 균등 분할할지(true) 내용 길이만큼만 차지할지(false, 기본값).
   *  ex) 상태 필터처럼 좌우로 꽉 채우고 싶으면 true, "부서 전체/내 팀만"처럼 다른 컨트롤 옆에
   *  자연스럽게 붙이고 싶으면 false. */
  fullWidth?: boolean
  className?: string
}

/**
 * 알약형 토글 (회색 트랙 안에서 선택된 항목만 흰 배경+그림자).
 *
 * 예전에는 이 패턴(team/[id], DepartmentAffiliationView, ApprovalList)과 테두리형 토글
 * (dashboard의 "1~말일/16~15일")이 같은 "둘 중 하나 고르기" 기능을 서로 다른 모양으로
 * 구현하고 있었다. 알약형으로 통일하고, 새 필터 토글은 항상 이 컴포넌트를 쓴다.
 */
export default function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  fullWidth = false,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={`${fullWidth ? 'flex' : 'inline-flex'} bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5 ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`${fullWidth ? 'flex-1' : ''} px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition ${
              active
                ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}