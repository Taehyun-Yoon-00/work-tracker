// 청구 안건(장소/구분/내용/코스트코드) 입력 시 자동완성에 쓰이는
// 로컬(브라우저) 저장 히스토리. 서버에는 저장하지 않고 기기별로만 남는다.

export type MatterFields = {
  place: string
  division: string
  content: string
  costCode: string
}

const PRESETS_KEY = 'worklog:matterPresets'
const FIELD_HISTORY_KEY = 'worklog:matterFieldHistory'

const MAX_PRESETS = 5
const MAX_FIELD_HISTORY = 6

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function isEmptyMatter(m: MatterFields) {
  return !m.place && !m.division && !m.content && !m.costCode
}

function sameMatter(a: MatterFields, b: MatterFields) {
  return (
    a.place === b.place &&
    a.division === b.division &&
    a.content === b.content &&
    a.costCode === b.costCode
  )
}

// ── 조합(세트) 단위 최근 사용 안건 ──────────────────────────────
export function getMatterPresets(): MatterFields[] {
  if (typeof window === 'undefined') return []
  return safeParse<MatterFields[]>(localStorage.getItem(PRESETS_KEY), [])
}

export function getLastMatterPreset(): MatterFields | null {
  const presets = getMatterPresets()
  return presets[0] || null
}

function saveMatterPreset(matter: MatterFields) {
  if (typeof window === 'undefined' || isEmptyMatter(matter)) return
  const existing = getMatterPresets().filter((p) => !sameMatter(p, matter))
  const next = [matter, ...existing].slice(0, MAX_PRESETS)
  localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
}

// ── 필드별 자동완성 히스토리 ────────────────────────────────────
type FieldHistory = Record<keyof MatterFields, string[]>

function getFieldHistory(): FieldHistory {
  if (typeof window === 'undefined') {
    return { place: [], division: [], content: [], costCode: [] }
  }
  return safeParse<FieldHistory>(localStorage.getItem(FIELD_HISTORY_KEY), {
    place: [],
    division: [],
    content: [],
    costCode: [],
  })
}

export function getFieldSuggestions(field: keyof MatterFields): string[] {
  return getFieldHistory()[field] || []
}

function saveFieldValues(matter: MatterFields) {
  if (typeof window === 'undefined') return
  const history = getFieldHistory()
  ;(Object.keys(matter) as (keyof MatterFields)[]).forEach((key) => {
    const value = matter[key]?.trim()
    if (!value) return
    const list = history[key] || []
    history[key] = [value, ...list.filter((v) => v !== value)].slice(0, MAX_FIELD_HISTORY)
  })
  localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history))
}

// 저장(work_logs upsert 성공) 시점에 호출: 프리셋 + 필드 히스토리 동시 갱신
export function recordMatterUsage(matter: MatterFields) {
  saveMatterPreset(matter)
  saveFieldValues(matter)
}

// ── 히스토리 삭제 ────────────────────────────────────────────────
// "최근 사용한 안건" 프리셋 중 하나를 로컬 저장소에서 삭제
export function removeMatterPreset(matter: MatterFields): MatterFields[] {
  if (typeof window === 'undefined') return []
  const next = getMatterPresets().filter((p) => !sameMatter(p, matter))
  localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  return next
}

// 필드별 자동완성 히스토리 중 값 하나를 로컬 저장소에서 삭제
export function removeFieldSuggestion(field: keyof MatterFields, value: string): string[] {
  if (typeof window === 'undefined') return []
  const history = getFieldHistory()
  history[field] = (history[field] || []).filter((v) => v !== value)
  localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(history))
  return history[field]
}
