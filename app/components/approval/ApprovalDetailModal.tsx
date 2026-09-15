import dayjs from 'dayjs'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

// ApprovalCard와 같은 기준: 신청 타입은 서로 구분이 필요해 기존 색을 그대로 유지한다.
function typeLabel(type: string): { text: string; colorClassName: string } {
  if (type === 'vacation') return { text: '휴가', colorClassName: 'bg-orange-50 text-orange-500' }
  if (type === 'remote') return { text: '원격근무', colorClassName: 'bg-indigo-50 text-indigo-500' }
  if (type === 'holiday') return { text: '휴일근무', colorClassName: 'bg-red-50 text-red-500' }
  return { text: type, colorClassName: 'bg-gray-100 text-gray-500' }
}

function vacationTypeLabel(type: string) {
  if (type === 'annual') return '연차'
  if (type === 'morning') return '오전반차'
  if (type === 'afternoon') return '오후반차'
  if (type === 'special') return '특휴/대휴'
  return type
}

interface ApprovalDetailModalProps {
  selectedRequest: any
  user: any
  ccInput: string
  ccList: string[]
  existingCcList: string[]
  ccSuggestions: string[]
  showCcSuggestions: boolean
  onCcInputChange: (val: string) => void
  onAddCcEmail: (email: string) => void
  onRemoveCc: (email: string) => void
  onRemoveExistingCc: (email: string) => void
  onApprove: (requestId: string, status: string) => void
  onEdit: (req: any) => void
  onCancel: (requestId: string) => void
  onRequestCancelApproval: (requestId: string) => void
  onResolveCancelRequest: (requestId: string, approve: boolean) => void
  onClose: () => void
}

