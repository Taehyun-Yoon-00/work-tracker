import JSZip from 'jszip'
import { escapeXml } from '../xlsxXml'

// 워크시트 XML을 셀 단위로 고치는 작은 편집기.
//
// 기존 서포트리스트/근무관리표 출력과 같은 이유로 exceljs 대신 XML을 직접 고친다(양식의 명명된 범위·
// 컨트롤이 손상되지 않게). 다만 xlsxXml.ts의 헬퍼는 "양식에 그 셀이 이미 있어야" 동작하고, 공유 수식·
// calcChain을 다루지 않는다. 국내 출장 양식은 값을 넣을 칸이 많고 수식을 값으로 바꾸는 칸도 있어서
// 아래 세 가지를 보강했다.
//
//  1) 공유 수식 펼치기: Excel은 같은 모양의 수식을 <f t="shared" si="N">으로 묶어 첫 셀에만 본문을 둔다.
//     그 셀을 값으로 바꾸면 나머지 셀이 본문을 잃어 파일이 손상되므로, 먼저 모두 개별 수식으로 펼친다.
//  2) 없는 셀/행 만들기: 서식이 없는 빈 칸은 XML에 아예 없을 수 있다.
//  3) calcChain 제거: 수식을 값으로 바꾸면 calcChain이 "수식 없는 셀"을 가리켜 Excel이 복구 경고를 띄운다.
//     calcChain은 Excel이 열 때 다시 만드는 캐시라 통째로 지워도 안전하다.

