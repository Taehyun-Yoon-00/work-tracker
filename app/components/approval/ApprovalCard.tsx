import dayjs from 'dayjs'
import Badge, { type BadgeTone } from '../ui/Badge'

// 승인 상태는 neutral/info/success/warning/danger 공통 의미 체계를 그대로 쓴다.
function statusLabel(status: string): { text: string; tone: BadgeTone } {
  if (status === 'pending') return { text: '승인 대기중', tone: 'pending' }
  if (status === 'approved') return { text: '승인', tone: 'success' }
  if (status === 'rejected') return { text: '반려', tone: 'danger' }
  if (status === 'cancelled') return { text: '취소됨', tone: 'neutral' }
  return { text: status, tone: 'neutral' }
}

// 신청 타입은 실제로 서로 다른 종류를 구분해야 하므로 기존 색을 그대로 유지한다
// (휴가=orange, 원격=indigo, 휴일=red — 5가지 공통 tone 밖의 예외).
function typeLabel(type: string): { text: string; colorClassName: string } {
  if (type === 'vacation') return { text: '휴가', colorClassName: 'bg-orange-50 text-orange-500' }
  if (type === 'remote') return { text: '원격근무', colorClassName: 'bg-indigo-50 text-indigo-500' }
  if (type === 'holiday') return { text: '휴일근무', colorClassName: 'bg-red-50 text-red-500' }
  return { text: type, colorClassName: 'bg-gray-100 text-gray-500' }
}

interface ApprovalCardProps {
  req: any
  userId: string
  onClick: (req: any) => void
}

export default function ApprovalCard({ req, userId, onClick }: ApprovalCardProps) {
  const isRequester = req.requester_id === userId
  const status = statusLabel(req.status)
  const type = typeLabel(req.type)

  return (
    <div
      onClick={() => onClick(req)}
      className="py-3 border-b dark:border-zinc-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium dark:text-zinc-200">
              {req.requester?.name || req.requester?.email?.split('@')[0]}
            </span>
            <Badge colorClassName={type.colorClassName}>{type.text}</Badge>
            {req.teams?.name ? (
              <Badge tone="neutral">{req.teams.name}</Badge>
            ) : (
              req.departments?.name && <Badge tone="neutral">{req.departments.name}</Badge>
            )}
            {isRequester && <Badge tone="neutral">내 요청</Badge>}
            {req.status === 'approved' && req.cancel_requested && (
              <Badge tone="warning">취소 요청됨</Badge>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            {req.dates && req.dates.length > 1
              ? `${dayjs(req.dates[0]).format('MM/DD')} 외 ${req.dates.length - 1}일`
              : dayjs(req.date).format('YYYY년 MM월 DD일')}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            결재권자: {req.approver?.name || req.approver?.email?.split('@')[0]}
          </p>
          {req.memo && <p className="text-xs text-gray-400 dark:text-zinc-500">사유: {req.memo}</p>}
          {req.status === 'approved' && req.approved_at && (
            <p className="text-xs text-green-500 mt-0.5">
              승인일: {dayjs(req.approved_at).format('YYYY-MM-DD HH:mm')}
            </p>
          )}
          {req.status === 'rejected' && req.rejected_at && (
            <p className="text-xs text-red-400 mt-0.5">
              반려일: {dayjs(req.rejected_at).format('YYYY-MM-DD HH:mm')}
            </p>
          )}
        </div>
        <Badge tone={status.tone} className="shrink-0 ml-2">
          {status.text}
        </Badge>
      </div>
    </div>
  )
}
