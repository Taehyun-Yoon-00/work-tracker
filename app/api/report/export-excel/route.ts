import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import dayjs from 'dayjs'
import { getSessionUser } from '@/app/lib/apiAuth'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'
import { getSettlementPeriod } from '@/app/lib/dates'
import { displayName } from '@/app/lib/labels'

export const runtime = 'nodejs'

const BUCKET = 'report-templates'

// work_log_matters.category(수주/자사업무/타부서업무/영업지원) → 엑셀 고정 행 번호.
// '청구안건'만 별도로 14행부터 안건 단위로 순서대로 늘어난다(아래 MATTER_START_ROW).
// 13행은 양식 원본 그대로 비워둔다.
const CATEGORY_ROW: Record<string, number> = {
  수주: 8,
  자사업무: 9,
  타부서업무: 10,
  영업지원: 11,
}

const MATTER_START_ROW = 14
const MATTER_END_ROW = 43 // 양식의 B44가 F13:F43 합계를 쓰므로 13행이 비어있어도 집계에는 포함된다.
const DATE_START_COL = 6 // F열(1=A, 6=F)
const DATE_ROW = 6 // 날짜(예: 8/16) 수식이 있는 행
const WEEKDAY_ROW = 7 // 요일(WEEKDAY) 수식이 있는 행

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface MatterMeta {
  place: string
  division: string
  content: string
  costCode: string
}

function matterKey(m: MatterMeta): string {
  return JSON.stringify([m.place, m.division, m.content, m.costCode])
}

// ── 엑셀 xlsx는 결국 zip 속 XML이다. 이 양식 파일은 오래 써오며 쌓인 명명된 범위(1,800개+)와
// 외부 통합문서 참조(51개)가 들어있는데, exceljs로 통째로 읽었다가 다시 쓰면 이 대부분을
// 잃어버려서("복구했습니다" 경고) 파일이 손상된 것처럼 보인다. 그래서 exceljs 대신 zip을 열어
// 우리가 실제로 채워야 하는 셀만 XML 텍스트 수준에서 직접 고치고, 나머지는 그대로 둔다. ──

function colLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function findCell(xml: string, ref: string): RegExpMatchArray | null {
  const regex = new RegExp(`<c r="${ref}"([^>]*?)(/>|>([\\s\\S]*?)</c>)`)
  return xml.match(regex)
}

/** 셀을 고정 숫자값으로 덮어쓴다(있던 수식이나 문자열 타입은 사라진다). 템플릿에 그 셀이
 * 아예 없으면(희소 셀) 건드리지 않고 그대로 둔다 — 이 양식은 우리가 쓰는 모든 셀이 빈 셀로라도
 * 미리 존재하므로 실제로는 항상 값이 채워진다. */
function setCellNumber(xml: string, ref: string, value: number): string {
  const m = findCell(xml, ref)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  const replacement = `<c r="${ref}"${attrs}><v>${value}</v></c>`
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length)
}

/** 셀을 문자열(inline string)로 덮어쓴다. */
function setCellString(xml: string, ref: string, text: string): string {
  const m = findCell(xml, ref)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  const replacement = `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text
  )}</t></is></c>`
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length)
}

/** 수식(<f>)은 그대로 두고 캐시된 숫자 결과값(<v>)만 갱신한다. 기존 양식의 t="str"은
 * 제거해야 숫자 서식(통화 단위, 시간 표시, 정렬)이 보호된 보기에서도 즉시 적용된다. */
function setFormulaCachedValue(xml: string, ref: string, cachedValue: number): string {
  const regex = new RegExp(`<c r="${ref}"([^>]*)>([\\s\\S]*?)</c>`)
  const m = xml.match(regex)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  let inner = m[2]
  inner = inner.replace(/<v[^>]*\/>|<v>[\s\S]*?<\/v>/, '')
  inner += `<v>${cachedValue}</v>`
  const replacement = `<c r="${ref}"${attrs}>${inner}</c>`
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length)
}

/** 수식의 캐시된 문자열 결과값도 갱신한다. 청구안건의 필수 정보가 빠진 경우처럼
 * 수식 결과가 숫자가 아닐 수 있는 셀(AL열)에 사용한다. */
