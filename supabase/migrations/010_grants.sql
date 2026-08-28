-- ============================================================
-- 롤별 테이블 권한 (GRANT)
--
-- 001~009 어디에도 GRANT문이 없다. 운영 DB는 Supabase 대시보드로 만들어져
-- authenticated/service_role에 권한이 이미 있지만, 이 파일들만으로 만든 새 DB는
-- 권한이 없어서 009의 정책이 맞아떨어져도 permission denied가 난다.
-- 그래서 supabase/tests/rls_test.sql이 자기 GRANT를 직접 주고 돌아야 했다.
--
-- RLS 정책과 테이블 권한은 별개의 관문이고 둘 다 통과해야 접근된다.
-- 009가 정책을 정의했으니 이 파일이 권한 쪽을 맡아, 마이그레이션만으로도
-- 동작하는 DB가 나오게 한다.
--
-- 운영 DB에는 이미 같은 권한이 있으므로 사실상 no-op이다.
-- GRANT는 반복 실행해도 안전하다.
-- ============================================================

-- 스키마 접근. anon은 로그인 전 PostgREST 요청에 필요하다.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 브라우저(로그인한 사용자)의 DML.
-- 실제로 어느 행까지 되는지는 009의 정책이 정한다.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 서버 API 라우트는 SUPABASE_SERVICE_ROLE_KEY를 쓰고 RLS를 우회한다.
-- 이걸 빠뜨리면 isMaster()가 조용히 false를 반환해서 마스터가 403을 받는다
-- (fail-closed라 에러가 아니라 권한 오류처럼 보인다).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- anon에는 테이블 권한을 주지 않는다. 009의 정책이 전부 TO authenticated라
-- 어차피 막히지만, 권한을 아예 주지 않으면 관문이 하나 더 생긴다.

-- 앞으로 추가할 테이블에도 같은 권한이 자동으로 붙게 한다.
-- 이게 없으면 다음 마이그레이션이 만드는 테이블에서 같은 문제가 되풀이된다.
-- 마이그레이션은 postgres 롤로 실행되므로 그 롤이 만든 객체에 적용된다.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
