'use client'

import { useState } from 'react'
import {
  MatterFields,
  getMatterPresets,
  getFieldSuggestions,
  removeMatterPreset,
  removeFieldSuggestion,
} from '../../lib/matterHistory'

export const FIXED_CATEGORIES = ['수주', '자사업무', '타부서업무', '영업지원'] as const
export type FixedCategory = (typeof FIXED_CATEGORIES)[number]
export type WorkCategory = FixedCategory | '청구안건'
export const ALL_CATEGORIES: WorkCategory[] = [...FIXED_CATEGORIES, '청구안건']

export type MatterEntry = {
  key: string
  category: WorkCategory
  hours: string
  matter: MatterFields
}

export function emptyMatterEntry(defaultCategory: WorkCategory = '수주', hours = ''): MatterEntry {
  return {
    key: Math.random().toString(36).slice(2),
    category: defaultCategory,
    hours,
    matter: { place: '', division: '', content: '', costCode: '' },
  }
}

const FIELD_DEFS: { key: keyof MatterFields; label: string; placeholder: string }[] = [
  { key: 'place', label: '업무 장소', placeholder: '예: 사내, 고객사' },
  { key: 'division', label: '작업 구분', placeholder: '예: CS, 설치' },
  { key: 'content', label: '작업 내용 / 기종명', placeholder: '예: 관련장치 없음' },
  { key: 'costCode', label: '코스트코드', placeholder: '예: ADT1002100' },
]

interface Props {
  entries: MatterEntry[]
  onChange: (entries: MatterEntry[]) => void
  totalHours: number
  disabled?: boolean
}

export default function WorkMattersEditor({ entries, onChange, totalHours, disabled }: Props) {
  const [presets, setPresets] = useState(() => getMatterPresets())

  const handleRemovePreset = (e: React.MouseEvent, p: MatterFields) => {
    e.stopPropagation()
    setPresets(removeMatterPreset(p))
  }

  const updateEntry = (key: string, patch: Partial<MatterEntry>) => {
    onChange(entries.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  }

  const removeEntry = (key: string) => {
    onChange(entries.filter((e) => e.key !== key))
  }

  const addEntry = () => {
    const usedHours = entries.reduce((acc, e) => acc + (parseFloat(e.hours) || 0), 0)
    const remaining = Math.max(0, Math.round((totalHours - usedHours) * 100) / 100)
    onChange([...entries, emptyMatterEntry('수주', remaining > 0 ? String(remaining) : '')])
  }

  const sumHours = entries.reduce((acc, e) => acc + (parseFloat(e.hours) || 0), 0)
  const diff = Math.round((totalHours - sumHours) * 100) / 100
  const matches = Math.abs(diff) < 0.01

  return (
    <div className="mb-3">
      <label className="text-sm text-gray-500 dark:text-zinc-400">안건별 공수</label>

      <div className="space-y-3 mt-2">
        {entries.map((entry, idx) => (
          <div key={entry.key} className="border border-gray-200 dark:border-zinc-600 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <select
                value={entry.category}
                disabled={disabled}
                onChange={(e) => updateEntry(entry.key, { category: e.target.value as WorkCategory })}
                className="flex-1 border rounded-lg px-2 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c === '청구안건' ? '청구 안건' : c}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.25"
                min="0"
                value={entry.hours}
                disabled={disabled}
                onChange={(e) => updateEntry(entry.key, { hours: e.target.value })}
                placeholder="시간"
                className="w-20 border rounded-lg px-2 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
              />
              {entries.length > 1 && !disabled && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.key)}
                  className="shrink-0 text-gray-400 hover:text-red-500 px-1"
                  aria-label="안건 삭제"
                >
                  ✕
                </button>
              )}
            </div>

            {entry.category === '청구안건' && (
              <div className="mt-3 border-t border-gray-100 dark:border-zinc-700 pt-3">
                {presets.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1.5">최근 사용한 안건</p>
                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((p, i) => (
                        <span
                          key={i}
                          className="flex items-center rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-700 dark:text-zinc-300 overflow-hidden"
                        >
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => updateEntry(entry.key, { matter: p })}
                            className="pl-2.5 pr-1.5 py-1 disabled:opacity-50"
                          >
                            {p.content || p.place || '안건'} · {p.costCode || '코드없음'}
                          </button>
                          {!disabled && (
                            <button
                              type="button"
                              onClick={(e) => handleRemovePreset(e, p)}
                              aria-label="최근 사용한 안건 삭제"
                              className="pr-2 pl-0.5 py-1 text-gray-400 hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {FIELD_DEFS.map(({ key: fk, label, placeholder }) => (
                  <MatterField
                    key={fk}
                    field={fk}
                    label={label}
                    placeholder={placeholder}
                    value={entry.matter[fk]}
                    disabled={disabled}
                    onChange={(v) => updateEntry(entry.key, { matter: { ...entry.matter, [fk]: v } })}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={addEntry}
          className="w-full mt-2 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-500 hover:bg-blue-100 dark:bg-zinc-700 dark:text-zinc-300"
        >
          + 안건 추가
        </button>
      )}

      <p className={`text-xs mt-2 text-right ${matches ? 'text-gray-400 dark:text-zinc-500' : 'text-red-500'}`}>
        입력한 시간 합계 {sumHours.toFixed(2)}시간 / 총 근무시간 {totalHours.toFixed(2)}시간
        {!matches && (diff > 0 ? ` (${diff.toFixed(2)}시간 부족)` : ` (${Math.abs(diff).toFixed(2)}시간 초과)`)}
      </p>
    </div>
  )
}

function MatterField({
  field,
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  field: keyof MatterFields
  label: string
  placeholder: string
  value: string
  disabled?: boolean
  onChange: (v: string) => void
}) {
  const [suggestions, setSuggestions] = useState(() => getFieldSuggestions(field))

  const handleRemoveSuggestion = (e: React.MouseEvent, s: string) => {
    e.stopPropagation()
    setSuggestions(removeFieldSuggestion(field, s))
  }

  return (
    <div className="mb-2.5">
      <label className="text-xs text-gray-400 dark:text-zinc-500">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200 ${
          disabled ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400' : ''
        }`}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {suggestions.map((s) => (
            <span
              key={s}
              className="flex items-center rounded-full text-[11px] bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-zinc-800 dark:text-zinc-400 overflow-hidden"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(s)}
                className="pl-2 pr-1 py-0.5 disabled:opacity-50"
              >
                {s}
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveSuggestion(e, s)}
                  aria-label="이력 삭제"
                  className="pr-1.5 pl-0 py-0.5 text-gray-400 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
