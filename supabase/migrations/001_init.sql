-- ============================================================
-- work-tracker 완전한 초기 스키마
-- 생성일: 2026-06-26
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  name text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  total_vacation numeric(4,1) DEFAULT 0,
  avatar_url text,
  is_master boolean DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);

-- team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  display_order integer DEFAULT 0,
  CONSTRAINT team_members_pkey PRIMARY KEY (id),
  CONSTRAINT team_members_team_user_unique UNIQUE (team_id, user_id)
);

-- team_requests
CREATE TABLE IF NOT EXISTS public.team_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT team_requests_pkey PRIMARY KEY (id),
  CONSTRAINT team_requests_team_user_unique UNIQUE (team_id, user_id)
);

-- work_logs
CREATE TABLE IF NOT EXISTS public.work_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  break_minutes integer DEFAULT 0,
  memo text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  is_next_day boolean DEFAULT false,
  CONSTRAINT work_logs_pkey PRIMARY KEY (id),
  CONSTRAINT work_logs_user_id_date_key UNIQUE (user_id, date)
);

-- vacations
CREATE TABLE IF NOT EXISTS public.vacations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT vacations_pkey PRIMARY KEY (id),
  CONSTRAINT vacations_user_id_date_key UNIQUE (user_id, date)
);

-- remote_works
CREATE TABLE IF NOT EXISTS public.remote_works (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT remote_works_pkey PRIMARY KEY (id),
  CONSTRAINT remote_works_user_id_date_key UNIQUE (user_id, date)
);

-- commute_plans
CREATE TABLE IF NOT EXISTS public.commute_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date,
  commute_time text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  week_number integer,
  CONSTRAINT commute_plans_pkey PRIMARY KEY (id),
  CONSTRAINT commute_plans_user_id_week_number_key UNIQUE (user_id, week_number)
);

-- approval_requests
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES public.profiles(id),
  team_id uuid REFERENCES public.teams(id),
  type text NOT NULL,
  date date NOT NULL,
  vacation_type text,
  status text DEFAULT 'pending'::text,
  memo text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  dates date[],
  date_entries jsonb,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  cc_emails text[],
  CONSTRAINT approval_requests_pkey PRIMARY KEY (id)
);

-- substitute_holidays
CREATE TABLE IF NOT EXISTS public.substitute_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT substitute_holidays_pkey PRIMARY KEY (id),
  CONSTRAINT substitute_holidays_date_key UNIQUE (date)
);

-- ============================================================
-- 트리거: 회원가입 시 profiles 자동 생성
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (new.id, new.email, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
