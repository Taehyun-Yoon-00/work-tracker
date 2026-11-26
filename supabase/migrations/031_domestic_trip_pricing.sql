-- ============================================================
-- 국내 출장 정산 — 단가표 · 차종별 유류 단가 · 양식 종류 확장
--
-- 030에서 코드에 고정해 두었던 단가를 DB로 옮긴다. 총괄 관리자/마스터가 출장 정산 화면의
-- "관리" 탭에서 수정한다 (쓰기는 서버 API(service role)만, 읽기는 로그인한 모두 가능).
--
--   domestic_trip_rates          직급별 숙박비(A/B)·일당. "적용 시작월" 단위로 버전을 쌓는다.
--                                어떤 달의 단가 = 그 달 이전(포함)에 시작한 버전 중 가장 최근 것.
--                                → 단가를 바꿔도 이미 지난 달 정산이 바뀌지 않는다.
--   domestic_trip_vehicle_types  차종 구분(가솔린 1990cc 이상 …). 관리자가 추가/이름 변경/비활성화.
--   domestic_trip_fuel_prices    정산월 × 차종별 km당 단가(유류비). 매월 바뀌므로 월 단위로 입력한다.
--                                해당 월 값이 없으면 그 이전 달 중 가장 최근 값을 쓴다(전월 값 이월).
--
--   내 정산(domestic_trip_settlements)에는 차종(vehicle_type_id)을 저장한다.
--   목록에 없는 차량이면 차종을 비우고 km 단가를 직접 입력(fuel_unit_price)한다.
--
-- 양식 파일은 기존 report_templates에 kind='domestic_trip'으로 둔다(서포트리스트/근무관리표와 같은 방식).
--
-- 반복 실행해도 안전하다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 양식 종류 확장
-- ------------------------------------------------------------
ALTER TABLE public.report_templates DROP CONSTRAINT IF EXISTS report_templates_kind_check;
ALTER TABLE public.report_templates
  ADD CONSTRAINT report_templates_kind_check
  CHECK (kind IN ('support_list', 'attendance', 'domestic_trip'));

-- ------------------------------------------------------------
-- 2) 직급별 단가표 (적용 시작월 버전)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domestic_trip_rates (
  effective_year smallint NOT NULL,
  effective_month smallint NOT NULL,
  rank_level smallint NOT NULL,          -- 1=사원 2=선임 3=책임 4=수석
  lodging_a integer NOT NULL,            -- 숙박비 A (양식 AT열=1)
  lodging_b integer NOT NULL,            -- 숙박비 B (양식 AT열=2)
  allowance integer NOT NULL,            -- 일당 (숙박이 있는 날)
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domestic_trip_rates_pkey PRIMARY KEY (effective_year, effective_month, rank_level),
  CONSTRAINT domestic_trip_rates_year_chk CHECK (effective_year BETWEEN 2000 AND 2100),
  CONSTRAINT domestic_trip_rates_month_chk CHECK (effective_month BETWEEN 1 AND 12),
  CONSTRAINT domestic_trip_rates_rank_chk CHECK (rank_level BETWEEN 1 AND 4),
  CONSTRAINT domestic_trip_rates_amount_chk CHECK (lodging_a >= 0 AND lodging_b >= 0 AND allowance >= 0)
);

-- ------------------------------------------------------------
-- 3) 차종
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domestic_trip_vehicle_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  -- 비활성이면 새 정산의 선택 목록에서만 빠진다 (이미 그 차종으로 저장한 달은 그대로 계산된다)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domestic_trip_vehicle_types_pkey PRIMARY KEY (id),
  CONSTRAINT domestic_trip_vehicle_types_label_key UNIQUE (label),
  CONSTRAINT domestic_trip_vehicle_types_label_chk CHECK (char_length(btrim(label)) BETWEEN 1 AND 50)
);

