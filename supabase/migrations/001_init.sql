-- ============================================================
-- work-tracker 초기 스키마
-- 생성일: 2026-06-23
-- ============================================================

-- profiles (유저 프로필)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  email text,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  total_vacation numeric(4,1),
  avatar_url text,
  is_master boolean
);

-- teams (팀)
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT now()
);

-- team_members (팀 멤버)
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text,
  created_at timestamp with time zone DEFAULT now(),
  display_order integer
);

-- team_requests (팀 가입 신청)
CREATE TABLE IF NOT EXISTS public.team_requests (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text,
  created_at timestamp with time zone DEFAULT now()
);

-- work_logs (근무 기록)
CREATE TABLE IF NOT EXISTS public.work_logs (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  break_minutes integer,
  memo text,
  created_at timestamp with time zone DEFAULT now(),
  is_next_day boolean
);

-- vacations (휴가)
CREATE TABLE IF NOT EXISTS public.vacations (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- remote_works (원격근무)
CREATE TABLE IF NOT EXISTS public.remote_works (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- commute_plans (출근 예정)
CREATE TABLE IF NOT EXISTS public.commute_plans (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date,
  commute_time text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  week_number integer
);

-- approval_requests (결재 요청)
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  type text NOT NULL,
  date date NOT NULL,
  vacation_type text,
  status text,
  memo text,
  created_at timestamp with time zone DEFAULT now(),
  dates date[],
  date_entries jsonb
);

-- substitute_holidays (대체 공휴일)
CREATE TABLE IF NOT EXISTS public.substitute_holidays (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
