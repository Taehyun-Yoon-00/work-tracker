// 국내 출장 정산 엑셀 출력 — 업로드된 양식(.xlsx)의 입력 칸만 채운다.
//
// 양식: 国内出張旅費精算 (시트 3개, 탭 순서로 식별)
//   1번 시트 出張旅費精算   : 숙박 구분 · 행선지 · 숙박비/일당
//   2번 시트 交通費-詳細    : 교통수단 · 운임/통행료/주차료 · 행선지 · 목적
//   3번 시트 運転週報       : 경로 · 누적/일일 주행거리 · km 단가
// 셀 위치는 lib/settlement/domestic.ts 머리말 주석과 같다.
//
// 금액 처리
//   양식 1번 시트의 숙박비/일당(AA, AG열)은 직급별 단가가 수식(CHOOSE)에 고정돼 있다. 단가를 DB에서
//   관리하므로 이 두 열은 수식 대신 DB 단가로 계산한 값을 직접 넣는다. 나머지 수식(합계, 날짜 계산)은
//   그대로 두고 캐시된 결과값만 맞춰 둔다(보호된 보기에서도 값이 바로 보이도록).

import dayjs from 'dayjs'
import JSZip from 'jszip'
import { getSettlementPeriod } from '../dates'
import { excelSerial } from '../xlsxXml'
import {
  TRANSPORT_MODES,
  allowanceAmount,
  dayTransportTotal,
  driveRouteText,
  lodgingAmount,
  routeVisibility,
  type DateStr,
  type RankLevel,
  type RankRate,
  type TransportModeKey,
  type TripDayEntry,
} from './domestic'
import { SheetEditor, dropCalcChain, listSheets } from './xlsxSheet'

export class DomesticTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomesticTemplateError'
  }
}

export interface BuildDomesticInput {
  /** 업로드된 양식(.xlsx) 파일 내용 */
  template: ArrayBuffer | Uint8Array
  /** 정산월(당월). 2026/11 = 10/16~11/15 */
  year: number
  month: number
  /** 양식 이름란에 들어갈 이름(한자 → 한글 순) */
  personName: string
  rank: RankLevel
  /** 이 달·이 직급에 적용되는 숙박비/일당 */
  rate: RankRate
  /** km당 단가 (차종별 단가표 또는 직접 입력값) */
  fuelUnitPrice: number
  /** 시작 계기판(전월 말 누적). null이면 누적 칸을 비운다 */
  odometerStart: number | null
  entries: Record<DateStr, TripDayEntry | undefined>
}

const FIRST_ROW = 9
const DAY_ROWS = 31
const rowOf = (i: number) => FIRST_ROW + i * 2

/** 교통수단 두 줄: 윗줄 列車·地下鉄·TAXI, 아랫줄 BUS·社有車·私有車. 고른 것만 ■ */
function modeLines(modes: TransportModeKey[]): [string, string] {
  const mark = (key: TransportModeKey) => (modes.includes(key) ? '■' : '□')
  const text = (i: number) => `${mark(TRANSPORT_MODES[i].key)}${TRANSPORT_MODES[i].jp}`
  return [`${text(0)}${text(1)}${text(2)}`, `${text(3)}${text(4)}${text(5)}`]
}

interface DayCtx {
  index: number
  date: dayjs.Dayjs
  dateStr: DateStr
  inPeriod: boolean
  entry: TripDayEntry | undefined
}

