import type { ReactNode } from 'react'

// 출장 정산 입력 UI에서 공통으로 쓰는 작은 조각들.

export const INPUT_CLS =
  'w-full border rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 placeholder:text-gray-400 dark:placeholder:text-zinc-500'

export const LABEL_CLS = 'block text-xs text-gray-500 dark:text-zinc-400 mb-1'

export const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 입력창 문자열 → 숫자. 비어 있거나 음수/숫자가 아니면 null. */
export function toNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** 토글형 칩(교통수단, 장소 선택 등). selected면 파란색. */
export function Chip({
  selected = false,
  onClick,
  children,
  title,
}: {
  selected?: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition active:scale-95 ${
        selected
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 border-gray-300 dark:border-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-600'
      }`}
    >
      {children}
    </button>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(toNum(e.target.value))}
          className={`${INPUT_CLS} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-zinc-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

/** 시트 번호 + 이름 소제목 (예: ① 출장여비) */
export function SheetTitle({ no, name, hint }: { no: string; name: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 mb-2">
      <span className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
        {no} {name}
      </span>
      {hint && <span className="text-[11px] text-gray-400 dark:text-zinc-500">{hint}</span>}
    </div>
  )
}
