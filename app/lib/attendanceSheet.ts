import JSZip from 'jszip'
import dayjs from 'dayjs'
import Holidays from 'date-holidays'
import { getSettlementPeriod } from './dates'
import {
  clearCell,
  excelSerial,
  getCellCachedNumber,
  getCellStyle,
  hasCell,
  setCellNumber,
  setCellString,
  setCellStyle,
  setFormulaCachedValue,
  setFormulaWithCache,
  removeCalcChainEntries,
} from './xlsxXml'

// 근무관리표(勤務管理表) 엑셀 채우기.
//
// 양식(様式 시트)의 수식은 건드리지 않고 "입력 칸"에만 값을 넣는다. 다만 아래 두 가지는 예외다.
//  - A12:A42(평일 2 / 휴일 1)는 양식에 수식이 들어 있지만 요청에 따라 값으로 덮어쓴다.
//  - L3(정산 종료일)은 수식을 유지하되, 달마다 말일이 다르므로 수식 안의 상수만 그 달에 맞게 바꿔 넣는다.
//  - L2, J12:N44 등 나머지 수식은 그대로 두고 "캐시된 결과값"만 직접 계산해 넣는다.
//
// 워크북의 계산 설정(calcPr)은 양식 원본 그대로 둔다. 서포트리스트 출력은 fullCalcOnLoad/forceFullCalc로
// "열 때 전부 다시 계산"을 지시하지만, 여기서는 시트의 모든 수식(L2, L3, B, D, J~N, 합계)의 캐시를
// 직접 계산해 넣으므로 그 지시가 필요 없다. 오히려 보호된 보기에서 캐시값을 믿지 않게 만들 수 있다.
//    파일을 내려받아 [보호된 보기]로 열면 Excel이 재계산을 하지 않으므로, 캐시가 비어 있으면
//    [편집 사용]을 누르기 전까지 계산 결과가 보이지 않기 때문이다.
//
// DB/네트워크에 의존하지 않는 순수 함수로 두어, 라우트 밖에서도 그대로 검증할 수 있게 했다.

const hd = new Holidays('KR')

const FIRST_ROW = 12
const DAY_ROWS = 31 // 12~42행
const TOTAL_WEEKDAY_ROW = 43 // 平日合計
const TOTAL_HOLIDAY_ROW = 44 // 休日合計

// 휴가 종류 → E열(休暇) 표기. 오전/오후 반차는 모두 '년반'.
const VACATION_LABEL: Record<string, string> = {
  annual: '년차',
  morning: '년반',
  afternoon: '년반',
  special: '특휴/대휴',
}

export class AttendanceTemplateError extends Error {}

export interface AttendanceLog {
  date: string // 'YYYY-MM-DD'
  start_time: string // 'HH:mm' 또는 'HH:mm:ss'
  end_time: string
  is_next_day: boolean | null
}

export interface AttendanceVacation {
  date: string
  type: string
}

export interface BuildAttendanceInput {
  template: ArrayBuffer | Uint8Array | Buffer
  /** 당월(정산 종료월). 예: 2026년 11월 → 10/16 ~ 11/15 */
  year: number
  month: number
  logs: AttendanceLog[]
  vacations: AttendanceVacation[]
  /** 사내 대체공휴일 'YYYY-MM-DD' */
  substituteHolidays: Set<string>
}

/** 휴일 여부 — 주말 + 법정 공휴일 + 사내 대체공휴일. 서포트리스트 출력/근무기록 화면과 같은 규칙. */
export function isHolidayDate(dateStr: string, substituteHolidays: Set<string>): boolean {
  const day = dayjs(dateStr).day()
  if (day === 0 || day === 6) return true
  if (substituteHolidays.has(dateStr)) return true
  return !!hd.isHoliday(dayjs(dateStr).toDate())
}

/** 'HH:mm(:ss)' → 하루 대비 비율(Excel 시간 값). 익일 퇴근이면 24:00을 더한다(예: 익일 06:00 → 30:00 = 1.25). */
export function toExcelTime(time: string, nextDay = false): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const minutes = Number(m[1]) * 60 + Number(m[2]) + (nextDay ? 24 * 60 : 0)
  return minutes / 1440
}

const r9 = (n: number) => Math.round(n * 1e9) / 1e9

interface RowInput {
  A: number
  H: number | null
  I: number | null
  P: number | null
  Q: number | null
}
interface Cfg {
  K11: number
  M10: number
  M11: number
}

