import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'pending'
  | 'ghost'
  | 'tint'
type ButtonSize = 'sm' | 'md'

// py-1.5/py-2/py-2.5/py-3.5가 화면마다 맥락 없이 섞여 있던 걸 두 단계로 수렴한다.
// sm: 필터 칩, 인라인 액션 같은 보조 버튼. md: 폼 제출처럼 화면의 주된 액션.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
}

// 색은 Badge.tsx와 같은 5+ 톤 체계를 그대로 따른다 — 버튼과 뱃지가 같은 상태를
// 가리킬 때 다른 색을 쓰지 않도록. success/warning/pending은 결재 승인·반려·취소
// 같은 상태 전환 액션에서만 쓴다(취소=warning, 대기 상태로 되돌리는 액션=pending).
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-500 text-white hover:bg-blue-600',
  secondary:
    'border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  success: 'bg-green-500 text-white hover:bg-green-600',
  warning: 'bg-orange-400 text-white hover:bg-orange-500',
  pending: 'bg-yellow-500 text-white hover:bg-yellow-600',
  ghost: 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700',
  /** "+ 항목 생성"처럼 페이지 안에서 튀지 않되 여전히 액션임을 알려야 하는 2순위 CTA. */
  tint: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** true면 버튼을 잠그고 라벨을 "처리 중..."으로 바꾼다. children으로 커스텀 로딩 문구를 주면 그걸 우선한다. */
  loading?: boolean
}

/** 페이지 곳곳의 버튼 padding·색상 조합을 대신하는 공용 버튼.
 *  ConfirmDialog처럼 포커스를 직접 옮겨야 하는 곳이 있어 ref를 그대로 전달한다. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled,
    className = '',
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`rounded-lg font-medium transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
        VARIANT_CLASS[variant]
      } ${SIZE_CLASS[size]} ${fullWidth ? 'w-full' : ''} ${className}`.trim()}
      {...rest}
    >
      {loading ? '처리 중...' : children}
    </button>
  )
})

export default Button