export function colToNum(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

export function numToCol(num: number): string {
  let s = ''
  let n = num
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function splitRef(ref: string): { col: number; row: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/)
  if (!m) throw new Error(`잘못된 셀 주소: ${ref}`)
  return { col: colToNum(m[1]), row: Number(m[2]) }
}

/**
 * 수식 본문의 상대 참조를 (dRow, dCol)만큼 옮긴다 (공유 수식의 첫 셀 → 다른 셀).
 * 문자열 리터럴("…")과 시트 이름('…')은 건드리지 않고, $로 고정된 행/열은 그대로 둔다.
 */
export function translateFormula(text: string, dRow: number, dCol: number): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      // 따옴표 구간은 통째로 복사한다 (""는 이스케이프된 따옴표)
      let j = i + 1
      while (j < text.length) {
        if (text[j] === ch) {
          if (text[j + 1] === ch) j += 2
          else break
        } else j += 1
      }
      out += text.slice(i, j + 1)
      i = j + 1
      continue
    }
    const prev = i > 0 ? text[i - 1] : ''
    if (!/[A-Za-z0-9_.]/.test(prev)) {
      const m = text.slice(i).match(/^(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/)
      if (m) {
        const col = m[1] ? m[2] : numToCol(colToNum(m[2]) + dCol)
        const row = m[3] ? m[4] : String(Number(m[4]) + dRow)
        out += `${m[1]}${col}${m[3]}${row}`
        i += m[0].length
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

interface Cell {
  col: number
  /** r, t를 뺀 나머지 속성 (s, cm, vm …) — 앞에 공백 포함 */
  rest: string
  t: string | null
  /** 셀 안쪽 XML (<f>…</f><v>…</v> 등) */
  inner: string
}

interface Row {
  num: number
  attrs: string
  cells: Map<number, Cell>
  /** 원래 XML — 고치지 않은 행은 그대로 다시 쓴다 */
  raw: string | null
}

const FORMULA_RE = /<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/

export class SheetEditor {
  private head = ''
  private tail = ''
  private rows = new Map<number, Row>()

  constructor(xml: string) {
    const open = xml.indexOf('<sheetData')
    if (open < 0) throw new Error('sheetData를 찾지 못했어요.')
    const selfClosing = /<sheetData\s*\/>/.exec(xml)
    let bodyStart: number
    let bodyEnd: number
    if (selfClosing && selfClosing.index === open) {
      this.head = xml.slice(0, open) + '<sheetData>'
      this.tail = '</sheetData>' + xml.slice(open + selfClosing[0].length)
      bodyStart = bodyEnd = 0
      this.parseRows('')
      return
    }
    bodyStart = xml.indexOf('>', open) + 1
    bodyEnd = xml.indexOf('</sheetData>')
    this.head = xml.slice(0, bodyStart)
    this.tail = xml.slice(bodyEnd)
    this.parseRows(xml.slice(bodyStart, bodyEnd))
    this.expandSharedFormulas()
  }

  private parseRows(body: string) {
    for (const m of body.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const attrs = m[1]
      const num = Number(attrs.match(/\br="(\d+)"/)?.[1])
      const cells = new Map<number, Cell>()
      for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const cAttrs = c[1]
        const ref = cAttrs.match(/\br="([A-Z]+)\d+"/)
        if (!ref) continue
        const t = cAttrs.match(/\bt="([^"]*)"/)?.[1] ?? null
        const rest = cAttrs.replace(/\sr="[^"]*"/, '').replace(/\st="[^"]*"/, '')
        cells.set(colToNum(ref[1]), { col: colToNum(ref[1]), rest, t, inner: c[2] ?? '' })
      }
      this.rows.set(num, { num, attrs, cells, raw: m[0] })
    }
  }

  /** <f t="shared">를 모두 개별 수식으로 바꾼다. */
  private expandSharedFormulas() {
    const masters = new Map<string, { text: string; row: number; col: number }>()
    const sortedRows = [...this.rows.values()].sort((a, b) => a.num - b.num)
    for (const row of sortedRows) {
      for (const cell of [...row.cells.values()].sort((a, b) => a.col - b.col)) {
        const f = cell.inner.match(FORMULA_RE)?.[0]
        if (!f || !/\bt="shared"/.test(f)) continue
        const si = f.match(/\bsi="(\d+)"/)?.[1]
        if (si === undefined) continue
        const text = f.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1]
        if (text !== undefined && text !== '') masters.set(si, { text, row: row.num, col: cell.col })
      }
    }
    if (masters.size === 0) return
    for (const row of sortedRows) {
      for (const cell of row.cells.values()) {
        const f = cell.inner.match(FORMULA_RE)?.[0]
        if (!f || !/\bt="shared"/.test(f)) continue
        const si = f.match(/\bsi="(\d+)"/)?.[1]
        const master = si === undefined ? undefined : masters.get(si)
        if (!master) continue
        const text =
          master.row === row.num && master.col === cell.col
            ? master.text
            : translateFormula(master.text, row.num - master.row, cell.col - master.col)
        cell.inner = cell.inner.replace(FORMULA_RE, `<f>${text}</f>`)
        row.raw = null
      }
    }
  }

  private getRow(num: number, create: boolean): Row | undefined {
    let row = this.rows.get(num)
    if (!row && create) {
      row = { num, attrs: ` r="${num}"`, cells: new Map(), raw: null }
      this.rows.set(num, row)
    }
    return row
  }

  private getCell(ref: string, create: boolean): Cell | undefined {
    const { col, row: rowNum } = splitRef(ref)
    const row = this.getRow(rowNum, create)
    if (!row) return undefined
    let cell = row.cells.get(col)
    if (!cell && create) {
      cell = { col, rest: '', t: null, inner: '' }
      row.cells.set(col, cell)
    }
    if (cell) row.raw = null // 고칠 수 있으니 다시 쓰도록 표시
    return cell
  }

  /** 셀이 XML에 있는지 (읽기만) */
  has(ref: string): boolean {
    const { col, row } = splitRef(ref)
    return this.rows.get(row)?.cells.has(col) ?? false
  }

  hasFormula(ref: string): boolean {
    const { col, row } = splitRef(ref)
    const cell = this.rows.get(row)?.cells.get(col)
    return !!cell && FORMULA_RE.test(cell.inner)
  }

  setNumber(ref: string, value: number) {
    const cell = this.getCell(ref, true)!
    cell.t = null
    cell.inner = `<v>${value}</v>`
  }

  setString(ref: string, text: string) {
    const cell = this.getCell(ref, true)!
    // XML에서 허용되지 않는 제어문자는 뺀다
    const safe = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    cell.t = 'inlineStr'
    cell.inner = `<is><t xml:space="preserve">${escapeXml(safe)}</t></is>`
  }

  /** 값/수식을 비우되 서식은 남긴다. 셀이 없으면 아무것도 하지 않는다. */
  clear(ref: string) {
    const cell = this.getCell(ref, false)
    if (!cell) return
    cell.t = null
    cell.inner = ''
  }

  /**
   * 수식은 그대로 두고 캐시된 결과값만 바꾼다. 수식이 없는 셀이면 그냥 값을 쓴다.
   * 보호된 보기에서는 Excel이 재계산하지 않으므로 캐시가 맞아야 값이 바로 보인다.
   */
  setFormulaResult(ref: string, value: number | string) {
    const cell = this.getCell(ref, true)!
    const f = cell.inner.match(FORMULA_RE)?.[0] ?? ''
    if (typeof value === 'number') {
      cell.t = null
      cell.inner = `${f}<v>${value}</v>`
    } else {
      cell.t = 'str'
      cell.inner = `${f}<v>${escapeXml(value)}</v>`
    }
  }

  toXml(): string {
    const body = [...this.rows.values()]
      .sort((a, b) => a.num - b.num)
      .map((row) => {
        if (row.raw !== null) return row.raw
        const cells = [...row.cells.values()].sort((a, b) => a.col - b.col)
        // spans는 최적화 힌트일 뿐이라, 셀을 더했을 수 있는 행에서는 빼는 쪽이 안전하다.
        const attrs = row.attrs.replace(/\sspans="[^"]*"/, '')
        if (cells.length === 0) return `<row${attrs}/>`
        const xml = cells
          .map((c) => {
            const ref = `${numToCol(c.col)}${row.num}`
            const t = c.t ? ` t="${c.t}"` : ''
            return c.inner
              ? `<c r="${ref}"${c.rest}${t}>${c.inner}</c>`
              : `<c r="${ref}"${c.rest}${t}/>`
          })
          .join('')
        return `<row${attrs}>${xml}</row>`
      })
      .join('')
    return this.head + body + this.tail
  }
}