export async function buildDomesticTripXlsx(input: BuildDomesticInput): Promise<Buffer> {
  const { year, month, personName, rank, rate, fuelUnitPrice, odometerStart, entries } = input
  const mm = String(month).padStart(2, '0')
  const monthStart = dayjs(`${year}-${mm}-01`)
  const period = getSettlementPeriod(monthStart)
  const periodStart = dayjs(period.start)
  const periodEnd = dayjs(period.end)

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(input.template)
  } catch {
    throw new DomesticTemplateError('양식 파일을 열지 못했어요. 올바른 .xlsx 파일인지 확인해 주세요.')
  }
  const sheets = await listSheets(zip)
  if (sheets.length < 3) {
    throw new DomesticTemplateError(
      `국내 출장 양식은 시트가 3개(출장여비 / 교통비 / 운전주보)여야 하는데 ${sheets.length}개예요. 양식을 다시 올려 주세요.`
    )
  }
  const editors: SheetEditor[] = []
  for (const s of sheets.slice(0, 3)) {
    const file = zip.file(s.path)
    if (!file) throw new DomesticTemplateError(`양식의 시트(${s.name})를 읽지 못했어요.`)
    editors.push(new SheetEditor(await file.async('string')))
  }
  const [s1, s2, s3] = editors

  // 정산 기간의 하루하루 (양식은 최대 31일)
  const days: DayCtx[] = []
  for (let i = 0; i < DAY_ROWS; i++) {
    const date = periodStart.add(i, 'day')
    const inPeriod = !date.isAfter(periodEnd, 'day')
    const dateStr = date.format('YYYY-MM-DD')
    days.push({ index: i, date, dateStr, inPeriod, entry: inPeriod ? entries[dateStr] : undefined })
  }

  // 하루 시작 시점의 계기판 값 (시작값 + 앞선 날들의 주행거리)
  const odoBefore = new Map<DateStr, number>()
  {
    let running = odometerStart
    for (const d of days) {
      if (!d.inPeriod) continue
      if (running !== null) odoBefore.set(d.dateStr, running)
      running = running === null ? null : running + (d.entry?.km ?? 0)
    }
  }

  // ───────────────── 시트1: 出張旅費精算 ─────────────────
  s1.setNumber('P3', year)
  s1.setNumber('U3', month)
  s1.setNumber('AT3', rank)
  s1.setString('AB5', personName)

  let sumLodging = 0
  let sumAllowance = 0
  for (const d of days) {
    const r = rowOf(d.index)
    const serial = d.inPeriod ? excelSerial(d.dateStr) : ''
    s1.setFormulaResult(`A${r}`, serial)
    s1.setFormulaResult(`D${r}`, serial)

    const e = d.entry
    const lodgingType = e?.lodging ?? 0
    const vis = e ? routeVisibility(e) : { s1: false, s2: false, s3: false }
    if (e && vis.s1 && (e.from.trim() || e.to.trim())) {
      s1.setString(`F${r}`, e.from.trim())
      s1.setString(`K${r}`, e.to.trim())
    } else {
      s1.clear(`F${r}`)
      s1.clear(`K${r}`)
    }

    const lodging = lodgingAmount(lodgingType, rate)
    const allowance = allowanceAmount(lodgingType, rate)
    if (lodgingType > 0) s1.setNumber(`AT${r}`, lodgingType)
    else s1.clear(`AT${r}`)
    s1.clear(`AV${r}`) // Oncall 입력은 쓰지 않는다
    s1.clear(`U${r}`) // 교통비는 2번 시트에서 입력한다

    // 숙박비/일당: 양식 수식(직급별 금액 고정) 대신 DB 단가로 계산한 값
    if (lodgingType > 0) {
      s1.setNumber(`AA${r}`, lodging)
      s1.setNumber(`AG${r}`, allowance)
    } else {
      s1.clear(`AA${r}`)
      s1.clear(`AG${r}`)
    }
    s1.setFormulaResult(`Z${r}`, lodgingType === 1 ? '■A' : lodgingType === 2 ? '■B' : '')
    s1.setFormulaResult(`AF${r}`, lodgingType > 0 ? '■A' : '')
    s1.setFormulaResult(`AL${r}`, lodging + allowance)
    s1.setFormulaResult(`AP${r}`, '')
    sumLodging += lodging
    sumAllowance += allowance
  }
  s1.setFormulaResult('U71', 0)
  s1.setFormulaResult('AA71', sumLodging)
  s1.setFormulaResult('AG71', sumAllowance)
  s1.setFormulaResult('AL71', sumLodging + sumAllowance)
  s1.setFormulaResult('R72', sumLodging + sumAllowance)

  // ───────────────── 시트2: 交通費 ─────────────────
  s2.setNumber('P3', year)
  s2.setNumber('U3', month)
  s2.setString('AB6', personName)

  let sumFare = 0
  let sumToll = 0
  let sumParking = 0
  for (const d of days) {
    const r = rowOf(d.index)
    const serial = d.inPeriod ? excelSerial(d.dateStr) : ''
    s2.setFormulaResult(`A${r}`, serial)
    s2.setFormulaResult(`D${r}`, serial)

    const e = d.entry
    const vis = e ? routeVisibility(e) : { s1: false, s2: false, s3: false }
    if (e && vis.s2 && (e.from.trim() || e.to.trim())) {
      s2.setString(`F${r}`, e.from.trim())
      s2.setString(`K${r}`, e.to.trim())
    } else {
      s2.clear(`F${r}`)
      s2.clear(`K${r}`)
    }

    // 교통수단은 두 줄 모두 새로 쓴다 (양식에 남아 있던 ■ 표시가 섞이지 않게)
    const [line1, line2] = modeLines(e?.modes ?? [])
    s2.setString(`N${r}`, line1)
    s2.setString(`N${r + 1}`, line2)

    const amounts: [string, number | null | undefined][] = [
      ['R', e?.fare],
      ['U', e?.toll],
      ['X', e?.parking],
    ]
    for (const [col, v] of amounts) {
      if (v && v > 0) s2.setNumber(`${col}${r}`, v)
      else s2.clear(`${col}${r}`)
    }
    s2.clear(`AA${r}`) // 電話料는 쓰지 않는다
    if (e?.purpose.trim()) s2.setString(`AI${r}`, e.purpose.trim())
    else s2.clear(`AI${r}`)

    s2.setFormulaResult(`AE${r}`, e ? dayTransportTotal(e) : 0)
    sumFare += e?.fare ?? 0
    sumToll += e?.toll ?? 0
    sumParking += e?.parking ?? 0
  }
  const sumTransport = sumFare + sumToll + sumParking
  s2.setFormulaResult('R71', sumFare)
  s2.setFormulaResult('U71', sumToll)
  s2.setFormulaResult('X71', sumParking)
  s2.setFormulaResult('AA71', 0)
  s2.setFormulaResult('AE71', sumTransport)
  s2.setFormulaResult('N73', sumTransport)

  // ───────────────── 시트3: 運転週報 ─────────────────
  s3.setNumber('AY1', year)
  s3.setNumber('AZ1', month)
  const prevEnd = monthStart.subtract(1, 'month').endOf('month')
  // 왼쪽 반(전월 16일~말일)의 일수: 28~31일 달이면 13~16일
  const leftCount = prevEnd.date() - 15
  s3.setFormulaResult('G2', excelSerial(period.start))
  s3.setFormulaResult('N2', excelSerial(prevEnd.format('YYYY-MM-DD')))
  s3.setFormulaResult('AF2', excelSerial(monthStart.format('YYYY-MM-DD')))
  s3.setFormulaResult('AM2', excelSerial(monthStart.format('YYYY-MM-DD')) + 14)
  const driver = `(運転者 ：${personName}）`
  s3.setString('B3', driver)
  s3.setString('AA3', driver)

  const dayOf = (dateStr: DateStr) => days.find((d) => d.dateStr === dateStr)
  let leftKm = 0
  let rightKm = 0

  // 왼쪽 반: 17행까지 준비돼 있으나 실제로는 leftCount일만 쓴다
  for (let k = 0; k < 17; k++) {
    const r = rowOf(k)
    const used = k < leftCount
    const d = used ? dayOf(periodStart.add(k, 'day').format('YYYY-MM-DD')) : undefined
    const serial = used && d ? excelSerial(d.dateStr) : ''
    s3.setFormulaResult(`B${r}`, serial)
    s3.setFormulaResult(`E${r}`, serial)
    // 구분 기호(／): 수식인 칸은 결과만 맞추고, 상수인 칸은 쓰지 않는 행에서 지운다
    if (s3.hasFormula(`D${r}`)) s3.setFormulaResult(`D${r}`, used ? '／' : '')
    else if (!used) s3.clear(`D${r}`)

    const e = d?.entry
    const vis = e ? routeVisibility(e) : { s1: false, s2: false, s3: false }
    const km = e?.km && e.km > 0 ? e.km : 0
    if (e && vis.s3 && (e.from.trim() || e.to.trim())) s3.setString(`G${r}`, driveRouteText(e))
    else s3.clear(`G${r}`)
    if (km > 0) s3.setNumber(`U${r + 1}`, km)
    else s3.clear(`U${r + 1}`)
    const odo = d ? odoBefore.get(d.dateStr) : undefined
    if (odo !== undefined) s3.setNumber(`Q${r}`, odo)
    else s3.clear(`Q${r}`)
    leftKm += km
  }

  // 오른쪽 반: 당월 1~15일 (항상 15행)
  const rightMonthLabel = excelSerial(`${year}-${mm}-16`)
  for (let j = 0; j < 15; j++) {
    const r = rowOf(j)
    const d = dayOf(monthStart.add(j, 'day').format('YYYY-MM-DD'))
    s3.setFormulaResult(`AA${r}`, rightMonthLabel)
    const e = d?.entry
    const vis = e ? routeVisibility(e) : { s1: false, s2: false, s3: false }
    const km = e?.km && e.km > 0 ? e.km : 0
    if (e && vis.s3 && (e.from.trim() || e.to.trim())) s3.setString(`AF${r}`, driveRouteText(e))
    else s3.clear(`AF${r}`)
    if (km > 0) s3.setNumber(`AT${r + 1}`, km)
    else s3.clear(`AT${r + 1}`)
    const odo = d ? odoBefore.get(d.dateStr) : undefined
    if (odo !== undefined) s3.setNumber(`AP${r}`, odo)
    else s3.clear(`AP${r}`)
    rightKm += km
  }

  // 위쪽 "전월 운행거리" 칸: 왼쪽은 시작 계기판, 오른쪽은 오른쪽 반이 시작되는 시점의 계기판
  if (odometerStart !== null) {
    s3.setNumber('Q7', odometerStart)
    s3.setNumber('AP7', odometerStart + leftKm)
  } else {
    s3.clear('Q7')
    s3.clear('AP7')
  }

  s3.setFormulaResult('U43', leftKm)
  s3.setFormulaResult('AT43', rightKm)
  s3.setNumber('H48', fuelUnitPrice)
  s3.setNumber('AG48', fuelUnitPrice)
  s3.setFormulaResult('L48', leftKm)
  s3.setFormulaResult('AK48', rightKm)
  s3.setFormulaResult('P48', fuelUnitPrice * leftKm)
  s3.setFormulaResult('AO48', fuelUnitPrice * rightKm)
  s3.setFormulaResult('AG53', fuelUnitPrice * (leftKm + rightKm))

  // ── 저장 ──
  sheets.slice(0, 3).forEach((s, i) => zip.file(s.path, editors[i].toXml()))
  await dropCalcChain(zip)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