function setFormulaCachedString(xml: string, ref: string, cachedValue: string): string {
  const regex = new RegExp(`<c r="${ref}"([^>]*)>([\\s\\S]*?)</c>`)
  const m = xml.match(regex)
  if (!m || m.index === undefined) return xml
  const attrs = m[1]
  let inner = m[2]
  inner = inner.replace(/<v[^>]*\/>|<v>[\s\S]*?<\/v>/, '')
  inner += `<v>${escapeXml(cachedValue)}</v>`
  const replacement = `<c r="${ref}"${attrs}>${inner}</c>`
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length)
}

/** 템플릿에 이미 입력된 숫자(예: 시간당 단가, BS열 보정액)의 캐시값을 읽는다. */
function getCellCachedNumber(xml: string, ref: string): number {
  const m = findCell(xml, ref)
  if (!m) return 0
  const value = m[0].match(/<v>([\s\S]*?)<\/v>/)?.[1]
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

/** Excel이 계산을 허용하는 환경에서는 수식도 다시 계산하도록 지시한다. 보호된 보기처럼
 * 재계산이 보류되는 환경에서도 위의 캐시값이 즉시 표시되므로 두 경우 모두 처리된다. */
function enableWorkbookRecalculation(xml: string): string {
  const calcPr = '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" calcId="0"/>'
  if (/<calcPr\b/.test(xml)) {
    return xml.replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/, calcPr)
  }
  return xml.replace('</workbook>', `${calcPr}</workbook>`)
}

