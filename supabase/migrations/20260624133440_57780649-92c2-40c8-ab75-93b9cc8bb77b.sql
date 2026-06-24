
-- 1. 欄位別名：保留既有 upgrade_bonus_cap，另加 upgrade_bonus_cap_amount 以對齊需求命名
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS upgrade_bonus_cap_amount numeric;

UPDATE public.vip_tiers
  SET upgrade_bonus_cap_amount = COALESCE(upgrade_bonus_cap_amount, upgrade_bonus_cap, 0);

-- 同步 trigger：兩個欄位保持一致（任一被更新就同步到另一個）
CREATE OR REPLACE FUNCTION public.sync_vip_tier_upgrade_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.upgrade_bonus_cap_amount IS DISTINCT FROM OLD.upgrade_bonus_cap_amount THEN
    NEW.upgrade_bonus_cap := NEW.upgrade_bonus_cap_amount;
  ELSIF NEW.upgrade_bonus_cap IS DISTINCT FROM OLD.upgrade_bonus_cap THEN
    NEW.upgrade_bonus_cap_amount := NEW.upgrade_bonus_cap;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vip_tier_upgrade_cap ON public.vip_tiers;
CREATE TRIGGER trg_sync_vip_tier_upgrade_cap
  BEFORE UPDATE ON public.vip_tiers
  FOR EACH ROW EXECUTE FUNCTION public.sync_vip_tier_upgrade_cap();