/** 양식 J~N열 수식을 그대로 옮긴 계산. 결과는 캐시값으로만 쓰고 수식 자체는 양식에 남는다. */
function calcRow({ A, H, I, P, Q }: RowInput, cfg: Cfg) {
  let J = 0
  if (H !== null && I !== null) {
    const span = (I - H) * 24
    if (A === 2 && Q === 2) J = span - 1
    else if (A === 2 && Q === 1) J = span - 2
    else if (A === 1 && P === 2 && Q === 2) J = span
    else if (A === 1 && P === 2 && Q === 1) J = span - 1
    else if (A === 1 && P === 1 && Q === 2) J = span - 1
    else if (A === 1 && P === 1 && Q === 1) J = span - 2
  }
  J = r9(J)

  const K = J >= cfg.K11 ? cfg.K11 : J

  const h = H ?? 0
  const i = I ?? 0
  const toM10 = r9((i - cfg.M10) * 24)
  const toM11 = r9((i - cfg.M11) * 24)
  let M = 0
  if (J > 8 && h < cfg.M10 && i > cfg.M10 && i <= cfg.M11 && J - 8 > toM10) M = toM10
  else if (J > 8 && h < cfg.M10 && i > cfg.M10 && i <= cfg.M11 && J - 8 < toM10) M = J - 8
  else if (J > 8 && h < cfg.M10 && i > cfg.M11 && J - 8 >= toM11 && J - 8 - toM11 >= 8) M = 8
  else if (J > 8 && h < cfg.M10 && i > cfg.M11 && J - 8 >= toM11 && J - 8 - toM11 < 8)
    M = J - 8 - toM11
  M = r9(M)

  const L = r9(J - K - M)
  // N(夜間組)은 R열(야간조) 입력이 1일 때만 값이 생긴다. 이 출력은 R열을 채우지 않으므로 0.
  const N = 0

  return { J, K, L, M, N }
}

function assertCellExists(xml: string, ref: string) {
  if (!hasCell(xml, ref)) {
    throw new AttendanceTemplateError(
      `근무관리표 양식에서 ${ref} 셀을 찾지 못했어요. 양식이 바뀌었는지 확인해 주세요.`
    )
  }
}

/** 사용자 지정 숫자 서식 [h]:mm(24시간을 넘는 시간을 30:00처럼 표시)의 id를 돌려준다. 없으면 만든다.
 * 내장 46번은 [h]:mm:ss(30:00:00)라서 쓰지 않는다. */
