-- ============================================================
-- 국내 출장 정산 (国内出張旅費精算) 저장 테이블
--
-- 근무시간(work_logs)과는 완전히 별개다. 출근하지 않은 날(주말 숙박 등)에도 정산 내용을
-- 입력해야 하므로 work_logs와 같은 행/키를 쓰지 않고, 서로 참조도 하지 않는다.
--
-- 구조
--   domestic_trip_settlements  : 정산월 1건 = 1행 (사용자 × 연 × 월). 직급·시작 계기판·km 단가
--   domestic_trip_days         : 정산월 안의 날짜별 입력 (숙박, 행선지, 교통비, 주행거리)
--
--   정산 기간은 (전월 16일 ~ 당월 15일)이고 month는 "당월"이다. (예: 2026년 11월분 = 10/16~11/15)
--
--   해외 출장은 양식이 다르므로 이 테이블을 넓히지 않고, 나중에 overseas_trip_* 테이블을
--   따로 만든다. (그래서 테이블 이름에 domestic_ 접두어를 붙였다.)
--
-- 금액(숙박비·일당·합계)은 저장하지 않는다. 입력값(숙박 구분, 교통비, km)만 저장하고
-- 금액은 화면/출력 시점에 직급별 단가표(app/lib/settlement/domestic.ts)로 계산한다.
-- 단가가 바뀌면 이미 저장된 달도 새 단가로 다시 계산된다는 뜻이다.
--
-- 접근 범위: 본인 것만 조회/수정/삭제한다. (팀장·관리자도 못 본다 — 정산 금액은 개인 정보)
-- 서버 API(SUPABASE_SERVICE_ROLE_KEY)는 RLS를 우회하므로 엑셀 출력 등은 서버에서 가능하다.
--
-- 반복 실행해도 안전하다 (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================

-- updated_at 자동 갱신 (이 마이그레이션 전용 이름 — 다른 테이블 트리거와 섞이지 않게)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 정산월 (헤더)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domestic_trip_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  month smallint NOT NULL,
  -- 양식 AT3. 1=사원 2=선임 3=책임 4=수석. 저장 시점의 직급(승진해도 지난 달은 그대로 남는다)
  rank_level smallint,
  -- 시트3 시작 계기판(전월 말 누적 km). 이후 누적은 일별 주행거리로 계산한다.
  odometer_start integer,
  -- 시트3 km당 단가(유류대). 양식 H48/AG48
  fuel_unit_price integer NOT NULL DEFAULT 240,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domestic_trip_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT domestic_trip_settlements_user_month_key UNIQUE (user_id, year, month),
  CONSTRAINT domestic_trip_settlements_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT domestic_trip_settlements_month_chk CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT domestic_trip_settlements_rank_chk CHECK (rank_level IS NULL OR rank_level BETWEEN 1 AND 4),
  CONSTRAINT domestic_trip_settlements_odo_chk CHECK (odometer_start IS NULL OR odometer_start >= 0),
  CONSTRAINT domestic_trip_settlements_price_chk CHECK (fuel_unit_price >= 0)
);

