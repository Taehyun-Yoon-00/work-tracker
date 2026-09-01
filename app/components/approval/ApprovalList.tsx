import ApprovalCard from './ApprovalCard'
import DateRangeFilter from './DateRangeFilter'
import { Palmtree, Laptop, Building2 } from 'lucide-react'

interface ApprovalListProps {
  requests: any[]
  userId: string
  filterStatus: string
  filterType: string
  dateRangeStart: string
  dateRangeEnd: string
  onFilterStatusChange: (value: string) => void
  onFilterTypeChange: (value: string) => void
  onDateRangeChange: (start: string, end: string) => void
  onCardClick: (req: any) => void
}

export default function ApprovalList({
  requests,
  userId,
  filterStatus,
  filterType,
  dateRangeStart,
  dateRangeEnd,
  onFilterStatusChange,
  onFilterTypeChange,
  onDateRangeChange,
  onCardClick,
}: ApprovalListProps) {
  const filteredRequests = requests.filter((r) => {
    const statusMatch =
      filterStatus === 'all'
        ? true
        : filterStatus === 'mine'
          ? r.requester_id === userId
          : filterStatus === 'pending'
            ? r.status === 'pending'
            : filterStatus === 'completed'
              ? ['approved', 'rejected', 'cancelled'].includes(r.status)
              : true
    const typeMatch = filterType === 'all' || r.type === filterType
    return statusMatch && typeMatch
  })

  return (
    <>
      {/* 기간 선택 */}
      <DateRangeFilter
        startDate={dateRangeStart}
        endDate={dateRangeEnd}
        onApply={onDateRangeChange}
      />

      {/* 상태 필터 */}
      <div className="flex bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5 mb-2">
        {[
          { value: 'all', label: '전체' },
          { value: 'mine', label: '내요청' },
          { value: 'pending', label: '대기중' },
          { value: 'completed', label: '완료' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onFilterStatusChange(value)}
            className={`flex-1 text-xs py-1.5 rounded-md transition ${
              filterStatus === value
                ? 'bg-white dark:bg-zinc-600 shadow text-blue-500 font-semibold'
                : 'text-gray-500 dark:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 유형 필터 */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {[
          {
            value: 'all',
            label: '전체',
            style:
              filterType === 'all'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400',
          },
          {
            value: 'vacation',
            label: '휴가',
            Icon: Palmtree,
            style:
              filterType === 'vacation'
                ? 'bg-orange-500 text-white'
                : 'bg-orange-50 dark:bg-zinc-700 text-orange-500 dark:text-orange-300',
          },
          {
            value: 'remote',
            label: '원격근무',
            Icon: Laptop,
            style:
              filterType === 'remote'
                ? 'bg-purple-500 text-white'
                : 'bg-purple-50 dark:bg-zinc-700 text-purple-500 dark:text-purple-300',
          },
          {
            value: 'holiday',
            label: '휴일근무',
            Icon: Building2,
            style:
              filterType === 'holiday'
                ? 'bg-red-500 text-white'
                : 'bg-red-50 dark:bg-zinc-700 text-red-500 dark:text-red-300',
          },
        ].map(({ value, label, style, Icon }) => (
          <button
            key={value}
            onClick={() => onFilterTypeChange(value)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${style}`}
          >
            {Icon && <Icon size={12} strokeWidth={2} />}
            {label}
          </button>
        ))}
      </div>

      {/* 카드 목록 */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4">
        {filteredRequests.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
            결재 요청이 없어요.
          </p>
        ) : (
          filteredRequests.map((req) => (
            <ApprovalCard key={req.id} req={req} userId={userId} onClick={onCardClick} />
          ))
        )}
      </div>
    </>
  )
}
