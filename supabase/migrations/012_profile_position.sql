-- profiles 테이블에 직급(position) 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS position text;