-- ------------------------------------------------------------
-- 4) 월별 차종별 km당 단가
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domestic_trip_fuel_prices (
  year smallint NOT NULL,
  month smallint NOT NULL,               -- 정산월(당월). 2026-11 = 10/16~11/15 정산분
  vehicle_type_id uuid NOT NULL REFERENCES public.domestic_trip_vehicle_types(id) ON DELETE CASCADE,
  price integer NOT NULL,                -- km당 원
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domestic_trip_fuel_prices_pkey PRIMARY KEY (year, month, vehicle_type_id),
  CONSTRAINT domestic_trip_fuel_prices_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT domestic_trip_fuel_prices_month_chk CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT domestic_trip_fuel_prices_price_chk CHECK (price >= 0)
);

-- ------------------------------------------------------------
-- 5) RLS — 읽기만 열어 둔다
--    단가는 개인 정보가 아니고 모든 사용자의 화면에서 금액 계산에 쓰이므로 로그인한 사용자는
--    모두 읽을 수 있다. 쓰기 정책은 일부러 두지 않았다 → 브라우저에서는 수정할 수 없고,
--    /api/admin/domestic-trip-pricing(service role)이 총괄 관리자/마스터 확인 뒤에만 쓴다.
-- ------------------------------------------------------------
ALTER TABLE public.domestic_trip_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domestic_trip_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domestic_trip_fuel_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domestic_trip_rates_select ON public.domestic_trip_rates;
CREATE POLICY domestic_trip_rates_select
  ON public.domestic_trip_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS domestic_trip_vehicle_types_select ON public.domestic_trip_vehicle_types;
CREATE POLICY domestic_trip_vehicle_types_select
  ON public.domestic_trip_vehicle_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS domestic_trip_fuel_prices_select ON public.domestic_trip_fuel_prices;
CREATE POLICY domestic_trip_fuel_prices_select
  ON public.domestic_trip_fuel_prices FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.domestic_trip_rates, public.domestic_trip_vehicle_types,
  public.domestic_trip_fuel_prices TO authenticated;
GRANT ALL ON public.domestic_trip_rates, public.domestic_trip_vehicle_types,
  public.domestic_trip_fuel_prices TO service_role;

-- ------------------------------------------------------------
-- 6) 초기 데이터
--    기존 양식(国内出張旅費精算)의 수식에 들어 있던 직급별 금액과, 안내받은 차종별 단가를 넣는다.
--    관리 탭에서 언제든 바꿀 수 있다. 이미 값이 있으면 건드리지 않는다.
-- ------------------------------------------------------------
-- 직급별 단가: 2000-01부터 적용 → 어떤 달이든 이 값이 기본으로 잡힌다.
INSERT INTO public.domestic_trip_rates
  (effective_year, effective_month, rank_level, lodging_a, lodging_b, allowance)
VALUES
  (2000, 1, 1, 62000, 18000, 20000),
  (2000, 1, 2, 65000, 18000, 22000),
  (2000, 1, 3, 68000, 18000, 23000),
  (2000, 1, 4, 70000, 18000, 24000)
ON CONFLICT DO NOTHING;

INSERT INTO public.domestic_trip_vehicle_types (label, sort_order) VALUES
  ('가솔린 1990cc 이상', 10),
  ('가솔린 1990cc 미만', 20),
  ('디젤 1990cc 이상', 30),
  ('디젤 1990cc 미만', 40),
  ('가스 1990cc 이상', 50),
  ('가스 1990cc 미만', 60),
  ('전기', 70)
ON CONFLICT (label) DO NOTHING;

