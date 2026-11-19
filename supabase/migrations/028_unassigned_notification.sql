<<<<<<< HEAD
-- 미지정 인원 알림 (소속 배정이 필요한 인원이 생기면 총괄 관리자·부문장·부서장에게 알림)
=======
-- 미지정 인원 알림 (소속 배정이 필요한 인원이 생기면 총괄 관리자·부문장·부장에게 알림)
>>>>>>> feature/UI_Refactoring

-- 1) 알림을 이미 보낸 시각. 소속이 배정되면 서버가 null로 되돌린다.
alter table public.profiles
  add column if not exists unassigned_notified_at timestamptz;

-- 2) notifications.type 허용값에 'UNASSIGNED' 추가.
--    기존 type CHECK 제약을 찾아 지우고 새로 만든다. (type이 CHECK가 아니라 enum 타입이면
--    이 블록 대신: alter type <enum이름> add value 'UNASSIGNED'; 를 실행하세요.)
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('REQUEST', 'APPROVED', 'REJECTED', 'CANCEL_REQUEST', 'CANCELLED', 'UNASSIGNED'));
