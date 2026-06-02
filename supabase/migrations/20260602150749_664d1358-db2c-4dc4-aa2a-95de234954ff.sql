-- 1) sales_orders: 訂單類型
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'normal'
  CHECK (order_type IN ('upgrade', 'repurchase', 'normal'));

CREATE INDEX IF NOT EXISTS idx_sales_orders_type_paid
  ON public.sales_orders (order_type, payment_status, user_id);

-- 2) 自動分類觸發器
CREATE OR REPLACE FUNCTION public.classify_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_vip boolean := false;
BEGIN
  IF NEW.order_type = 'upgrade' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    SELECT (vip_expires_at IS NOT NULL AND vip_expires_at > now())
      INTO _is_vip
    FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  NEW.order_type := CASE WHEN COALESCE(_is_vip, false) THEN 'repurchase' ELSE 'normal' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_sales_order ON public.sales_orders;
CREATE TRIGGER trg_classify_sales_order
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.classify_sales_order();

-- 3) dealer_tiers 升級訂單推薦獎金比例 (差額制)
ALTER TABLE public.dealer_tiers
  ADD COLUMN IF NOT EXISTS upgrade_referral_rate numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.dealer_tiers.upgrade_referral_rate IS
  '升級訂單推薦獎金 % (差額制：高階含低階)';

-- 4) 月度責任額累計表
CREATE TABLE IF NOT EXISTS public.monthly_responsibility_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ym text NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  source_order_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, ym)
);

GRANT SELECT ON public.monthly_responsibility_points TO authenticated;
GRANT ALL ON public.monthly_responsibility_points TO service_role;

ALTER TABLE public.monthly_responsibility_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view own monthly points"
  ON public.monthly_responsibility_points
  FOR SELECT TO authenticated
  USING (auth.uid() = member_id
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'super_admin')
         OR public.has_role(auth.uid(), 'finance'));

CREATE TRIGGER trg_monthly_resp_points_touch
  BEFORE UPDATE ON public.monthly_responsibility_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) bonus_records 索引
CREATE INDEX IF NOT EXISTS idx_bonus_records_member_status
  ON public.bonus_records (member_id, status);
CREATE INDEX IF NOT EXISTS idx_bonus_records_source_order
  ON public.bonus_records (source_order_id);

-- 6) 初始化既有 dealer_tiers 升級獎金比例 (依排序遞增)
WITH ranked AS (
  SELECT code, ROW_NUMBER() OVER (ORDER BY sort_order, required_pv, name) * 5 AS rate
  FROM public.dealer_tiers
)
UPDATE public.dealer_tiers d
SET upgrade_referral_rate = ranked.rate
FROM ranked
WHERE d.code = ranked.code
  AND d.upgrade_referral_rate = 0;