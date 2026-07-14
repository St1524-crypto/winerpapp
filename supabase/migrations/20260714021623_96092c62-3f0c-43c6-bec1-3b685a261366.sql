
-- 1) 更新 V4 上限
UPDATE public.dealer_tiers SET upgrade_bonus_cap = 668000 WHERE code = 'V4';

-- 2) 每日營業分紅發放明細表
CREATE TABLE IF NOT EXISTS public.vip_daily_revenue_bonus_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  distribution_date DATE NOT NULL,
  member_id UUID NOT NULL,
  tier_code TEXT NOT NULL,
  daily_total_reward_points NUMERIC NOT NULL DEFAULT 0,
  pool_percentage NUMERIC NOT NULL DEFAULT 5,
  eligible_member_count INTEGER NOT NULL DEFAULT 0,
  allocated_amount NUMERIC NOT NULL DEFAULT 0,
  payable_amount NUMERIC NOT NULL DEFAULT 0,
  capped_amount NUMERIC NOT NULL DEFAULT 0,
  total_before NUMERIC NOT NULL DEFAULT 0,
  total_after NUMERIC NOT NULL DEFAULT 0,
  cap_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'released',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_rev_bonus UNIQUE (distribution_date, member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_daily_revenue_bonus_ledger TO authenticated;
GRANT ALL ON public.vip_daily_revenue_bonus_ledger TO service_role;

ALTER TABLE public.vip_daily_revenue_bonus_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read daily revenue bonus ledger"
ON public.vip_daily_revenue_bonus_ledger FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
);

CREATE POLICY "Staff manage daily revenue bonus ledger"
ON public.vip_daily_revenue_bonus_ledger FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_daily_rev_bonus_date ON public.vip_daily_revenue_bonus_ledger (distribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_rev_bonus_member ON public.vip_daily_revenue_bonus_ledger (member_id);

CREATE TRIGGER trg_daily_rev_bonus_updated
BEFORE UPDATE ON public.vip_daily_revenue_bonus_ledger
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) 每日發放 RPC
CREATE OR REPLACE FUNCTION public.distribute_daily_revenue_bonus(_date DATE DEFAULT (CURRENT_DATE - 1))
RETURNS TABLE (
  distribution_date DATE,
  total_reward_points NUMERIC,
  pool_amount NUMERIC,
  eligible_count INTEGER,
  per_head_amount NUMERIC,
  distributed_amount NUMERIC,
  capped_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total_points NUMERIC := 0;
  _pool NUMERIC := 0;
  _count INTEGER := 0;
  _per_head NUMERIC := 0;
  _distributed NUMERIC := 0;
  _capped NUMERIC := 0;
  _pool_pct NUMERIC := 5;
  _member RECORD;
  _cap NUMERIC;
  _current_total NUMERIC;
  _remaining NUMERIC;
  _payable NUMERIC;
  _capped_amt NUMERIC;
  _status TEXT;
BEGIN
  -- 當日訂單獎勵點（point_transactions 中 source='order_earn' 或 'order_earn_referrer' 的 reward 加總）
  SELECT COALESCE(SUM(amount), 0) INTO _total_points
  FROM public.point_transactions
  WHERE point_type = 'reward'
    AND source IN ('order_earn', 'order_earn_referrer')
    AND created_at >= _date::timestamptz
    AND created_at < (_date + 1)::timestamptz;

  _pool := ROUND(_total_points * _pool_pct / 100.0, 0);

  -- 有效會員：dealer_tier_status 目前階級為 V1~V8
  SELECT COUNT(*) INTO _count
  FROM public.dealer_tier_status s
  WHERE s.current_tier IN ('V1','V2','V3','V4','V5','V6','V7','V8');

  IF _count = 0 OR _pool <= 0 THEN
    RETURN QUERY SELECT _date, _total_points, _pool, _count, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  _per_head := ROUND(_pool / _count, 0);

  FOR _member IN
    SELECT s.member_id, s.current_tier AS tier_code, t.upgrade_bonus_cap AS cap
    FROM public.dealer_tier_status s
    JOIN public.dealer_tiers t ON t.code = s.current_tier
    WHERE s.current_tier IN ('V1','V2','V3','V4','V5','V6','V7','V8')
  LOOP
    -- 跳過同日已發者
    IF EXISTS (SELECT 1 FROM public.vip_daily_revenue_bonus_ledger
               WHERE distribution_date = _date AND member_id = _member.member_id) THEN
      CONTINUE;
    END IF;

    _cap := COALESCE(_member.cap, 0);

    -- 讀取該會員累計已發（來自 vip_upgrade_bonus_ledger）
    SELECT COALESCE(SUM(payable_amount), 0) INTO _current_total
    FROM public.vip_upgrade_bonus_ledger
    WHERE member_id = _member.member_id
      AND status IN ('released','partial_capped');

    _remaining := GREATEST(_cap - _current_total, 0);
    _payable := LEAST(_per_head, _remaining);
    _capped_amt := _per_head - _payable;

    IF _payable <= 0 THEN
      _status := 'capped';
    ELSIF _capped_amt > 0 THEN
      _status := 'partial_capped';
    ELSE
      _status := 'released';
    END IF;

    INSERT INTO public.vip_daily_revenue_bonus_ledger (
      distribution_date, member_id, tier_code,
      daily_total_reward_points, pool_percentage, eligible_member_count,
      allocated_amount, payable_amount, capped_amount,
      total_before, total_after, cap_amount, status,
      notes
    ) VALUES (
      _date, _member.member_id, _member.tier_code,
      _total_points, _pool_pct, _count,
      _per_head, _payable, _capped_amt,
      _current_total, _current_total + _payable, _cap, _status,
      format('每日營業分紅：池 %s × 5%% = %s ÷ %s 人 = %s，實發 %s', _total_points, _pool, _count, _per_head, _payable)
    );

    -- 同步寫入 upgrade_bonus_ledger 以維持累計上限判斷一致
    IF _payable > 0 THEN
      INSERT INTO public.vip_upgrade_bonus_ledger (
        member_id, tier_code, bonus_amount, payable_amount, capped_amount,
        total_before, total_after, cap_amount, status,
        dedupe_key, notes
      ) VALUES (
        _member.member_id, _member.tier_code, _per_head, _payable, _capped_amt,
        _current_total, _current_total + _payable, _cap, _status,
        'daily_rev:' || _date::text || ':' || _member.member_id::text,
        '每日營業分紅池分配'
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

    _distributed := _distributed + _payable;
    _capped := _capped + _capped_amt;
  END LOOP;

  RETURN QUERY SELECT _date, _total_points, _pool, _count, _per_head, _distributed, _capped;
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_daily_revenue_bonus(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.distribute_daily_revenue_bonus(DATE) TO authenticated, service_role;

-- 4) pg_cron 每日排程（00:10 執行前一天）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('daily_revenue_bonus_distribute')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_revenue_bonus_distribute');
    PERFORM cron.schedule(
      'daily_revenue_bonus_distribute',
      '10 0 * * *',
      $sql$SELECT public.distribute_daily_revenue_bonus((CURRENT_DATE - 1));$sql$
    );
  END IF;
END $$;
