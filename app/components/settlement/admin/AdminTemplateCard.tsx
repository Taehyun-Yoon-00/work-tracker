'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import Button from '../../ui/Button'

interface TemplateInfo {
  filename: string
  uploadedAt: string
  uploadedBy: string
}

/** 국내 출장 양식(.xlsx) 업로드. 서포트리스트/근무관리표와 같은 report_templates를 kind='domestic_trip'으로 쓴다. */
export default function AdminTemplateCard() {
  const [info, setInfo] = useState<TemplateInfo | null | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchInfo = useCallback(async () => {
    const res = await fetch('/api/admin/report-template?kind=domestic_trip')
    const data = await res.json().catch(() => ({}))
    if (res.ok) setInfo(data.template ?? null)
    else setMessage({ ok: false, text: data.error || '양식 정보를 불러오지 못했어요.' })
  }, [])

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  const upload = async (file: File) => {
    setUploading(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', 'domestic_trip')
    try {
      const res = await fetch('/api/admin/report-template', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setMessage({ ok: false, text: data.error || '업로드에 실패했어요.' })
      } else {
        setMessage({ ok: true, text: '국내 출장 양식이 업로드됐어요.' })
        fetchInfo()
      }
    } catch {
      setMessage({ ok: false, text: '네트워크 오류로 업로드하지 못했어요.' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-3">
      <div>
        <h2 className="font-semibold dark:text-white">국내 출장 양식</h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
          엑셀 출력에 쓰는 양식 파일이에요. 새로 올리면 그 다음 출력부터 새 양식이 쓰여요.
        </p>
      </div>

      <div className="rounded-lg bg-gray-50 dark:bg-zinc-900/40 border border-gray-200 dark:border-zinc-700 p-3 text-sm">
        {info === undefined ? (
          <span className="text-gray-400">불러오는 중...</span>
        ) : info ? (
          <>
            <p className="font-medium dark:text-zinc-200 break-all">{info.filename}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              {dayjs(info.uploadedAt).format('YYYY.MM.DD HH:mm')} · {info.uploadedBy}
            </p>
          </>
        ) : (
          <span className="text-orange-500">아직 업로드된 양식이 없어요. 업로드 전에는 엑셀 출력을 할 수 없어요.</span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload(file)
        }}
      />
      <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? '업로드 중...' : '새 양식 업로드 (.xlsx)'}
      </Button>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-blue-500' : 'text-red-500'}`}>{message.text}</p>
      )}

      <ul className="text-[11px] text-gray-400 dark:text-zinc-500 space-y-0.5 list-disc pl-4">
        <li>
          .xls 양식은 Excel에서 &lsquo;다른 이름으로 저장 → Excel 통합 문서(.xlsx)&rsquo;로 저장한 뒤 올려
          주세요.
        </li>
        <li>
          시트가 3개(출장여비 / 교통비 / 운전주보)이고, 입력 칸의 위치가 기존 양식과 같아야 해요.
          칸 위치가 바뀐 새 양식은 개발 쪽 수정이 필요해요.
        </li>
        <li>숙박비·일당 금액은 양식의 수식이 아니라 아래 단가표 값으로 채워져요.</li>
      </ul>
    </section>
  )
}