function excelSerial(dateStr: string): number {
  return dayjs(dateStr).diff(dayjs('1899-12-30'), 'day')
}
function excelWeekday(dateStr: string): number {
  return dayjs(dateStr).day() + 1 // 일요일=1 ... 토요일=7 (WEEKDAY 기본값)
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year, month가 필요해요.' }, { status: 400 })
  }

  // 1) 총괄 관리자가 올려둔 최신 양식 가져오기
  const { data: templateRow, error: templateError } = await supabaseAdmin
    .from('report_templates')
    .select('storage_path')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (templateError) {
    return NextResponse.json({ error: '양식 조회 실패: ' + templateError.message }, { status: 500 })
  }
  if (!templateRow) {
    return NextResponse.json(
      { error: '총괄 관리자가 아직 서포트리스트 양식을 업로드하지 않았어요.' },
      { status: 404 }
    )
  }

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(templateRow.storage_path)
  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { error: '양식 파일을 불러오지 못했어요: ' + (downloadError?.message ?? '') },
      { status: 500 }
    )
  }

  // 2) 본인 프로필(AI4에 들어갈 이름)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .single()
  const personName = displayName(profile, '이름 미설정')

  // 3) 정산 기간(전월 16일 ~ 당월 15일) — 대시보드/리포트 화면과 같은 규칙(lib/dates.ts)
  const monthStart = dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
  const { start: periodStart, end: periodEnd } = getSettlementPeriod(monthStart)

  // 4) 기간 내 근무 기록(안건 단위) 조회
  const { data: matterRows, error: matterError } = await supabaseAdmin
    .from('work_log_matters')
    .select(
      'category, hours, matter_place, matter_division, matter_content, matter_cost_code, work_logs!inner(date, user_id)'
    )
    .eq('work_logs.user_id', user.id)
    .gte('work_logs.date', periodStart)
    .lte('work_logs.date', periodEnd)

  if (matterError) {
    return NextResponse.json({ error: '근무 기록 조회 실패: ' + matterError.message }, { status: 500 })
  }

  // 5) 날짜 → 열 매핑. F열이 정산 기간 첫날(전월 16일)이고, 이후 하루씩 오른쪽으로 이동한다.
  const dateColumn = new Map<string, number>()
  let cursor = dayjs(periodStart)
  const periodEndDay = dayjs(periodEnd)
  let offset = 0
  while (cursor.isBefore(periodEndDay) || cursor.isSame(periodEndDay, 'day')) {
    dateColumn.set(cursor.format('YYYY-MM-DD'), DATE_START_COL + offset)
    cursor = cursor.add(1, 'day')
    offset += 1
  }
  if (offset > 31) {
    return NextResponse.json(
      { error: '정산 기간이 양식이 지원하는 범위(31일)를 넘었어요.' },
      { status: 500 }
    )
  }

  // 6) 카테고리(수주/자사업무/타부서업무/영업지원)와 청구안건을 분리해서 날짜별로 합산
  const categoryTotals = new Map<number, Map<string, number>>() // rowNumber -> date -> hours
  const matterTotals = new Map<string, Map<string, number>>() // matterKey -> date -> hours
  const matterMeta = new Map<string, MatterMeta>()
  const matterOrder: string[] = []

  ;(matterRows || []).forEach((row: any) => {
    const date: string = row.work_logs?.date
    const hours = Number(row.hours) || 0
    if (!date || hours <= 0) return

    if (row.category === '청구안건') {
      const meta: MatterMeta = {
        place: row.matter_place ?? '',
        division: row.matter_division ?? '',
        content: row.matter_content ?? '',
        costCode: row.matter_cost_code ?? '',
      }
      const key = matterKey(meta)
      if (!matterTotals.has(key)) {
        matterTotals.set(key, new Map())
        matterMeta.set(key, meta)
        matterOrder.push(key)
      }
      const byDate = matterTotals.get(key)!
      byDate.set(date, round2((byDate.get(date) || 0) + hours))
    } else {
      const categoryRow = CATEGORY_ROW[row.category]
      if (!categoryRow) return
      if (!categoryTotals.has(categoryRow)) categoryTotals.set(categoryRow, new Map())
      const byDate = categoryTotals.get(categoryRow)!
      byDate.set(date, round2((byDate.get(date) || 0) + hours))
    }
  })

  const maxMatterRows = MATTER_END_ROW - MATTER_START_ROW + 1
  if (matterOrder.length > maxMatterRows) {
    return NextResponse.json(
      {
        error: `이 기간의 청구 안건이 ${matterOrder.length}건이라 양식이 지원하는 최대치(${maxMatterRows}건)를 넘었어요.`,
      },
      { status: 500 }
    )
  }

  // 7) 양식 zip을 열어 필요한 셀만 XML 텍스트 수준에서 고친다 (exceljs로 통째로 읽고
  //    다시 쓰면 명명된 범위/외부 참조 대부분이 유실돼 "복구" 경고가 뜨기 때문).
  const arrayBuffer = await fileBlob.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)

  const workbookPath = 'xl/workbook.xml'
  const workbookFile = zip.file(workbookPath)
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relsFile) {
    return NextResponse.json({ error: '양식 파일 구조를 읽지 못했어요.' }, { status: 500 })
  }
  let workbookXml = await workbookFile.async('string')
  const relsXml = await relsFile.async('string')

  const sheetTagMatch = workbookXml.match(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/)
  if (!sheetTagMatch) {
    return NextResponse.json({ error: '양식 파일에 시트가 없어요.' }, { status: 500 })
  }
  const originalSheetName = sheetTagMatch[1]
  const rId = sheetTagMatch[2]
  const relMatch = relsXml.match(new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`))
  if (!relMatch) {
    return NextResponse.json({ error: '양식 파일의 시트 경로를 찾지 못했어요.' }, { status: 500 })
  }
  const sheetPath = `xl/${relMatch[1].replace(/^\/?/, '')}`
  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) {
    return NextResponse.json({ error: '양식 파일의 시트를 읽지 못했어요.' }, { status: 500 })
  }
  let sheetXml = await sheetFile.async('string')

  // AL열의 금액 수식은 양식의 E53 단가와 BS열의 보정액을 사용한다. 수식 자체는 남겨 두되,
  // 서버에서 같은 규칙으로 캐시값을 계산해 둔다.
  const hourlyRate = getCellCachedNumber(sheetXml, 'E53')

  // 시트 탭 이름을 정산 기간으로 바꾸고, 그 이름을 그대로 참조하는 인쇄 영역 등도 함께 갱신한다.
  const prevMonth = month === 1 ? 12 : month - 1
  const newSheetName = `${prevMonth}月16日~${month}月15日`
  workbookXml = workbookXml.replace(
    `<sheet name="${originalSheetName}"`,
    `<sheet name="${newSheetName}"`
  )
  const oldQuoted = `'${originalSheetName}'`
  const newQuoted = `'${newSheetName.replace(/'/g, "''")}'`
  workbookXml = workbookXml.split(oldQuoted).join(newQuoted)

  sheetXml = setCellNumber(sheetXml, 'F2', year)
  sheetXml = setCellNumber(sheetXml, 'I2', month)
  sheetXml = setCellNumber(sheetXml, 'AI2', excelSerial(dayjs().format('YYYY-MM-DD')))
  sheetXml = setCellString(sheetXml, 'AI4', personName)

  // 6행(날짜)·7행(요일) 수식의 캐시값을 우리가 직접 계산해 넣는다. 그래야 다운로드한 파일이
  // "보호된 보기"로 열려 자동 재계산이 되지 않은 상태에서도 처음부터 올바르게 보인다.
  dateColumn.forEach((col, date) => {
    const dateRef = colLetter(col) + DATE_ROW
    const weekdayRef = colLetter(col) + WEEKDAY_ROW
    sheetXml = setFormulaCachedValue(sheetXml, dateRef, excelSerial(date))
    sheetXml = setFormulaCachedValue(sheetXml, weekdayRef, excelWeekday(date))
  })

  // 8행~11행: 수주/자사업무/타부서업무/영업지원 — 날짜별 합계 시간
  categoryTotals.forEach((byDate, rowNumber) => {
    let totalHours = 0
    byDate.forEach((hours, date) => {
      const col = dateColumn.get(date)
      if (!col) return
      sheetXml = setCellNumber(sheetXml, colLetter(col) + rowNumber, hours)
      totalHours = round2(totalHours + hours)
    })
    sheetXml = setFormulaCachedValue(sheetXml, `AK${rowNumber}`, totalHours)
    sheetXml = setFormulaCachedValue(
      sheetXml,
      `AL${rowNumber}`,
      round2(hourlyRate * totalHours + getCellCachedNumber(sheetXml, `BS${rowNumber}`))
    )
  })

  // 14행~: 청구안건 — 안건(장소/구분/내용/코스트코드)마다 한 행, 날짜별 합계 시간 (13행은 비워둠)
  let matterTotalHours = 0
  let matterTotalAmount = 0
  matterOrder.forEach((key, index) => {
    const rowNumber = MATTER_START_ROW + index
    const meta = matterMeta.get(key)!
    sheetXml = setCellString(sheetXml, `B${rowNumber}`, meta.place)
    sheetXml = setCellString(sheetXml, `C${rowNumber}`, meta.division)
    sheetXml = setCellString(sheetXml, `D${rowNumber}`, meta.content)
    sheetXml = setCellString(sheetXml, `E${rowNumber}`, meta.costCode)

    const byDate = matterTotals.get(key)!
    let totalHours = 0
    byDate.forEach((hours, date) => {
      const col = dateColumn.get(date)
      if (!col) return
      sheetXml = setCellNumber(sheetXml, colLetter(col) + rowNumber, hours)
      totalHours = round2(totalHours + hours)
    })

    sheetXml = setFormulaCachedValue(sheetXml, `AK${rowNumber}`, totalHours)
    matterTotalHours = round2(matterTotalHours + totalHours)

    // AL 수식과 동일하게 장소/구분/내용이 비어 있으면 "입력洩れ"를 표시하고, 합계에는 포함하지 않는다.
    if (!meta.place || !meta.division || !meta.content) {
      sheetXml = setFormulaCachedString(sheetXml, `AL${rowNumber}`, '入力洩れ')
    } else {
      const amount = round2(hourlyRate * totalHours + getCellCachedNumber(sheetXml, `BS${rowNumber}`))
      sheetXml = setFormulaCachedValue(sheetXml, `AL${rowNumber}`, amount)
      matterTotalAmount = round2(matterTotalAmount + amount)
    }
  })

  // 44행은 청구안건 합계다. 수식은 보존하면서 캐시값도 채워서 "편집 사용"을 누르지 않아도
  // AK/AL의 합계 시간이 즉시 표시되게 한다.
  sheetXml =
    matterTotalHours === 0
      ? setFormulaCachedString(sheetXml, 'AK44', '')
      : setFormulaCachedValue(sheetXml, 'AK44', matterTotalHours)
  sheetXml =
    matterTotalAmount === 0
      ? setFormulaCachedString(sheetXml, 'AL44', '')
      : setFormulaCachedValue(sheetXml, 'AL44', matterTotalAmount)

  workbookXml = enableWorkbookRecalculation(workbookXml)

  zip.file(workbookPath, workbookXml)
  zip.file(sheetPath, sheetXml)

  const outBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const yy = String(year).slice(-2)
  const mm = String(month).padStart(2, '0')
  const nameSlug = (profile?.name || profile?.email || 'report').replace(/\s+/g, '')
  const filename = `TRENGKR_${yy}年_${mm}月_SUPPORT_LIST_${nameSlug}.xlsx`

  return new NextResponse(outBuffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(
        filename
      )}`,
    },
  })
}
