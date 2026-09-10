import { X } from 'lucide-react'

interface ApproverRowProps {
  name: string
  /** 이름 옆 부가 설명 (예: "부문장(자동)") — 자동 결재권자 표시에 쓴다. */
  meta?: string
  /** 위임된 결재 범위 (예: ['휴가', '원격', '휴일']) */
  scopes?: string[]
  onRemove?: () => void
}

/**
 * 결재권자 한 명을 "이름 · 위임 범위" 한 줄로 표시한다.
 * 사람 자체를 색이 있는 큰 Pill로 표현하지 않고, 목록의 다른 인원 표시(팀원 등)와 같은 톤으로 맞춘다.
 */
export default function ApproverRow({ name, meta, scopes, onRemove }: ApproverRowProps) {
  const scopeText = scopes?.filter(Boolean).join(' · ')
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
        <span className="text-sm text-gray-700 dark:text-zinc-200">{name}</span>
        {meta && <span className="text-xs text-gray-400 dark:text-zinc-500">{meta}</span>}
        {scopeText && <span className="text-xs text-gray-400 dark:text-zinc-500">{scopeText}</span>}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-gray-300 hover:text-red-500 dark:text-zinc-600 shrink-0 inline-flex items-center"
        >
          <X size={13} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