export default function ApprovalDetailModal({
  selectedRequest,
  user,
  ccInput,
  ccList,
  existingCcList,
  ccSuggestions,
  showCcSuggestions,
  onCcInputChange,
  onAddCcEmail,
  onRemoveCc,
  onRemoveExistingCc,
  onApprove,
  onEdit,
  onCancel,
  onRequestCancelApproval,
  onResolveCancelRequest,
  onClose,
}: ApprovalDetailModalProps) {
  const type = typeLabel(selectedRequest.type)
  const isApprover = selectedRequest.approver_id === user?.id
  const isRequester = selectedRequest.requester_id === user?.id
  const canEditOrCancel = isRequester && selectedRequest.status === 'pending'
  const cancelRequested = !!selectedRequest.cancel_requested

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto">
        <h3 className="font-semibold mb-3 dark:text-white">결재 처리</h3>

        <div className="mb-4 text-sm text-gray-600 dark:text-zinc-300 space-y-2">
          <p>
            <span className="font-medium">신청자:</span>{' '}
            {selectedRequest.requester?.name || selectedRequest.requester?.email?.split('@')[0]}
          </p>
          <p>
            <span className="font-medium">유형:</span>{' '}
            <Badge colorClassName={type.colorClassName}>{type.text}</Badge>
          </p>
          <div>
            <span className="font-medium">날짜:</span>
            <ul className="mt-2 space-y-1">
              {selectedRequest.date_entries?.map((entry: any, i: number) => (
                <li key={i} className="text-xs">
                  {dayjs(entry.date).format('MM월 DD일')}
                  {selectedRequest.type === 'vacation' && (
                    <span className="ml-1 text-orange-500">
                      ({vacationTypeLabel(entry.vacationType)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {selectedRequest.memo && (
            <p>
              <span className="font-medium">
                {selectedRequest.type === 'holiday' ? '출근 사유:' : '사유:'}
              </span>{' '}
              {selectedRequest.memo}
            </p>
          )}
          {selectedRequest.status === 'approved' && selectedRequest.approved_at && (
            <p className="text-green-500 text-xs">
              승인일: {dayjs(selectedRequest.approved_at).format('YYYY-MM-DD HH:mm')}
            </p>
          )}
          {selectedRequest.status === 'rejected' && selectedRequest.rejected_at && (
            <p className="text-red-400 text-xs">
              반려일: {dayjs(selectedRequest.rejected_at).format('YYYY-MM-DD HH:mm')}
            </p>
          )}
          {selectedRequest.status === 'cancelled' && (
            <p className="text-gray-500 dark:text-zinc-400 text-xs">요청자가 취소한 요청이에요.</p>
          )}
          {selectedRequest.status === 'approved' && cancelRequested && (
            <p className="text-orange-500 text-xs">
              {isRequester
                ? '승인 취소를 요청했어요. 결재권자의 처리를 기다리고 있어요.'
                : '요청자가 이미 승인된 건에 대해 취소를 요청했어요.'}
            </p>
          )}

          {/* CC 입력 (결재권자 + pending 상태일 때만) */}
          {isApprover && selectedRequest.status === 'pending' && (
            <div className="mt-3">
              <p className="font-medium mb-1">참조 (CC)</p>
              <div className="relative">
                <div className="flex gap-1">
                  <input
                    type="email"
                    value={ccInput}
                    onChange={(e) => onCcInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        onAddCcEmail(ccInput)
                      }
                    }}
                    placeholder="이메일 입력 후 Enter"
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  />
                  <Button size="sm" variant="secondary" onClick={() => onAddCcEmail(ccInput)}>
                    추가
                  </Button>
                </div>
                {showCcSuggestions && (
                  <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-700 border dark:border-zinc-600 rounded-lg shadow-lg z-10 mt-1">
                    {ccSuggestions.map((email) => (
                      <button
                        key={email}
                        onClick={() => onAddCcEmail(email)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-600 dark:text-zinc-200"
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {ccList.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ccList.map((email) => (
                    <Badge key={email} tone="info" className="flex items-center gap-1 py-1">
                      {email}
                      <button
                        onClick={() => onRemoveCc(email)}
                        className="text-blue-400 hover:text-blue-600"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {existingCcList.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">이전 CC</p>
                  <div className="flex flex-wrap gap-1">
                    {existingCcList.map((email: string) => (
                      <Badge key={email} tone="neutral" className="flex items-center gap-1 py-1">
                        {email}
                        <button
                          onClick={() => onRemoveExistingCc(email)}
                          className="text-gray-400 hover:text-red-400 ml-0.5"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {canEditOrCancel && (
              <>
                <Button className="flex-1" onClick={() => onEdit(selectedRequest)}>
                  수정
                </Button>
                <Button
                  variant="warning"
                  className="flex-1"
                  onClick={() => onCancel(selectedRequest.id)}
                >
                  취소
                </Button>
              </>
            )}

            {/* 요청자: 이미 승인된 건에 대한 취소 요청 */}
            {isRequester && selectedRequest.status === 'approved' && !cancelRequested && (
              <Button
                variant="warning"
                className="flex-1"
                onClick={() => onRequestCancelApproval(selectedRequest.id)}
              >
                취소 요청
              </Button>
            )}

            {isApprover && (
              <>
                {selectedRequest.status === 'pending' && (
                  <>
                    <Button
                      variant="success"
                      className="flex-1"
                      onClick={() => onApprove(selectedRequest.id, 'approved')}
                    >
                      승인
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => onApprove(selectedRequest.id, 'rejected')}
                    >
                      반려
                    </Button>
                  </>
                )}
                {selectedRequest.status === 'approved' && (
                  <Button
                    variant="pending"
                    className="flex-1"
                    onClick={() => onResolveCancelRequest(selectedRequest.id, true)}
                    disabled={!cancelRequested}
                  >
                    승인 취소
                  </Button>
                )}
                {selectedRequest.status === 'rejected' && (
                  <Button
                    variant="pending"
                    className="flex-1"
                    onClick={() => onApprove(selectedRequest.id, 'pending')}
                  >
                    반려 취소
                  </Button>
                )}
              </>
            )}
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              닫기
            </Button>
          </div>

          {/* 결재권자: 취소 요청이 들어온 경우 거절 옵션 제공 */}
          {isApprover && selectedRequest.status === 'approved' && cancelRequested && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              className="py-1"
              onClick={() => onResolveCancelRequest(selectedRequest.id, false)}
            >
              취소 요청 거절하기
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
