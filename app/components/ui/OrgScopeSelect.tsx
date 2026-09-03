'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'

export interface OrgScopeOption {
  /** 'company' | 'division' | 'department' | 'team' 등 조회 단위 */
  level: string
  /** company 단위는 빈 문자열 */
  entityId: string
  /** 선택지에 보여줄 라벨. 상위 조직부터 이어붙인 경로 형태
   *  (예: "기술부문", "기술부문 > 제어기술부") — 별도 인디케이션 없이
   *  경로 자체가 "이 조직 전체"를 의미한다. */
  label: string
}

interface OrgScopeSelectProps {
  options: OrgScopeOption[]
  value: OrgScopeOption | null
  onChange: (option: OrgScopeOption) => void
  placeholder?: string
}

const optionKey = (o: { level: string; entityId: string }) => `${o.level}:${o.entityId}`

/**
 * 조직 단위(부문/부서/팀) 선택을 한 번의 조작으로 끝낼 수 있는 검색형 단일 콤보박스.
 * 레벨 선택 → 항목 선택으로 이어지는 2단계 셀렉트를 대체한다.
 * 옵션이 하나뿐이면(선택 권한 범위가 그 자체 하나뿐인 경우) 조작 불가능한 정적 표시로 보여준다.
 */
export default function OrgScopeSelect({
  options,
  value,
  onChange,
  placeholder = '조직 단위 선택',
}: OrgScopeSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) {
      // 패널이 열리면 바로 검색어를 입력할 수 있도록 포커스
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const selectable = options.length > 1

  if (!selectable) {
    // 선택지가 하나뿐이면 굳이 드롭다운을 열 필요가 없다 — 조작 없이 바로 보여준다.
    return (
      <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-transparent text-gray-700 dark:text-zinc-200 relative min-w-[160px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-zinc-600">
          <Search size={14} strokeWidth={1.75} />
        </span>
        {value?.label || placeholder}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative min-w-[220px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 relative hover:border-gray-300 dark:hover:border-zinc-500 transition"
      >
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-zinc-600 pointer-events-none">
          <Search size={14} strokeWidth={1.75} />
        </span>
        <span className="flex-1 text-left truncate">{value?.label || placeholder}</span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`shrink-0 text-gray-400 dark:text-zinc-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[260px] bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100 dark:border-zinc-700">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-zinc-600 pointer-events-none">
              <Search size={14} strokeWidth={1.75} />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="조직 검색"
              className="w-full pl-8 pr-3 py-2 text-sm outline-none bg-transparent dark:text-zinc-200"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-gray-400 dark:text-zinc-500 text-center">
                검색 결과가 없어요.
              </li>
            ) : (
              filtered.map((o) => {
                const isSelected = value ? optionKey(value) === optionKey(o) : false
                return (
                  <li key={optionKey(o)}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-zinc-700 ${
                        isSelected
                          ? 'text-blue-500 font-medium'
                          : 'text-gray-700 dark:text-zinc-200'
                      }`}
                    >
                      <span className="flex-1 truncate">{o.label}</span>
                      {isSelected && <Check size={14} strokeWidth={2} className="shrink-0" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
