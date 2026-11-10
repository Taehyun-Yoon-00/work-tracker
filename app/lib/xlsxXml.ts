import dayjs from 'dayjs'

// 엑셀(xlsx)은 zip 속 XML이다. 이 양식 파일들은 명명된 범위·외부 참조·양식 컨트롤이 많이 들어 있어
// exceljs로 통째로 읽고 다시 쓰면 손상 경고가 뜨므로, 필요한 셀만 XML 텍스트 수준에서 고친다.
// 서포트리스트/근무관리표 출력 라우트가 함께 쓰는 헬퍼.

export function colLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function findCell(xml: string, ref: string): RegExpMatchArray | null {
  const regex = new RegExp(`<c r="${ref}"([^>]*?)(/>|>([\\s\\S]*?)</c>)`)
  return xml.match(regex)
}

/** 셀을 고정 숫자값으로 덮어쓴다(있던 수식이나 문자열 타입은 사라진다). 템플릿에 그 셀이
 * 아예 없으면(희소 셀) 건드리지 않고 그대로 둔다 — 이 양식은 우리가 쓰는 모든 셀이 빈 셀로라도
 * 미리 존재하므로 실제로는 항상 값이 채워진다. */
export function setCellNumber(xml: string, ref: string, value: number): string {
  const m = findCell(xml, ref)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  const replacement = `<c r="${ref}"${attrs}><v>${value}</v></c>`
  return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length)
}

/** 셀을 문자열(inline string)로 덮어쓴다. */
export function setCellString(xml: string, ref: string, text: string): string {
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
export function setFormulaCachedValue(xml: string, ref: string, cachedValue: number): string {
  const regex = new RegExp(`<c r="${ref}"([^>]*?)(?<!/)>([\\s\\S]*?)</c>`)
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
export function setFormulaCachedString(xml: string, ref: string, cachedValue: string): string {
  const regex = new RegExp(`<c r="${ref}"([^>]*?)(?<!/)>([\\s\\S]*?)</c>`)
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
export function getCellCachedNumber(xml: string, ref: string): number {
  const m = findCell(xml, ref)
  if (!m) return 0
  const value = m[0].match(/<v>([\s\S]*?)<\/v>/)?.[1]
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

/** Excel이 계산을 허용하는 환경에서는 수식도 다시 계산하도록 지시한다. 보호된 보기처럼
 * 재계산이 보류되는 환경에서도 위의 캐시값이 즉시 표시되므로 두 경우 모두 처리된다. */
export function enableWorkbookRecalculation(xml: string): string {
  const calcPr = '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" calcId="0"/>'
  if (/<calcPr\b/.test(xml)) {
    return xml.replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/, calcPr)
  }
  return xml.replace('</workbook>', `${calcPr}</workbook>`)
}

/**
 * 'YYYY-MM-DD' → 엑셀 날짜 일련번호.
 * dayjs().diff()는 로컬 자정끼리 ms 차이를 구하므로, 1899년과 현재의 UTC 오프셋이 다른 시간대
 * (예: Asia/Seoul — 과거 표준시가 +8:27:52)에서는 일수가 하루 작게 나온다.
 * 그 결과 보호된 보기에서 캐시된 날짜가 하루 어긋나 보이다가 [편집 사용]으로 재계산되면 맞아졌다.
 * 달력 날짜(년/월/일)만 뽑아 UTC로 계산하면 서버 시간대와 무관하다.
 */
export function excelSerial(dateStr: string): number {
  const d = dayjs(dateStr)
  return Math.round((Date.UTC(d.year(), d.month(), d.date()) - Date.UTC(1899, 11, 30)) / 86400000)
}
export function excelWeekday(dateStr: string): number {
  return dayjs(dateStr).day() + 1 // 일요일=1 ... 토요일=7 (WEEKDAY 기본값)
}

/** 셀의 값/수식을 비우되 서식(s)은 남긴다. 템플릿에 예전 입력값이 남아 있어도 이번 출력에 섞이지 않게 한다. */
export function clearCell(xml: string, ref: string): string {
  const m = findCell(xml, ref)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  return xml.slice(0, m.index) + `<c r="${ref}"${attrs}/>` + xml.slice(m.index + m[0].length)
}

/** 셀 서식 번호(s)만 바꾼다. 값/수식은 그대로. */
export function setCellStyle(xml: string, ref: string, styleId: number): string {
  const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)(/?)>`))
  if (!m || m.index === undefined) return xml
  const attrs = /\ss="\d+"/.test(m[1])
    ? m[1].replace(/\ss="\d+"/, ` s="${styleId}"`)
    : `${m[1]} s="${styleId}"`
  return xml.slice(0, m.index) + `<c r="${ref}"${attrs}${m[2]}>` + xml.slice(m.index + m[0].length)
}

/** 셀의 현재 서식 번호(s). 없으면 0. */
export function getCellStyle(xml: string, ref: string): number {
  const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)/?>`))
  const sMatch = m?.[1].match(/\ss="(\d+)"/)
  return sMatch ? Number(sMatch[1]) : 0
}

