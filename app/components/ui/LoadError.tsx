interface LoadErrorProps {
  /** 무엇을 못 불러왔는지. 기본 문구로 충분하면 생략한다. */
  message?: string
  /** 있으면 "다시 시도" 버튼을 보여준다. */
  onRetry?: () => void
  /** 바깥 여백 등 호출부에서 덧붙일 클래스 */
  className?: string
}

/**
 * 조회 실패를 알리는 배너.
 *
 * 실패를 그냥 넘기면 화면이 "데이터 없음"으로 보여서, 권한 오류나 네트워크 장애가
 * 정상 상태와 구분되지 않는다. RLS를 켜면 특히 문제가 되므로 실패는 반드시 드러낸다.
 */
export default function LoadError({
  message = '데이터를 불러오지 못했습니다.',
  onRetry,
  className = '',
}: LoadErrorProps) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center dark:border-red-900 dark:bg-red-950/40 ${className}`.trim()}
    >
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}