function ensureOverflowTimeFormat(stylesXml: string): { xml: string; id: number } {
  const existing = stylesXml.match(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="\[h\]:mm"[^>]*\/>/)
  if (existing) return { xml: stylesXml, id: Number(existing[1]) }

  const block = stylesXml.match(/<numFmts\b[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/numFmts>/)
  if (!block) {
    const id = 164
    const xml = stylesXml.replace(
      /<fonts\b/,
      `<numFmts count="1"><numFmt numFmtId="${id}" formatCode="[h]:mm"/></numFmts><fonts`
    )
    if (xml === stylesXml) throw new AttendanceTemplateError('양식의 서식 정보를 읽지 못했어요.')
    return { xml, id }
  }
  const ids = [...block[2].matchAll(/numFmtId="(\d+)"/g)].map((m) => Number(m[1]))
  const id = Math.max(163, ...ids) + 1
  const xml = stylesXml.replace(
    block[0],
    block[0]
      .replace(/count="\d+"/, `count="${ids.length + 1}"`)
      .replace('</numFmts>', `<numFmt numFmtId="${id}" formatCode="[h]:mm"/></numFmts>`)
  )
  return { xml, id }
}

/** [h]:mm 서식을 쓰는 xf를 cellXfs에 하나 추가하고 그 번호를 돌려준다(기준 xf의 폰트/테두리/정렬은 그대로). */
function addOverflowTimeStyle(stylesXml: string, baseId: number): { xml: string; id: number } {
  const fmt = ensureOverflowTimeFormat(stylesXml)
  stylesXml = fmt.xml

  const m = stylesXml.match(/<cellXfs\b[^>]*?count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!m) throw new AttendanceTemplateError('양식의 서식 정보를 읽지 못했어요.')
  const xfs = m[2].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? []
  const base = xfs[baseId]
  if (!base || xfs.length !== Number(m[1])) {
    throw new AttendanceTemplateError('양식의 서식 정보를 읽지 못했어요.')
  }
  let clone = base.replace(/numFmtId="\d+"/, `numFmtId="${fmt.id}"`)
  clone = /applyNumberFormat=/.test(clone)
    ? clone.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"')
    : clone.replace(/^<xf\b/, '<xf applyNumberFormat="1"')
  const newId = xfs.length
  const xml = stylesXml.replace(
    m[0],
    m[0].replace(/count="\d+"/, `count="${newId + 1}"`).replace('</cellXfs>', `${clone}</cellXfs>`)
  )
  return { xml, id: newId }
}

export async function buildAttendanceXlsx(input: BuildAttendanceInput): Promise<Buffer> {
  const { year, month, logs, vacations, substituteHolidays } = input
  const mm = String(month).padStart(2, '0')

  const monthStart = dayjs(`${year}-${mm}-01`)
  const { start: periodStart, end: periodEnd } = getSettlementPeriod(monthStart)
  const start = dayjs(periodStart)
  const prev = monthStart.subtract(1, 'month')

  const zip = await JSZip.loadAsync(input.template)

  // ── 시트 위치 찾기 (様式 시트, 없으면 첫 시트) ──
  const workbookFile = zip.file('xl/workbook.xml')
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relsFile) throw new AttendanceTemplateError('양식 파일 구조를 읽지 못했어요.')
  const workbookXml = await workbookFile.async('string')
  const relsXml = await relsFile.async('string')

  const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map((t) => t[0])
  const sheetTag = sheetTags.find((t) => /name="様式"/.test(t)) ?? sheetTags[0]
  const rId = sheetTag?.match(/r:id="([^"]+)"/)?.[1]
  const target = rId && relsXml.match(new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*>`))?.[0]
  const targetPath = target?.match(/Target="([^"]+)"/)?.[1]
  if (!targetPath) throw new AttendanceTemplateError('양식 파일의 시트 경로를 찾지 못했어요.')
  const sheetPath = `xl/${targetPath.replace(/^\/?(xl\/)?/, '')}`
  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new AttendanceTemplateError('양식 파일의 시트를 읽지 못했어요.')
  let sheetXml = await sheetFile.async('string')

  const stylesFile = zip.file('xl/styles.xml')
  if (!stylesFile) throw new AttendanceTemplateError('양식의 서식 파일을 읽지 못했어요.')
  let stylesXml = await stylesFile.async('string')

  // 쓰려는 셀이 양식에 모두 있는지 먼저 확인 — 없으면 조용히 빈 파일이 나오는 대신 명확히 실패시킨다.
  const requiredRefs = ['E2', 'E3', 'E4', 'L2', 'L3', 'D6', 'K11', 'M10', 'M11']
  for (let i = 0; i < DAY_ROWS; i++) {
    const r = FIRST_ROW + i
    ;['A', 'B', 'D', 'E', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'P'].forEach((c) => requiredRefs.push(c + r))
  }
  ;['J', 'K', 'L', 'M', 'N'].forEach((c) => {
    requiredRefs.push(c + TOTAL_WEEKDAY_ROW, c + TOTAL_HOLIDAY_ROW)
  })
  requiredRefs.forEach((ref) => assertCellExists(sheetXml, ref))

  // ── 헤더 영역 ──
  // E2는 L2(=DATE(E2,E3,16), 정산 시작일)가 쓰는 연도라 "전월이 속한 해"여야 한다.
  // 1월 정산(전년 12/16~1/15)에서 당월의 해를 넣으면 시작일이 1년 뒤로 밀린다.
  sheetXml = setCellNumber(sheetXml, 'E2', prev.year())
  sheetXml = setCellNumber(sheetXml, 'E3', prev.month() + 1)
  sheetXml = setCellNumber(sheetXml, 'E4', month)
  sheetXml = setFormulaCachedValue(sheetXml, 'L2', excelSerial(periodStart))
  // L3(정산 종료일) = 당월 15일. 양식 수식 DATE(E2,E4+1,-16)은 "다음 달 0일(=당월 말일) - 16"이라
  // 말일이 31일인 달에만 15일이 된다. 일수가 다른 달은 상수를 (15 - 당월 말일)로 바꿔야 한다:
  // 31일 -16 / 30일 -15 / 29일 -14 / 28일 -13.
  // 1월은 E2가 전년도(정산 시작일의 해)이므로 종료일의 해에 맞춰 E2+1을 쓴다.
  const dayOffset = 15 - monthStart.daysInMonth()
  const endYearExpr = month === 1 ? 'E2+1' : 'E2'
  sheetXml = setFormulaWithCache(
    sheetXml,
    'L3',
    `DATE(${endYearExpr},E4+1,${dayOffset})`,
    excelSerial(`${year}-${mm}-15`)
  )
  sheetXml = setCellString(
    sheetXml,
    'D6',
    `          ${year}年   ${mm}月度           勤務管理表                姓名    `
  )

  // 스크롤바(양식 컨트롤)가 연결된 E2/E3/E4와 같은 값을 가리키게 맞춘다.
  // 컨트롤 값은 두 곳에 따로 저장된다 — 신형 ctrlProps/*.xml(val)과 구형 VML 도면(<x:Val>).
  // 한쪽만 고치면 엑셀이 열 때 남은 쪽(양식 원본의 예전 연/월)으로 연결 셀을 되돌려 놓아
  // L2/L3 같은 날짜 수식이 예전 값으로 보이다가 [편집 사용] 후에야 바뀐다. 그래서 둘 다 맞춘다.
  // 또 이 워크북의 다른 시트(説明)에도 같은 $E$2~$E$4에 연결된 컨트롤이 있으므로,
  // 파일 이름으로 훑지 않고 이 시트의 관계 파일(.rels)이 가리키는 컨트롤만 고친다.
  const controlValues: Record<string, number> = {
    $E$2: prev.year(),
    $E$3: prev.month() + 1,
    $E$4: month,
  }
  const sheetRelsFile = zip.file(`xl/worksheets/_rels/${sheetPath.split('/').pop()}.rels`)
  if (sheetRelsFile) {
    const sheetRels = await sheetRelsFile.async('string')
    for (const rel of sheetRels.match(/<Relationship\b[^>]*>/g) ?? []) {
      const type = rel.match(/Type="([^"]+)"/)?.[1] ?? ''
      const relTarget = rel.match(/Target="([^"]+)"/)?.[1]
      if (!relTarget) continue
      // 관계 대상은 시트 파일(xl/worksheets/) 기준 상대 경로이거나 '/'로 시작하는 절대 경로다.
      const path = relTarget.startsWith('/') ? relTarget.slice(1) : `xl/${relTarget.replace(/^\.\.\//, '')}`

      if (type.endsWith('/ctrlProp')) {
        const file = zip.file(path)
        if (!file) continue
        let ctrl = await file.async('string')
        const link = ctrl.match(/fmlaLink="([^"]*)"/)?.[1]
        if (link && link in controlValues) {
          ctrl = ctrl.replace(/\bval="\d+"/, `val="${controlValues[link]}"`)
          zip.file(path, ctrl)
        }
      } else if (type.endsWith('/vmlDrawing')) {
        const file = zip.file(path)
        if (!file) continue
        // 인코딩을 건드리지 않도록 바이트 그대로(binarystring) 읽고 쓴다.
        let vml = await file.async('binarystring')
        vml = vml.replace(/<v:shape\b[\s\S]*?<\/v:shape>/g, (shape) => {
          const link = shape.match(/<x:FmlaLink>([^<]*)<\/x:FmlaLink>/)?.[1]?.trim()
          if (!link || !(link in controlValues)) return shape
          return shape.replace(/<x:Val>\d+<\/x:Val>/, `<x:Val>${controlValues[link]}</x:Val>`)
        })
        zip.file(path, vml, { binary: true })
      }
    }
  }

  // ── 데이터 맵 ──
  const logByDate = new Map<string, AttendanceLog>()
  logs.forEach((l) => logByDate.set(l.date, l))
  const vacationByDate = new Map<string, string>()
  vacations.forEach((v) => vacationByDate.set(v.date, v.type))

  const cfg: Cfg = {
    K11: getCellCachedNumber(sheetXml, 'K11') || 8,
    M10: getCellCachedNumber(sheetXml, 'M10') || 22 / 24,
    M11: getCellCachedNumber(sheetXml, 'M11') || 30 / 24,
  }

  // 24시간을 넘는 퇴근시각을 30:00 형태로 보이게 하는 서식은 필요할 때만 한 번 만든다.
  const overflowStyleFor = new Map<number, number>()
  const overflowStyle = (baseId: number) => {
    let id = overflowStyleFor.get(baseId)
    if (id === undefined) {
      const added = addOverflowTimeStyle(stylesXml, baseId)
      stylesXml = added.xml
      id = added.id
      overflowStyleFor.set(baseId, id)
    }
    return id
  }

  const sums = {
    weekday: { J: 0, K: 0, L: 0, M: 0, N: 0 },
    holiday: { J: 0, K: 0, L: 0, M: 0, N: 0 },
  }

  for (let i = 0; i < DAY_ROWS; i++) {
    const row = FIRST_ROW + i
    const date = start.add(i, 'day')
    const dateStr = date.format('YYYY-MM-DD')
    const inPeriod = !date.isAfter(dayjs(periodEnd), 'day')

    const holiday = isHolidayDate(dateStr, substituteHolidays)
    const A = holiday ? 1 : 2

    // 31일 미만인 정산 기간(예: 2/16~3/15)은 아래 몇 행이 기간 밖 날짜가 된다.
    // 이 행들은 양식의 조건부 서식($D>$L$3)이 회색 처리하므로 날짜/구분만 두고 입력은 비운다.
    const log = inPeriod ? logByDate.get(dateStr) : undefined
    const vacationType = inPeriod ? vacationByDate.get(dateStr) : undefined

    sheetXml = setCellNumber(sheetXml, `A${row}`, A) // 수식 대신 값
    sheetXml = setFormulaCachedValue(sheetXml, `B${row}`, date.day() === 0 ? 7 : date.day()) // WEEKDAY(D,2)
    sheetXml = setFormulaCachedValue(sheetXml, `D${row}`, excelSerial(dateStr))

    // E: 휴가
    const vacationLabel = vacationType ? VACATION_LABEL[vacationType] : undefined
    sheetXml = vacationLabel
      ? setCellString(sheetXml, `E${row}`, vacationLabel)
      : clearCell(sheetXml, `E${row}`)

    // H/I: 출퇴근 시각 (I는 익일 퇴근이면 24:00을 더한 값)
    const H = log ? toExcelTime(log.start_time) : null
    const I = log ? toExcelTime(log.end_time, !!log.is_next_day) : null
    if (log && H !== null && I !== null) {
      sheetXml = setCellNumber(sheetXml, `H${row}`, H)
      sheetXml = setCellNumber(sheetXml, `I${row}`, I)
      if (I >= 1) {
        sheetXml = setCellStyle(sheetXml, `I${row}`, overflowStyle(getCellStyle(sheetXml, `I${row}`)))
      }
    } else {
      sheetXml = clearCell(sheetXml, `H${row}`)
      sheetXml = clearCell(sheetXml, `I${row}`)
    }
    const worked = H !== null && I !== null

    // P: 휴일 근무면 1 (휴일 중식 — 양식의 P=1 이면 점심 1시간 공제)
    const P = holiday && worked ? 1 : null
    sheetXml = P ? setCellNumber(sheetXml, `P${row}`, P) : clearCell(sheetXml, `P${row}`)

    // Q(석식)는 양식에 이미 들어 있는 값(기본 2 = 석식 없음)을 그대로 쓴다.
    const Q = getCellCachedNumber(sheetXml, `Q${row}`) || null

    const calc = calcRow({ A, H: worked ? H : null, I: worked ? I : null, P, Q }, cfg)
    ;(['J', 'K', 'L', 'M', 'N'] as const).forEach((col) => {
      sheetXml = setFormulaCachedValue(sheetXml, `${col}${row}`, calc[col])
    })
    const bucket = A === 2 ? sums.weekday : sums.holiday
    ;(['J', 'K', 'L', 'M', 'N'] as const).forEach((col) => {
      bucket[col] = r9(bucket[col] + calc[col])
    })
  }

  // 43행(平日合計)/44행(休日合計): SUMIF 수식은 그대로, 캐시값만 채운다.
  ;(['J', 'K', 'L', 'M', 'N'] as const).forEach((col) => {
    sheetXml = setFormulaCachedValue(sheetXml, `${col}${TOTAL_WEEKDAY_ROW}`, sums.weekday[col])
    sheetXml = setFormulaCachedValue(sheetXml, `${col}${TOTAL_HOLIDAY_ROW}`, sums.holiday[col])
  })

  // ── calcChain 정리 ──
  // A12:A42는 수식을 값으로 바꿨으므로 calcChain에서 해당 항목만 뺀다. 남겨 두면 calcChain이
  // "수식 없는 셀"을 가리켜 Excel이 "복구했습니다" 경고를 띄운다. (L3는 수식을 유지하므로 그대로 둔다.)
  const calcChainFile = zip.file('xl/calcChain.xml')
  if (calcChainFile) {
    const sheetId = sheetTag.match(/sheetId="(\d+)"/)?.[1]
    if (sheetId) {
      const replaced = new Set<string>()
      for (let i = 0; i < DAY_ROWS; i++) replaced.add(`A${FIRST_ROW + i}`)
      zip.file(
        'xl/calcChain.xml',
        removeCalcChainEntries(await calcChainFile.async('string'), sheetId, replaced)
      )
    }
  }

  zip.file(sheetPath, sheetXml)
  zip.file('xl/styles.xml', stylesXml)

  return zip.generateAsync({ type: 'nodebuffer' })
}
