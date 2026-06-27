import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://work-tracker-ebon.vercel.app'

const TYPE_LABEL: Record<string, string> = {
  vacation: '휴가',
  remote: '원격근무',
  holiday: '휴일근무',
}

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  vacation:  { bg: '#fef3c7', text: '#d97706' },
  remote:    { bg: '#ede9fe', text: '#7c3aed' },
  holiday:   { bg: '#fee2e2', text: '#dc2626' },
}

const VACATION_TYPE_LABEL: Record<string, string> = {
  annual: '연차',
  morning: '오전반차',
  afternoon: '오후반차',
  special: '특휴/대휴',
}

function formatDateEntries(type: string, dateEntries: { date: string; vacationType?: string }[]): string {
  return dateEntries.map((e) => {
    const date = new Date(e.date)
    const formatted = `${date.getMonth() + 1}월 ${date.getDate()}일`
    if (type === 'vacation' && e.vacationType) {
      return `${formatted} (${VACATION_TYPE_LABEL[e.vacationType] ?? e.vacationType})`
    }
    return formatted
  }).join('\n')
}

function buildRequestEmailHtml({ requesterName, approverName, type, dateEntries, memo }: {
  requesterName: string
  approverName: string
  type: string
  dateEntries: { date: string; vacationType?: string }[]
  memo?: string
}): string {
  const typeLabel = TYPE_LABEL[type] ?? type
  const typeColor = TYPE_COLOR[type] ?? { bg: '#f3f4f6', text: '#374151' }
  const memoLabel = type === 'holiday' ? '출근 사유' : '사유'
  const dateRows = formatDateEntries(type, dateEntries)
    .split('\n')
    .map((d) => `<li style="margin:4px 0;color:#374151;">${d}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:#3b82f6;padding:28px 32px;">
          <p style="margin:0;color:#dbeafe;font-size:13px;">근무관리 시스템</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">결재 요청이 도착했어요</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
            <strong style="color:#111827;">${approverName}</strong>님, <strong style="color:#111827;">${requesterName}</strong>님이 결재를 요청했어요.
          </p>
          <table width="100%" style="background:#f9fafb;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;width:80px;color:#9ca3af;font-size:13px;">유형</td>
                <td style="padding:6px 0;">
                  <span style="background:${typeColor.bg};color:${typeColor.text};padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;">${typeLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;vertical-align:top;color:#9ca3af;font-size:13px;">날짜</td>
                <td style="padding:6px 0;"><ul style="margin:0;padding-left:16px;">${dateRows}</ul></td>
              </tr>
              ${memo ? `<tr><td style="padding:6px 0;color:#9ca3af;font-size:13px;">${memoLabel}</td><td style="padding:6px 0;color:#374151;font-size:14px;">${memo}</td></tr>` : ''}
            </table>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${APP_URL}/approval" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">결재하러 가기 →</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">근무관리 시스템 · 이 메일은 자동 발송되었습니다</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildApprovedEmailHtml({ requesterName, approverName, type, dateEntries, memo, status, actionAt }: {
  requesterName: string
  approverName: string
  type: string
  dateEntries: { date: string; vacationType?: string }[]
  memo?: string
  status: 'approved' | 'rejected'
  actionAt: string
}): string {
  const typeLabel = TYPE_LABEL[type] ?? type
  const typeColor = TYPE_COLOR[type] ?? { bg: '#f3f4f6', text: '#374151' }
  const memoLabel = type === 'holiday' ? '출근 사유' : '사유'
  const isApproved = status === 'approved'
  const statusText = isApproved ? '승인' : '반려'
  const statusColor = isApproved ? '#10b981' : '#ef4444'
  const statusBg = isApproved ? '#d1fae5' : '#fee2e2'
  const headerBg = isApproved ? '#10b981' : '#ef4444'
  const dateRows = formatDateEntries(type, dateEntries)
    .split('\n')
    .map((d) => `<li style="margin:4px 0;color:#374151;">${d}</li>`)
    .join('')

  const date = new Date(actionAt)
  const actionDateStr = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:${headerBg};padding:28px 32px;">
          <p style="margin:0;color:#ffffff;opacity:0.8;font-size:13px;">근무관리 시스템</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">결재가 ${statusText}됐어요</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
            <strong style="color:#111827;">${requesterName}</strong>님, 결재 요청이 <strong style="color:${statusColor};">${statusText}</strong>됐어요.
          </p>
          <table width="100%" style="background:#f9fafb;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;width:90px;color:#9ca3af;font-size:13px;">유형</td>
                <td style="padding:6px 0;">
                  <span style="background:${typeColor.bg};color:${typeColor.text};padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;">${typeLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;vertical-align:top;color:#9ca3af;font-size:13px;">날짜</td>
                <td style="padding:6px 0;"><ul style="margin:0;padding-left:16px;font-size:13px;color:#374151;">${dateRows}</ul></td>
              </tr>
              ${memo ? `<tr><td style="padding:6px 0;color:#9ca3af;font-size:13px;">${memoLabel}</td><td style="padding:6px 0;color:#374151;font-size:13px;">${memo}</td></tr>` : ''}
              <tr><td colspan="2" style="padding:12px 0 4px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;">처리 상태</td>
                <td style="padding:6px 0;">
                  <span style="background:${statusBg};color:${statusColor};padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;">${statusText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;">처리일시</td>
                <td style="padding:6px 0;color:#374151;font-size:13px;">${actionDateStr}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;">결재권자</td>
                <td style="padding:6px 0;color:#374151;font-size:13px;">${approverName}</td>
              </tr>
            </table>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${APP_URL}/approval" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">결재 내역 확인 →</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">근무관리 시스템 · 이 메일은 자동 발송되었습니다</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { emailType = 'request', approverEmail, approverName, requesterName, requesterEmail, type, dateEntries, memo, ccEmails, status, actionAt } = body

    if (!type || !dateEntries?.length) {
      return NextResponse.json({ error: '필수 파라미터가 누락됐어요.' }, { status: 400 })
    }

    const typeLabel = TYPE_LABEL[type] ?? type
    const firstDate = dateEntries[0]?.date
      ? (() => { const d = new Date(dateEntries[0].date); return `${d.getMonth() + 1}월 ${d.getDate()}일` })()
      : ''
    const subjectSuffix = dateEntries.length > 1 ? ` 외 ${dateEntries.length - 1}일` : ''

    if (emailType === 'request') {
      if (!approverEmail) return NextResponse.json({ error: 'approverEmail 누락' }, { status: 400 })

      const { error } = await resend.emails.send({
        from: '근무관리 결재요청 <noreply@tekor.co.kr>',
        to: [approverEmail],
        cc: ccEmails?.length ? ccEmails : undefined,
        subject: `[결재 요청] ${requesterName}님의 ${typeLabel} — ${firstDate}${subjectSuffix}`,
        html: buildRequestEmailHtml({ requesterName, approverName, type, dateEntries, memo }),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    } else if (emailType === 'result') {
      if (!requesterEmail) return NextResponse.json({ error: 'requesterEmail 누락' }, { status: 400 })

      const statusText = status === 'approved' ? '승인' : '반려'
      const { error } = await resend.emails.send({
        from: '근무관리 결재요청 <noreply@tekor.co.kr>',
        to: [requesterEmail],
        cc: ccEmails?.length ? ccEmails : undefined,
        subject: `[결재 ${statusText}] ${requesterName}님의 ${typeLabel} — ${firstDate}${subjectSuffix}`,
        html: buildApprovedEmailHtml({ requesterName, approverName, type, dateEntries, memo, status, actionAt }),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('notify-approval error:', err)
    return NextResponse.json({ error: '서버 오류가 발생했어요.' }, { status: 500 })
  }
}
