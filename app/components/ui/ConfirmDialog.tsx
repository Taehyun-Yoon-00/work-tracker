'use client'

import { useEffect, useRef, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** 무엇이 일어나는지. 되돌릴 수 없으면 그 사실을 여기에 적는다. */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** danger는 되돌릴 수 없는 동작에만 쓴다. */
  tone?: 'danger' | 'normal'
  /** 처리 중이면 버튼을 잠근다. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const CONFIRM_TONE = {
  danger: 'bg-red-500 text-white hover:bg-red-600 focus-visible:outline-red-500',
  normal: 'bg-blue-500 text-white hover:bg-blue-600 focus-visible:outline-blue-500',
} as const

/**
 * 되돌리기 어려운 동작 앞에 세우는 확인 창.
 *
 * window.confirm은 브라우저 UI라 다크모드도 안 맞고 문구를 다듬을 수도 없다.
 * 기본 포커스는 "취소"에 둬서 엔터를 잘못 눌러도 실행되지 않게 한다.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'normal',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-800"
      >
        <h2 id="confirm-dialog-title" className="font-semibold dark:text-white">
          {title}
        </h2>
        {description && (
          <div className="mt-2 text-sm text-gray-600 dark:text-zinc-300">{description}</div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 active:scale-95 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition active:scale-95 disabled:opacity-50 ${CONFIRM_TONE[tone]}`}
          >
            {busy ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