// ---------- 워크북(zip) 단위 ----------

/** 워크북의 시트를 탭 순서대로 [{ name, path }]로 돌려준다. */
export async function listSheets(zip: JSZip): Promise<{ name: string; path: string }[]> {
  const workbook = await zip.file('xl/workbook.xml')?.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!workbook || !rels) return []
  const result: { name: string; path: string }[] = []
  for (const tag of workbook.match(/<sheet\b[^>]*>/g) ?? []) {
    const name = tag.match(/\bname="([^"]*)"/)?.[1] ?? ''
    const rId = tag.match(/\br:id="([^"]+)"/)?.[1]
    if (!rId) continue
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${rId}"[^>]*>`))?.[0]
    const target = rel?.match(/\bTarget="([^"]+)"/)?.[1]
    if (!target) continue
    result.push({ name, path: `xl/${target.replace(/^\/?(xl\/)?/, '')}` })
  }
  return result
}

/** calcChain.xml을 지운다 (Excel이 열 때 다시 만든다). 부품 목록과 관계도 함께 정리한다. */
export async function dropCalcChain(zip: JSZip): Promise<void> {
  if (!zip.file('xl/calcChain.xml')) return
  zip.remove('xl/calcChain.xml')
  const types = zip.file('[Content_Types].xml')
  if (types) {
    const xml = await types.async('string')
    zip.file('[Content_Types].xml', xml.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''))
  }
  const rels = zip.file('xl/_rels/workbook.xml.rels')
  if (rels) {
    const xml = await rels.async('string')
    zip.file(
      'xl/_rels/workbook.xml.rels',
      xml.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/, '')
    )
  }
}
