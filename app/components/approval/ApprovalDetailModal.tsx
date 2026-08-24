import dayjs from 'dayjs'
import { approvalTypeBadge, displayName, vacationTypeLabel } from '@/app/lib/labels'
import type { ApprovalRequestWithRelations, ApprovalStatus, DateEntry } from '@/app/lib/types'
import type { User } from '@supabase/supabase-js'

interface ApprovalDetailModalProps {
  selectedRequest: ApprovalRequestWithRelations
  user: User | null
  ccInput: string
  ccList: string[]
  existingCcList: string[]
  ccSuggestions: string[]
  showCcSuggestions: boolean
  onCcInputChange: (val: string) => void
  onAddCcEmail: (email: string) => void
  onRemoveCc: (email: string) => void
  onRemoveExistingCc: (email: string) => void
  onApprove: (requestId: string, status: ApprovalStatus) => void
  onEdit: (req: ApprovalRequestWithRelations) => void
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
  const type = approvalTypeBadge(selectedRequest.type)
  const isApprover = selectedRequest.approver_id === user?.id
  const isRequester = selectedRequest.requester_id === user?.id
  const canEditOrCancel = isRequester && selectedRequest.status === 'pending'
  const cancelRequested = !!selectedRequest.cancel_requested

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto">
        <h3 className="font-semibold mb-3 dark:text-white">결재 처리</h3>

        <div className="mb-4 text-sm text-gray-600 dark:text-zinc-300 space-y-2">
          <p>
            <span className="font-medium">신청자:</span> {displayName(selectedRequest.requester)}
          </p>
          <p>
            <span className="font-medium">유형:</span>{' '}
            <span className={`text-xs px-2 py-0.5 rounded-full ${type.style}`}>{type.text}</span>
          </p>
          <div>
            <span className="font-medium">날짜:</span>
            <ul className="mt-2 space-y-1">
              {selectedRequest.date_entries?.map((entry: DateEntry, i: number) => (
                <li key={i} className="text-xs">
                  {dayjs(entry.date).format('MM월 DD일')}
                  {selectedRequest.type === 'vacation' && (
                    <span className="ml-1 text-orange-500">
                      ({vacationTypeLabel(entry.vacationType ?? '')})
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
            <p className="text-gray-400 text-xs">요청자가 취소한 요청이에요.</p>
          )}
          {selectedRequest.status === 'approved' && cancelRequested && (
            <p className="text-amber-500 text-xs">
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
                  <button
                    onClick={() => onAddCcEmail(ccInput)}
                    className="text-xs bg-gray-100 dark:bg-zinc-700 px-2 py-1.5 rounded-lg dark:text-zinc-300"
                  >
                    추가
                  </button>
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
                    <span
                      key={email}
                      className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full"
                    >
                      {email}
                      <button
                        onClick={() => onRemoveCc(email)}
                        className="text-blue-400 hover:text-blue-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {existingCcList.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 mb-1">이전 CC</p>
                  <div className="flex flex-wrap gap-1">
                    {existingCcList.map((email: string) => (
                      <span
                        key={email}
                        className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 text-xs px-2 py-1 rounded-full"
                      >
                        {email}
                        <button
                          onClick={() => onRemoveExistingCc(email)}
                          className="text-gray-400 hover:text-red-400 ml-0.5"
                        >
                          ×
                        </button>
                      </span>
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
                <button
                  onClick={() => onEdit(selectedRequest)}
                  className="flex-1 bg-sky-400 text-white py-2 rounded-lg text-sm"
                >
                  수정
                </button>
                <button
                  onClick={() => onCancel(selectedRequest.id)}
                  className="flex-1 bg-amber-400 text-white py-2 rounded-lg text-sm"
                >
                  취소
                </button>
              </>
            )}

            {/* 요청자: 이미 승인된 건에 대한 취소 요청 */}
            {isRequester && selectedRequest.status === 'approved' && !cancelRequested && (
              <button
                onClick={() => onRequestCancelApproval(selectedRequest.id)}
                className="flex-1 bg-amber-400 text-white py-2 rounded-lg text-sm"
              >
                취소 요청
              </button>
            )}

            {isApprover && (
              <>
                {selectedRequest.status === 'pending' && (
                  <>
                    <button
                      onClick={() => onApprove(selectedRequest.id, 'approved')}
                      className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => onApprove(selectedRequest.id, 'rejected')}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm"
                    >
                      반려
                    </button>
                  </>
                )}
                {selectedRequest.status === 'approved' && (
                  <button
                    onClick={() => onResolveCancelRequest(selectedRequest.id, true)}
                    disabled={!cancelRequested}
                    className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    승인 취소
                  </button>
                )}
                {selectedRequest.status === 'rejected' && (
                  <button
                    onClick={() => onApprove(selectedRequest.id, 'pending')}
                    className="flex-1 bg-yellow-500 text-white py-2 rounded-lg text-sm"
                  >
                    반려 취소
                  </button>
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 py-2 rounded-lg text-sm"
            >
              닫기
            </button>
          </div>

          {/* 결재권자: 취소 요청이 들어온 경우 거절 옵션 제공 */}
          {isApprover && selectedRequest.status === 'approved' && cancelRequested && (
            <button
              onClick={() => onResolveCancelRequest(selectedRequest.id, false)}
              className="w-full text-gray-400 dark:text-zinc-500 text-xs py-1 hover:text-gray-600 dark:hover:text-zinc-300"
            >
              취소 요청 거절하기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
