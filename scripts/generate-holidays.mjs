// 한국 법정 공휴일 표(app/lib/koreanHolidayTable.ts)를 date-holidays 패키지로부터 다시 만든다.
//
// 왜 표로 만들어 두나: date-holidays는 전 세계 국가 데이터를 담은 큰 패키지라서, 브라우저에서
// 공휴일 판정 하나 하려고 매 페이지 번들에 넣으면 초기 로딩이 느려진다. 한국 공휴일만 미리
// 계산해 두면 판정 결과는 같으면서 번들이 훨씬 작아진다.
//
// 사용법 (date-holidays를 업그레이드했거나, 임시공휴일이 새로 생겼을 때):
//   TZ=Asia/Seoul node scripts/generate-holidays.mjs
import Holidays from 'date-holidays'
import { writeFileSync } from 'node:fs'

const FROM_YEAR = 1990
const TO_YEAR = 2100
const hd = new Holidays('KR')

const pad = (n) => String(n).padStart(2, '0')
const byYear = {}
for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
  const days = []
  for (let m = 0; m < 12; m++) {
    const last = new Date(y, m + 1, 0).getDate()
    for (let d = 1; d <= last; d++) {
      if (hd.isHoliday(new Date(y, m, d, 12))) days.push(`${pad(m + 1)}${pad(d)}`)
    }
  }
  byYear[y] = days.join(' ')
}

const body = Object.entries(byYear)
  .map(([y, days]) => `  ${y}: '${days}',`)
  .join('\n')

const out = `// 자동 생성 파일 — 직접 수정하지 말 것. (scripts/generate-holidays.mjs 로 다시 만든다)
// ${FROM_YEAR}~${TO_YEAR}년 한국 공휴일을 연도별 'MMDD' 목록으로 담은 표.
export const KR_HOLIDAY_TABLE_FROM_YEAR = ${FROM_YEAR}
export const KR_HOLIDAY_TABLE_TO_YEAR = ${TO_YEAR}
export const KR_HOLIDAY_TABLE: Record<number, string> = {
${body}
}
`
writeFileSync(new URL('../app/lib/koreanHolidayTable.ts', import.meta.url), out)
console.log('written', Object.keys(byYear).length, 'years')
