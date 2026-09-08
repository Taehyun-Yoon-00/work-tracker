import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isMaster, isGeneralAdmin } from '@/app/lib/apiAuth'
import { supabaseAdmin } from '@/app/lib/supabaseAdmin'
import { displayName } from '@/app/lib/labels'

// exceljs/Buffer를 쓰지는 않지만, formidable 없이 req.formData()로 파일을 받으므로
// 엣지 런타임이 아닌 Node.js 런타임이 필요하다.
export const runtime = 'nodejs'

const BUCKET = 'report-templates'

async function canManageTemplate(userId: string) {
  // 총괄 관리자 또는 마스터만 서포트리스트 양식을 업로드할 수 있다.
  return (await isMaster(userId)) || (await isGeneralAdmin(userId))
}

/** 현재 등록된(가장 최근에 업로드된) 서포트리스트 양식 정보를 반환한다. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!(await canManageTemplate(user.id))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('report_templates')
    .select('original_filename, uploaded_at, uploaded_by, profiles(name, email)')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ template: null })
  }

  return NextResponse.json({
    template: {
      filename: data.original_filename,
      uploadedAt: data.uploaded_at,
      uploadedBy: displayName((data as any).profiles),
    },
  })
}

/** 새 서포트리스트 양식을 업로드한다. 기존 양식은 지우지 않고 이력으로 남기되, 조회는 항상 최신본을 쓴다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!(await canManageTemplate(user.id))) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '파일이 필요해요.' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: '.xlsx 파일만 업로드할 수 있어요.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  // Supabase Storage 키는 한글/한자 등 비-ASCII 문자를 허용하지 않으므로
  // 저장용 경로는 안전한 문자로만 구성하고, 원본 파일명은 DB(original_filename)에 보관한다.
  const safeName = file.name
    .replace(/\.xlsx$/i, '')
    .replace(/[^\w.-]/g, '_') // 한글/한자/공백 등은 전부 _ 로 치환
    .slice(0, 80) || 'template'
  const storagePath = `templates/${Date.now()}-${safeName}.xlsx`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { error: insertError } = await supabaseAdmin.from('report_templates').insert({
    storage_path: storagePath,
    original_filename: file.name,
    uploaded_by: user.id,
  })
  if (insertError) {
    return NextResponse.json(
      { error: '업로드는 됐지만 정보 저장에 실패했어요: ' + insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