-- 2. Ledger 資料表
CREATE TABLE IF NOT EXISTS public.vip_upgrade_bonus_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,                -- 領取分紅的人（上線）
  source_member_id uuid,                  -- 觸發升級的會員
  source_order_id uuid,                   -- 對應 vip_upgrade_orders / sales_orders
  tier_code text NOT NULL,                -- 領取當下會員的 VIP 階級
  bonus_amount numeric NOT NULL CHECK (bonus_amount >= 0),    -- 原應發
  payable_amount numeric NOT NULL CHECK (payable_amount >= 0),-- 實際發放
  capped_amount numeric NOT NULL CHECK (capped_amount >= 0),  -- 被上限截斷
  total_before numeric NOT NULL CHECK (total_before >= 0),    -- 發放前累計
  total_after numeric NOT NULL CHECK (total_after >= 0),      -- 發放後累計
  cap_amount numeric NOT NULL CHECK (cap_amount >= 0),        -- 當時上限
  status text NOT NULL CHECK (status IN ('released','partial_capped','skipped_capped')),
  bonus_record_id uuid,                   -- 真實發放時連結 bonus_records
  dedupe_key text,                        -- 防重複用（例如 source_order_id+member_id）
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vip_upgrade_bonus_ledger_dedupe
  ON public.vip_upgrade_bonus_ledger(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vubl_member ON public.vip_upgrade_bonus_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_vubl_source_member ON public.vip_upgrade_bonus_ledger(source_member_id);
CREATE INDEX IF NOT EXISTS idx_vubl_source_order ON public.vip_upgrade_bonus_ledger(source_order_id);
CREATE INDEX IF NOT EXISTS idx_vubl_created ON public.vip_upgrade_bonus_ledger(created_at DESC);

GRANT SELECT ON public.vip_upgrade_bonus_ledger TO authenticated;
GRANT ALL ON public.vip_upgrade_bonus_ledger TO service_role;

ALTER TABLE public.vip_upgrade_bonus_ledger ENABLE ROW LEVEL SECURITY;

-- 會員可看自己；管理員 / 財務可看全部
CREATE POLICY "member can read own upgrade bonus ledger"
  ON public.vip_upgrade_bonus_ledger
  FOR SELECT TO authenticated
  USING (member_id = auth.uid());

CREATE POLICY "admin can read all upgrade bonus ledger"
  ON public.vip_upgrade_bonus_ledger
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- 寫入只開放給 service_role / SECURITY DEFINER 函式
CREATE TRIGGER trg_vubl_updated_at
  BEFORE UPDATE ON public.vip_upgrade_bonus_ledger
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. 取得會員 VIP 階級代碼（從 profiles.legacy_rank 或 extra）
CREATE OR REPLACE FUNCTION public.get_member_vip_tier_code(_member_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(COALESCE(p.legacy_rank, ''))
  FROM public.profiles p
  WHERE p.id = _member_id
$$;

-- 4. 累計已領升級分紅
CREATE OR REPLACE FUNCTION public.get_member_upgrade_bonus_total(_member_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(payable_amount), 0)::numeric
  FROM public.vip_upgrade_bonus_ledger
  WHERE member_id = _member_id
    AND status IN ('released','partial_capped')
$$;

-- 5. 取得會員當前升級分紅上限
CREATE OR REPLACE FUNCTION public.get_member_upgrade_bonus_cap(_member_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(vt.upgrade_bonus_cap_amount, vt.upgrade_bonus_cap, 0)::numeric
  FROM public.vip_tiers vt
  WHERE vt.code = public.get_member_vip_tier_code(_member_id)
  LIMIT 1
$$;

-- 6. 純計算（不寫入），供前後台預覽
CREATE OR REPLACE FUNCTION public.calc_upgrade_bonus_release(
  _member_id uuid,
  _tier_code text,
  _bonus_amount numeric
)
RETURNS TABLE(
  bonus_amount numeric,
  payable_amount numeric,
  capped_amount numeric,
  total_before numeric,
  total_after numeric,
  cap_amount numeric,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cap numeric;
  _before numeric;
  _remain numeric;
  _payable numeric;
  _capped numeric;
  _status text;
BEGIN
  IF _bonus_amount IS NULL OR _bonus_amount < 0 THEN
    _bonus_amount := 0;
  END IF;

  SELECT COALESCE(vt.upgrade_bonus_cap_amount, vt.upgrade_bonus_cap, 0)
    INTO _cap
  FROM public.vip_tiers vt
  WHERE vt.code = upper(_tier_code)
  LIMIT 1;
  _cap := COALESCE(_cap, 0);

  _before := public.get_member_upgrade_bonus_total(_member_id);
  _remain := GREATEST(_cap - _before, 0);

  IF _cap = 0 THEN
    -- 該階級未設定上限 → 全額發放
    _payable := _bonus_amount;
    _capped := 0;
    _status := 'released';
  ELSIF _remain <= 0 THEN
    _payable := 0;
    _capped := _bonus_amount;
    _status := 'skipped_capped';
  ELSIF _bonus_amount <= _remain THEN
    _payable := _bonus_amount;
    _capped := 0;
    _status := 'released';
  ELSE
    _payable := _remain;
    _capped := _bonus_amount - _remain;
    _status := 'partial_capped';
  END IF;

  RETURN QUERY SELECT
    _bonus_amount,
    _payable,
    _capped,
    _before,
    _before + _payable,
    _cap,
    _status;
END;
$$;

-- 7. 寫入紀錄（供測試 / 後續核心流程使用）
--    具備：上限檢查、不可超發、dedupe_key 防重複
CREATE OR REPLACE FUNCTION public.record_upgrade_bonus_release(
  _member_id uuid,
  _bonus_amount numeric,
  _source_member_id uuid DEFAULT NULL,
  _source_order_id uuid DEFAULT NULL,
  _tier_code text DEFAULT NULL,
  _dedupe_key text DEFAULT NULL,
  _bonus_record_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.vip_upgrade_bonus_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text;
  _calc record;
  _row public.vip_upgrade_bonus_ledger;
  _existing public.vip_upgrade_bonus_ledger;
BEGIN
  IF _member_id IS NULL THEN
    RAISE EXCEPTION 'member_id required';
  END IF;

  -- 防重複
  IF _dedupe_key IS NOT NULL THEN
    SELECT * INTO _existing
    FROM public.vip_upgrade_bonus_ledger
    WHERE dedupe_key = _dedupe_key
    LIMIT 1;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  _tier := upper(COALESCE(NULLIF(_tier_code, ''), public.get_member_vip_tier_code(_member_id)));

  -- 鎖該會員的 ledger 列，避免併發超發
  PERFORM 1
  FROM public.vip_upgrade_bonus_ledger
  WHERE member_id = _member_id
  FOR UPDATE;

  SELECT * INTO _calc
  FROM public.calc_upgrade_bonus_release(_member_id, _tier, _bonus_amount);

  INSERT INTO public.vip_upgrade_bonus_ledger(
    member_id, source_member_id, source_order_id, tier_code,
    bonus_amount, payable_amount, capped_amount,
    total_before, total_after, cap_amount, status,
    bonus_record_id, dedupe_key, notes, created_by
  ) VALUES (
    _member_id, _source_member_id, _source_order_id, _tier,
    _calc.bonus_amount, _calc.payable_amount, _calc.capped_amount,
    _calc.total_before, _calc.total_after, _calc.cap_amount, _calc.status,
    _bonus_record_id, _dedupe_key, _notes, auth.uid()
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_upgrade_bonus_release(uuid, numeric, uuid, uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_upgrade_bonus_release(uuid, numeric, uuid, uuid, text, text, uuid, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.calc_upgrade_bonus_release(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_upgrade_bonus_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_upgrade_bonus_cap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_vip_tier_code(uuid) TO authenticated;
