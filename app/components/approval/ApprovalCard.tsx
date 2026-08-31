import dayjs from 'dayjs'

function statusLabel(status: string) {
  if (status === 'pending') return { text: '승인 대기중', color: 'text-yellow-500 bg-yellow-50' }
  if (status === 'approved') return { text: '승인', color: 'text-green-500 bg-green-50' }
  if (status === 'rejected') return { text: '반려', color: 'text-red-500 bg-red-50' }
  if (status === 'cancelled') return { text: '취소됨', color: 'text-gray-400 bg-gray-100' }
  return { text: status, color: '' }
}

function typeLabel(type: string) {
  if (type === 'vacation') return { text: '휴가', style: 'bg-orange-50 text-orange-500' }
  if (type === 'remote') return { text: '원격근무', style: 'bg-purple-50 text-purple-500' }
  if (type === 'holiday') return { text: '휴일근무', style: 'bg-red-50 text-red-500' }
  return { text: type, style: 'bg-gray-100 text-gray-500' }
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
            <span className={`text-xs px-2 py-0.5 rounded-full ${type.style}`}>
              {type.text}
            </span>
            {req.teams?.name ? (
              <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">
                {req.teams.name}
              </span>
            ) : req.departments?.name && (
              <span className="text-xs bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">
                {req.departments.name}
              </span>
            )}
            {isRequester && (
              <span className="text-xs bg-orange-50 text-orange-400 px-2 py-0.5 rounded-full">
                내 요청
              </span>
            )}
            {req.status === 'approved' && req.cancel_requested && (
              <span className="text-xs bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full">
                취소 요청됨
              </span>
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
          {req.memo && (
            <p className="text-xs text-gray-400 dark:text-zinc-500">사유: {req.memo}</p>
          )}
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
        <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${status.color}`}>
          {status.text}
        </span>
      </div>
    </div>
  )
}