export function hasCell(xml: string, ref: string): boolean {
  return findCell(xml, ref) !== null
}

/** 수식 문자열과 캐시된 결과값을 함께 바꾼다. (달마다 수식 상수를 바꿔야 하는 셀용 — 예: L3) */
export function setFormulaWithCache(xml: string, ref: string, formula: string, value: number): string {
  const m = findCell(xml, ref)
  if (!m || m.index === undefined) return xml
  const attrs = m[1].replace(/\st="[^"]*"/, '')
  return (
    xml.slice(0, m.index) +
    `<c r="${ref}"${attrs}><f>${escapeXml(formula)}</f><v>${value}</v></c>` +
    xml.slice(m.index + m[0].length)
  )
}

/**
 * calcChain.xml에서 지정한 시트의 특정 셀 항목만 뺀다.
 * 수식이던 셀을 값으로 바꾸면 calcChain이 "수식 없는 셀"을 가리켜 Excel이 복구 경고를 띄우므로,
 * calcChain 자체는 남기고 해당 항목만 정리한다.
 * - i(시트 id)가 생략된 항목은 앞 항목을 따르므로, 지우는 항목이 가진 i를 다음 항목에 넘겨 준다.
 * - l(새 의존 수준) 표시도 다음 항목으로 넘겨 의존 순서 힌트를 유지한다.
 */
export function removeCalcChainEntries(xml: string, sheetId: string, refs: Set<string>): string {
  const open = xml.match(/^[\s\S]*?<calcChain\b[^>]*>/)
  const close = xml.lastIndexOf('</calcChain>')
  if (!open || close < 0) return xml
  const body = xml.slice(open[0].length, close)
  const entries = body.match(/<c\b[^>]*\/>/g)
  if (!entries) return xml

  let currentSheet = ''
  let carryLevel = false
  const kept: string[] = []
  let lastSheet = ''
  for (const entry of entries) {
    const r = entry.match(/\br="([^"]+)"/)?.[1] ?? ''
    const i = entry.match(/\bi="([^"]+)"/)?.[1]
    if (i) currentSheet = i
    const hasLevel = /\bl="1"/.test(entry)

    if (currentSheet === sheetId && refs.has(r)) {
      if (hasLevel) carryLevel = true
      continue
    }
    const level = hasLevel || carryLevel
    carryLevel = false
    // 다시 쓸 때는 i를 항상 명시한다(생략 규칙에 기대지 않는 편이 안전).
    kept.push(`<c r="${r}" i="${currentSheet}"${level ? ' l="1"' : ''}/>`)
    lastSheet = currentSheet
  }
  void lastSheet
  return open[0] + kept.join('') + xml.slice(close)
}
