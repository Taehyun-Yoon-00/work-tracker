interface SkeletonRowsProps {
  /** 몇 줄을 보여줄지. 실제로 들어올 줄 수와 비슷하게 맞춘다. */
  rows?: number
  /** 스크린리더용 안내. "팀원 목록"처럼 무엇을 기다리는지 적는다. */
  label: string
  className?: string
}

// 줄마다 폭을 다르게 해야 목록처럼 보인다. 모두 같은 폭이면 표가 아니라 블록으로 읽힌다.
const WIDTHS = ['55%', '40%', '62%', '35%', '48%']

/** 목록을 불러오는 동안 자리를 잡아두는 뼈대. 결과가 오면서 높이가 튀는 걸 막는다. */
export default function SkeletonRows({ rows = 3, label, className = '' }: SkeletonRowsProps) {
  return (
    <div className={className}>
      <p className="sr-only" role="status">
        {label}을(를) 불러오는 중입니다
      </p>
      <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b py-3 last:border-0 dark:border-zinc-700"
          >
            <div
              className="h-3 rounded bg-gray-200 dark:bg-zinc-700"
              style={{ width: WIDTHS[i % WIDTHS.length] }}
            />
            <div className="h-3 w-14 rounded bg-gray-200 dark:bg-zinc-700" />
          </div>
        ))}
      </div>
    </div>
  )
}