DROP TRIGGER IF EXISTS domestic_trip_settlements_touch ON public.domestic_trip_settlements;
CREATE TRIGGER domestic_trip_settlements_touch
  BEFORE UPDATE ON public.domestic_trip_settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 날짜별 입력
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domestic_trip_days (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.domestic_trip_settlements(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- 시트1 숙박 구분 (양식 AT열): 0=없음 1=A 2=B
  lodging smallint NOT NULL DEFAULT 0,
  -- 출발지/도착지 — 세 시트가 함께 쓰는 값
  from_place text NOT NULL DEFAULT '',
  to_place text NOT NULL DEFAULT '',
  -- 시트별로 행선지를 적을지 직접 지정한 값. NULL이면 자동
  -- (숙박이 있으면 s1, 교통비가 있으면 s2, 주행거리가 있으면 s3)
  route_s1 boolean,
  route_s2 boolean,
  route_s3 boolean,
  -- 시트2 교통수단(복수). 양식의 ■ 표시 항목
  modes text[] NOT NULL DEFAULT '{}',
  fare integer,       -- 운임 (R열)
  toll integer,       -- 통행료 (U열)
  parking integer,    -- 주차료 (X열)
  purpose text NOT NULL DEFAULT '',   -- 이용 목적 (AI열)
  -- 시트3 그날 주행거리(km), 왕복이면 경로를 A↔B로 적는다
  km numeric(7,1),
  round_trip boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domestic_trip_days_pkey PRIMARY KEY (id),
  CONSTRAINT domestic_trip_days_settlement_date_key UNIQUE (settlement_id, date),
  CONSTRAINT domestic_trip_days_lodging_chk CHECK (lodging IN (0, 1, 2)),
  CONSTRAINT domestic_trip_days_from_chk CHECK (char_length(from_place) <= 100),
  CONSTRAINT domestic_trip_days_to_chk CHECK (char_length(to_place) <= 100),
  CONSTRAINT domestic_trip_days_purpose_chk CHECK (char_length(purpose) <= 200),
  CONSTRAINT domestic_trip_days_modes_chk
    CHECK (modes <@ ARRAY['train', 'subway', 'taxi', 'bus', 'company', 'private']::text[]),
  CONSTRAINT domestic_trip_days_fare_chk CHECK (fare IS NULL OR fare >= 0),
  CONSTRAINT domestic_trip_days_toll_chk CHECK (toll IS NULL OR toll >= 0),
  CONSTRAINT domestic_trip_days_parking_chk CHECK (parking IS NULL OR parking >= 0),
  CONSTRAINT domestic_trip_days_km_chk CHECK (km IS NULL OR km >= 0)
);

DROP TRIGGER IF EXISTS domestic_trip_days_touch ON public.domestic_trip_days;
CREATE TRIGGER domestic_trip_days_touch
  BEFORE UPDATE ON public.domestic_trip_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- RLS — 본인 것만
-- ------------------------------------------------------------
-- 정책 안에서 헤더 테이블을 다시 조회하면 그 테이블의 정책이 또 평가되므로(017의 헬퍼들과
-- 같은 이유) SECURITY DEFINER 헬퍼로 소유 여부만 확인한다. search_path 고정은 필수 방어다.
CREATE OR REPLACE FUNCTION public.owns_domestic_trip_settlement(p_settlement_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.domestic_trip_settlements
    WHERE id = p_settlement_id AND user_id = auth.uid()
  );
$$;

ALTER TABLE public.domestic_trip_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domestic_trip_settlements_select_own ON public.domestic_trip_settlements;
CREATE POLICY domestic_trip_settlements_select_own
  ON public.domestic_trip_settlements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS domestic_trip_settlements_insert_own ON public.domestic_trip_settlements;
CREATE POLICY domestic_trip_settlements_insert_own
  ON public.domestic_trip_settlements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS domestic_trip_settlements_update_own ON public.domestic_trip_settlements;
CREATE POLICY domestic_trip_settlements_update_own
  ON public.domestic_trip_settlements FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS domestic_trip_settlements_delete_own ON public.domestic_trip_settlements;
CREATE POLICY domestic_trip_settlements_delete_own
  ON public.domestic_trip_settlements FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.domestic_trip_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domestic_trip_days_select_own ON public.domestic_trip_days;
CREATE POLICY domestic_trip_days_select_own
  ON public.domestic_trip_days FOR SELECT TO authenticated
  USING (public.owns_domestic_trip_settlement(settlement_id));

DROP POLICY IF EXISTS domestic_trip_days_insert_own ON public.domestic_trip_days;
CREATE POLICY domestic_trip_days_insert_own
  ON public.domestic_trip_days FOR INSERT TO authenticated
  WITH CHECK (public.owns_domestic_trip_settlement(settlement_id));

DROP POLICY IF EXISTS domestic_trip_days_update_own ON public.domestic_trip_days;
CREATE POLICY domestic_trip_days_update_own
  ON public.domestic_trip_days FOR UPDATE TO authenticated
  USING (public.owns_domestic_trip_settlement(settlement_id))
  WITH CHECK (public.owns_domestic_trip_settlement(settlement_id));

DROP POLICY IF EXISTS domestic_trip_days_delete_own ON public.domestic_trip_days;
CREATE POLICY domestic_trip_days_delete_own
  ON public.domestic_trip_days FOR DELETE TO authenticated
  USING (public.owns_domestic_trip_settlement(settlement_id));

-- 018의 기본 권한이 새 테이블에도 붙지만, 이 파일만 따로 적용해도 동작하도록 명시한다.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.domestic_trip_settlements, public.domestic_trip_days TO authenticated;
GRANT ALL
  ON public.domestic_trip_settlements, public.domestic_trip_days TO service_role;

-- ------------------------------------------------------------
-- 저장 RPC — 정산월 한 달치를 한 번에(트랜잭션) 저장한다
--
-- 화면은 "그 달의 입력된 날 전부"를 p_days로 보내고, 서버는 그 목록을 정답으로 취급한다.
--   - 목록에 있는 날짜  : 추가 또는 갱신
--   - 목록에 없는 날짜  : 삭제 (화면에서 "이 날 비우기"를 누른 날)
-- 헤더가 없으면 만든다. SECURITY INVOKER라서 위의 RLS가 그대로 적용된다.
--
-- p_days 각 원소: { date, lodging, from_place, to_place, route_s1, route_s2, route_s3,
--                   modes[], fare, toll, parking, purpose, km, round_trip }
-- 반환: 헤더의 updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_domestic_trip_settlement(
  p_year integer,
  p_month integer,
  p_rank_level integer,
  p_odometer_start integer,
  p_fuel_unit_price integer,
  p_days jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_updated timestamptz;
  v_end date;
  v_start date;
  v_days jsonb := coalesce(p_days, '[]'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_year NOT BETWEEN 2000 AND 2100 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid settlement month: %-%', p_year, p_month USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_days) <> 'array' THEN
    RAISE EXCEPTION 'p_days must be a json array' USING ERRCODE = '22023';
  END IF;
  -- 정산 기간은 최대 31일이라 그보다 많으면 잘못된 요청이다.
  IF jsonb_array_length(v_days) > 31 THEN
    RAISE EXCEPTION 'too many days: %', jsonb_array_length(v_days) USING ERRCODE = '22023';
  END IF;

  -- 정산 기간: 전월 16일 ~ 당월 15일
  v_end := make_date(p_year, p_month, 15);
  v_start := (make_date(p_year, p_month, 16) - interval '1 month')::date;

  -- 같은 날짜가 두 번 오거나 기간 밖 날짜가 있으면 거부한다.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_days) AS x(date date)
    GROUP BY x.date
    HAVING count(*) > 1 OR x.date IS NULL OR x.date < v_start OR x.date > v_end
  ) THEN
    RAISE EXCEPTION 'days must be unique and inside % ~ %', v_start, v_end USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domestic_trip_settlements AS s
    (user_id, year, month, rank_level, odometer_start, fuel_unit_price)
  VALUES
    (v_uid, p_year, p_month, p_rank_level, p_odometer_start, coalesce(p_fuel_unit_price, 240))
  ON CONFLICT (user_id, year, month) DO UPDATE
    SET rank_level = EXCLUDED.rank_level,
        odometer_start = EXCLUDED.odometer_start,
        fuel_unit_price = EXCLUDED.fuel_unit_price
  RETURNING s.id INTO v_id;

  -- 목록에 없는 날짜는 삭제
  DELETE FROM public.domestic_trip_days d
  WHERE d.settlement_id = v_id
    AND d.date NOT IN (SELECT x.date FROM jsonb_to_recordset(v_days) AS x(date date));

  -- 나머지는 추가/갱신
  INSERT INTO public.domestic_trip_days AS d
    (settlement_id, date, lodging, from_place, to_place, route_s1, route_s2, route_s3,
     modes, fare, toll, parking, purpose, km, round_trip)
  SELECT
    v_id,
    x.date,
    coalesce(x.lodging, 0),
    coalesce(x.from_place, ''),
    coalesce(x.to_place, ''),
    x.route_s1,
    x.route_s2,
    x.route_s3,
    coalesce(x.modes, '{}'),
    x.fare,
    x.toll,
    x.parking,
    coalesce(x.purpose, ''),
    x.km,
    coalesce(x.round_trip, true)
  FROM jsonb_to_recordset(v_days) AS x(
    date date, lodging smallint, from_place text, to_place text,
    route_s1 boolean, route_s2 boolean, route_s3 boolean,
    modes text[], fare integer, toll integer, parking integer,
    purpose text, km numeric, round_trip boolean
  )
  ON CONFLICT (settlement_id, date) DO UPDATE
    SET lodging = EXCLUDED.lodging,
        from_place = EXCLUDED.from_place,
        to_place = EXCLUDED.to_place,
        route_s1 = EXCLUDED.route_s1,
        route_s2 = EXCLUDED.route_s2,
        route_s3 = EXCLUDED.route_s3,
        modes = EXCLUDED.modes,
        fare = EXCLUDED.fare,
        toll = EXCLUDED.toll,
        parking = EXCLUDED.parking,
        purpose = EXCLUDED.purpose,
        km = EXCLUDED.km,
        round_trip = EXCLUDED.round_trip;

  -- 날짜 행만 바뀐 경우에도 헤더의 updated_at이 갱신되도록 한다.
  UPDATE public.domestic_trip_settlements
    SET updated_at = now()
    WHERE id = v_id
    RETURNING updated_at INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.save_domestic_trip_settlement(integer, integer, integer, integer, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_domestic_trip_settlement(integer, integer, integer, integer, integer, jsonb) TO authenticated, service_role;

-- ============================================================
-- 확인 절차 (적용 후 Supabase SQL Editor에서)
--
--   1) 테이블/함수가 생겼는지
--        select table_name from information_schema.tables
--         where table_name in ('domestic_trip_settlements', 'domestic_trip_days');
--        select proname from pg_proc where proname = 'save_domestic_trip_settlement';
--
--   2) RLS가 켜졌는지 (둘 다 true여야 한다)
--        select relname, relrowsecurity from pg_class
--         where relname in ('domestic_trip_settlements', 'domestic_trip_days');
--
--   3) 앱에서 /settlement 에 입력 → "저장됨"이 뜨면 위 두 테이블에 행이 생긴다.
-- ============================================================
