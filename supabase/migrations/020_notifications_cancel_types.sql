-- ============================================================
-- notifications 타입 제약 조건에 취소 요청 관련 타입 추가
--
-- 문제: 002/003_notifications.sql에서 만든 notifications_type_check 제약은
--   type IN ('REQUEST', 'APPROVED', 'REJECTED') 만 허용한다.
--   그런데 app/api/notify-approval/route.ts는 승인 취소 요청 흐름에서
--   'CANCEL_REQUEST', 'CANCELLED' 타입도 notifications 테이블에 INSERT한다
--   (app/lib/notifications.ts의 createNotification → notifyAndPush).
--
--   이 두 타입은 CHECK 제약을 위반하므로 INSERT가 항상 실패하고
--   (에러는 서버 콘솔에만 로그되고 사용자에게는 드러나지 않음),
--   notifyAndPush는 notification 생성이 실패하면 즉시 return하므로
--   Push 발송(sendPushToUser)까지 함께 건너뛴다.
--   반면 메일 발송(Resend)은 이 로직과 무관하게 별도로 실행되므로
--   "메일은 오는데 알림센터/푸시는 안 온다"는 증상이 발생했다.
--
-- 해결: 제약 조건을 NotificationType(app/lib/types.ts)과 동일하게 맞춘다.
-- 생성일: 2026-09-01
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('REQUEST', 'APPROVED', 'REJECTED', 'CANCEL_REQUEST', 'CANCELLED'));
