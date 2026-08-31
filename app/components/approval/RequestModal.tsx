import dayjs from 'dayjs'
import DatePicker from 'react-multi-date-picker'
import { X, Palmtree, Laptop, Building2 } from 'lucide-react'

function typeLabel(type: string) {
  if (type === 'vacation') return { text: '휴가', style: 'bg-orange-50 text-orange-500' }
  if (type === 'remote') return { text: '원격근무', style: 'bg-purple-50 text-purple-500' }
  if (type === 'holiday') return { text: '휴일근무', style: 'bg-red-50 text-red-500' }
  return { text: type, style: 'bg-gray-100 text-gray-500' }
}

interface DateGroup {
  dates: string[]
  vacationType: string
}

interface MySource {
  key: string
  label: string
  teamId: string | null
  departmentId: string
}

interface RequestModalProps {
  step: number
  requestType: string
  isEditing?: boolean
  dateGroups: DateGroup[]
  selectedSourceKey: string
  selectedApprover: string
  mySources: MySource[]
  approvers: any[]
  memo: string
  ccInput: string
  ccList: string[]
  ccSuggestions: string[]
  showCcSuggestions: boolean
  loading: boolean
  message: string
  onSelectType: (type: string) => void
  onBack: () => void
  onSourceChange: (sourceKey: string) => void
  onApproverChange: (approverId: string) => void
  onAddDateGroup: () => void
  onRemoveDateGroup: (index: number) => void
  onDateGroupChange: (index: number, dates: string[]) => void
  onVacationTypeChange: (index: number, vacationType: string) => void
  onMemoChange: (value: string) => void
  onCcInputChange: (val: string) => void
  onAddCcEmail: (email: string) => void
  onRemoveCc: (email: string) => void
  onSubmit: () => void
  onClose: () => void
}

