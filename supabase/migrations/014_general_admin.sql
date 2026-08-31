-- ============================================================
-- 총괄 관리자(General Admin) 역할 추가
--
-- 배경: is_master(MASTER)는 "시스템 관리자" 성격이라 계정/시스템 운영 권한이며,
-- 조직 관리 권한 체계와는 개념적으로 분리한다.
-- 다만 조직 관리 화면(/org)에서는 지금까지 부문장 위에 아무도 없어서
-- MASTER가 그 자리를 임시로 대신해왔다. 이제 부문장 위에 "총괄 관리자"라는
-- 별도 계급을 두어, 시스템 관리자가 아니어도 전체 조직(모든 부문/부서)을
-- 관리할 수 있는 사람을 지정할 수 있게 한다.
--
-- 계층: 총괄 관리자 > 부문장 > 부서장 > 팀장 > 팀원
-- (MASTER는 시스템 권한 트랙이며, 조직 관리 화면에서도 여전히 모든 권한을
--  가지지만 이는 "시스템 관리자는 무엇이든 할 수 있다"는 별도 성격이다.)
--
-- 한 명 이상 지정 가능하도록 소속 테이블 형태로 둔다 (division/department의
-- head_user_id와 달리 "전체 조직"은 특정 로우가 없으므로).
-- 생성일: 2026-08-29
-- ============================================================

create table if not exists public.general_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.general_admins disable row level security;