-- 유류 단가: 2026년 11월분부터. 이후 달은 새로 입력하기 전까지 이 값이 이월되어 적용된다.
INSERT INTO public.domestic_trip_fuel_prices (year, month, vehicle_type_id, price)
SELECT 2026, 11, t.id, v.price
FROM (VALUES
  ('가솔린 1990cc 이상', 260),
  ('가솔린 1990cc 미만', 220),
  ('디젤 1990cc 이상', 240),
  ('디젤 1990cc 미만', 210),
  ('가스 1990cc 이상', 220),
  ('가스 1990cc 미만', 180),
  ('전기', 170)
) AS v(label, price)
JOIN public.domestic_trip_vehicle_types t ON t.label = v.label
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7) 내 정산에 차종 저장
--    vehicle_type_id가 있으면 km 단가는 월별 유류 단가표에서 가져온다(fuel_unit_price는 NULL).
--    vehicle_type_id가 없으면 fuel_unit_price(직접 입력)를 쓴다.
--    030에서 만든 기존 행은 fuel_unit_price가 그대로 남아 "직접 입력"으로 취급된다.
-- ------------------------------------------------------------
ALTER TABLE public.domestic_trip_settlements
  ADD COLUMN IF NOT EXISTS vehicle_type_id uuid
    REFERENCES public.domestic_trip_vehicle_types(id) ON DELETE SET NULL;

ALTER TABLE public.domestic_trip_settlements ALTER COLUMN fuel_unit_price DROP NOT NULL;
ALTER TABLE public.domestic_trip_settlements ALTER COLUMN fuel_unit_price DROP DEFAULT;

-- ------------------------------------------------------------
-- 8) 저장 RPC 교체 — 차종 인자 추가 (030의 6개 인자 버전은 지운다)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_domestic_trip_settlement(integer, integer, integer, integer, integer, jsonb);

CREATE OR REPLACE FUNCTION public.save_domestic_trip_settlement(
  p_year integer,
  p_month integer,
  p_rank_level integer,
  p_odometer_start integer,
  p_vehicle_type_id uuid,
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
  IF jsonb_array_length(v_days) > 31 THEN
    RAISE EXCEPTION 'too many days: %', jsonb_array_length(v_days) USING ERRCODE = '22023';
  END IF;

  -- 정산 기간: 전월 16일 ~ 당월 15일
  v_end := make_date(p_year, p_month, 15);
  v_start := (make_date(p_year, p_month, 16) - interval '1 month')::date;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(v_days) AS x(date date)
    GROUP BY x.date
    HAVING count(*) > 1 OR x.date IS NULL OR x.date < v_start OR x.date > v_end
  ) THEN
    RAISE EXCEPTION 'days must be unique and inside % ~ %', v_start, v_end USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domestic_trip_settlements AS s
    (user_id, year, month, rank_level, odometer_start, vehicle_type_id, fuel_unit_price)
  VALUES
    (v_uid, p_year, p_month, p_rank_level, p_odometer_start, p_vehicle_type_id,
     CASE WHEN p_vehicle_type_id IS NULL THEN p_fuel_unit_price ELSE NULL END)
  ON CONFLICT (user_id, year, month) DO UPDATE
    SET rank_level = EXCLUDED.rank_level,
        odometer_start = EXCLUDED.odometer_start,
        vehicle_type_id = EXCLUDED.vehicle_type_id,
        fuel_unit_price = EXCLUDED.fuel_unit_price
  RETURNING s.id INTO v_id;

  DELETE FROM public.domestic_trip_days d
  WHERE d.settlement_id = v_id
    AND d.date NOT IN (SELECT x.date FROM jsonb_to_recordset(v_days) AS x(date date));

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

  UPDATE public.domestic_trip_settlements
    SET updated_at = now()
    WHERE id = v_id
    RETURNING updated_at INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.save_domestic_trip_settlement(integer, integer, integer, integer, uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_domestic_trip_settlement(integer, integer, integer, integer, uuid, integer, jsonb) TO authenticated, service_role;

-- ============================================================
-- 확인 절차 (적용 후 Supabase SQL Editor에서)
--   select count(*) from domestic_trip_rates;           -- 4 (직급별 기본 단가)
--   select label from domestic_trip_vehicle_types order by sort_order;   -- 7개 차종
--   select count(*) from domestic_trip_fuel_prices;     -- 7 (2026-11)
--   select proname, pronargs from pg_proc where proname = 'save_domestic_trip_settlement';   -- 7개 인자 1건
-- ============================================================
