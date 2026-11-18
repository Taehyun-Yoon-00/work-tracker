interface SegmentedControlOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  /** true면 컨테이너 너비를 꽉 채우고 각 항목을 균등 분할한다. */
  fullWidth?: boolean
  className?: string
}

/** 상태 필터처럼 하나만 고르는 탭형 선택 UI. */
export default function SegmentedControl({
  options,
  value,
  onChange,
  fullWidth = false,
  className = '',
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      className={`inline-flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-zinc-800 ${
        fullWidth ? 'flex w-full' : ''
      } ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-md text-xs font-medium px-3 py-1.5 transition active:scale-95 ${
              fullWidth ? 'flex-1' : ''
            } ${
              active
                ? 'bg-white dark:bg-zinc-600 text-gray-900 dark:text-white shadow-sm'
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