export default function RequestModal({
  step,
  requestType,
  isEditing = false,
  dateGroups,
  selectedSourceKey,
  selectedApprover,
  mySources,
  approvers,
  memo,
  ccInput,
  ccList,
  ccSuggestions,
  showCcSuggestions,
  loading,
  message,
  onSelectType,
  onBack,
  onSourceChange,
  onApproverChange,
  onAddDateGroup,
  onRemoveDateGroup,
  onDateGroupChange,
  onVacationTypeChange,
  onMemoChange,
  onCcInputChange,
  onAddCcEmail,
  onRemoveCc,
  onSubmit,
  onClose,
}: RequestModalProps) {
  const currentTypeLabel = typeLabel(requestType)

  return (
    <div
      className={`fixed inset-0 bg-black/50 z-50 flex justify-center p-2 sm:p-2 ${
        step === 1 ? 'items-center' : 'items-start'
      }`}
    >
      <div className="bg-white dark:bg-zinc-800 rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col">
        <div className="flex justify-between items-center p-4 sm:p-6 pb-3 border-b dark:border-zinc-700">
          <h3 className="font-semibold dark:text-white">{isEditing ? '결재 요청 수정' : '결재 요청'}</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-zinc-500">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {/* Step 1: 유형 선택 */}
          {step === 1 && (
            <div>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
                요청 유형을 선택해주세요
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onSelectType('vacation')}
                  className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-orange-400 hover:text-orange-500 transition text-left px-4 flex items-center gap-2"
                >
                  <Palmtree size={16} strokeWidth={1.75} /> 휴가
                </button>
                <button
                  onClick={() => onSelectType('remote')}
                  className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-purple-400 hover:text-purple-500 transition text-left px-4 flex items-center gap-2"
                >
                  <Laptop size={16} strokeWidth={1.75} /> 원격근무
                </button>
                <button
                  onClick={() => onSelectType('holiday')}
                  className="w-full py-3 border-2 dark:border-zinc-600 rounded-xl text-sm font-medium dark:text-zinc-300 hover:border-red-400 hover:text-red-500 transition text-left px-4 flex items-center gap-2"
                >
                  <Building2 size={16} strokeWidth={1.75} /> 휴일근무
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 상세 입력 */}
          {step === 2 && (
            <div>
              {!isEditing && (
                <button
                  onClick={onBack}
                  className="text-xs text-gray-400 dark:text-zinc-500 mb-3"
                >
                  ← 뒤로
                </button>
              )}

              {/* 선택된 유형 표시 */}
              <div className="mb-4">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${currentTypeLabel.style}`}
                >
                  {currentTypeLabel.text}
                </span>
              </div>

              {/* 내 소속 */}
              <div className="mb-3">
                <label className="text-sm text-gray-500 dark:text-zinc-400">내 소속</label>
                {mySources.length <= 1 ? (
                  <p className="w-full border rounded-lg px-3 py-2 mt-1 text-sm bg-gray-50 dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200">
                    {mySources[0]?.label || '소속된 부서/팀이 없어요'}
                  </p>
                ) : (
                  <select
                    value={selectedSourceKey}
                    onChange={(e) => onSourceChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  >
                    <option value="">내 소속 선택</option>
                    {mySources.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 결재권자 선택 */}
              <div className="mb-4">
                <label className="text-sm text-gray-500 dark:text-zinc-400">결재권자</label>
                <select
                  value={selectedApprover}
                  onChange={(e) => onApproverChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                >
                  <option value="">결재권자 선택</option>
                  {approvers.map((a) => (
                    <option key={a.user_id} value={a.user_id}>
                      {a.profiles?.name || a.profiles?.email?.split('@')[0]}
                    </option>
                  ))}
                </select>
              </div>

              {/* 날짜 선택 */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-gray-500 dark:text-zinc-400">날짜 선택</label>
                  <button onClick={onAddDateGroup} className="text-xs text-blue-500">
                    + 날짜 추가
                  </button>
                </div>
                {dateGroups.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    날짜 추가 버튼을 눌러주세요
                  </p>
                )}
                {dateGroups.map((group, index) => (
                  <div
                    key={index}
                    className="mb-4 p-3 bg-gray-50 dark:bg-zinc-700 rounded-xl"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500 dark:text-zinc-400">
                        {index + 1}번째 그룹
                      </span>
                      <button
                        onClick={() => onRemoveDateGroup(index)}
                        className="text-xs text-red-400"
                      >
                        삭제
                      </button>
                    </div>
                    <DatePicker
                      multiple
                      portal
                      portalTarget={document.body}
                      zIndex={9999}
                      value={group.dates}
                      onChange={(dates: any) => {
                        onDateGroupChange(
                          index,
                          dates.map((d: any) => d.format('YYYY-MM-DD'))
                        )
                      }}
                      format="YYYY-MM-DD"
                      className="w-full text-sm"
                    />
                    {group.dates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {group.dates.map((d, i) => (
                          <span
                            key={i}
                            className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full"
                          >
                            {dayjs(d).format('MM/DD')}
                          </span>
                        ))}
                      </div>
                    )}
                    {requestType === 'vacation' && (
                      <div className="flex gap-1 mt-3">
                        {[
                          { value: 'annual', label: '연차' },
                          { value: 'morning', label: '오전반차' },
                          { value: 'afternoon', label: '오후반차' },
                          { value: 'special', label: '특휴/대휴' },
                        ].map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={() => onVacationTypeChange(index, value)}
                            className={`flex-1 py-1.5 rounded-lg text-xs border ${
                              group.vacationType === value
                                ? 'bg-orange-500 text-white'
                                : 'bg-white dark:bg-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 사유 입력 (휴가 / 휴일근무) */}
              {(requestType === 'vacation' || requestType === 'holiday') && (
                <div className="mb-4">
                  <label className="text-sm text-gray-500 dark:text-zinc-400">
                    {requestType === 'holiday' ? '출근 사유' : '휴가 사유'}
                    {requestType === 'holiday' && (
                      <span className="text-red-400 ml-1">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => onMemoChange(e.target.value)}
                    placeholder={requestType === 'holiday' ? '휴일 출근 사유를 입력해주세요' : ''}
                    className="w-full border rounded-lg px-3 py-2 mt-1 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                  />
                </div>
              )}

              {/* CC 입력 */}
              <div className="mb-4">
                <label className="text-sm text-gray-500 dark:text-zinc-400">
                  참조 (CC){' '}
                  <span className="text-gray-400 dark:text-zinc-500 font-normal">· 선택</span>
                </label>
                <div className="relative mt-1">
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
                      className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                    />
                    <button
                      onClick={() => onAddCcEmail(ccInput)}
                      className="text-xs bg-gray-100 dark:bg-zinc-700 px-3 py-2 rounded-lg dark:text-zinc-300"
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
              </div>

              {message && <p className="text-xs text-red-500 mb-3">{message}</p>}
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="p-4 border-t dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-b-2xl">
            <button
              onClick={onSubmit}
              disabled={loading}
              className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? (isEditing ? '저장 중...' : '요청 중...') : (isEditing ? '수정 완료' : '결재 요청')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
