import dayjs from 'dayjs'

export interface WorkTimeInput {
  /** 'HH:mm' 또는 DB의 'HH:mm:ss' */
  start_time: string
  end_time: string
  break_minutes: number
  /** 퇴근이 다음 날로 넘어가는 경우 */
  is_next_day?: boolean | null
}

/**
 * 하루 실근무 시간(시간 단위, 소수점 2자리)을 계산한다.
 *
 * is_next_day가 true면 퇴근 시각을 다음 날로 계산해야 한다.
 * 이 처리가 빠지면 야간 근무 기록이 음수로 나온다.
 */
export function calcWorkHours({
  start_time,
  end_time,
  break_minutes,
  is_next_day,
}: WorkTimeInput): number {
  if (!start_time || !end_time) return 0
  const start = dayjs(`2000-01-01 ${start_time}`)
  const end = dayjs(`2000-01-0${is_next_day ? '2' : '1'} ${end_time}`)
  const minutes = end.diff(start, 'minute') - (break_minutes || 0)
  return Math.round((minutes / 60) * 100) / 100
}

/** 근무시간 합계 (개별 기록을 반올림한 뒤 더한다) */
export function sumWorkHours(logs: WorkTimeInput[]): number {
  return logs.reduce((acc, log) => acc + calcWorkHours(log), 0)
}
