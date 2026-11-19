-- 이름을 한글 / 한자 / 이니셜로 나눠 저장한다.
--  - name         : 한글 이름 (기존 컬럼 그대로. 앱 화면 전체에서 계속 이 값을 표시한다)
--  - name_hanja   : 한자 이름 (출력 파일 내부 이름란에 사용)
--  - name_initial : 이니셜   (출력 파일명에 사용)
-- 직급(position)은 기존 text 컬럼을 그대로 쓴다. 프리셋(사원/선임/책임/수석)과 직접 입력값 모두 문자열로 저장된다.
alter table public.profiles
  add column if not exists name_hanja text,
  add column if not exists name_initial text;
