export type NotificationType = 'REQUEST' | 'APPROVED' | 'REJECTED' | 'CANCEL_REQUEST' | 'CANCELLED'

export interface Notification {
  id: string
  receiver_id: string
  approval_id: string | null
  type: NotificationType
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}
