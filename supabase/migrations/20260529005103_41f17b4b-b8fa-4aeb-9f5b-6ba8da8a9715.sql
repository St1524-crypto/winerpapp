
-- 1. VIP 方案新增「推薦獎金比例」欄位（每個方案/等級可獨立設定）
ALTER TABLE public.vip_plans
  ADD COLUMN IF NOT EXISTS referral_rate_percent numeric NOT NULL DEFAULT 0;

-- 2. 訂單新增推薦人欄位（永久綁定，下單時快照）
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_referrer ON public.sales_orders(referrer_id);

-- 3. 推薦獎勵紀錄表（單一訂單只能結算一次，UNIQUE）
CREATE TABLE IF NOT EXISTS public.referral_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  rate_percent numeric NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'granted',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_logs_order_uniq UNIQUE (order_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_logs TO authenticated;
GRANT ALL ON public.referral_logs TO service_role;

ALTER TABLE public.referral_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrer view own logs" ON public.referral_logs
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

CREATE POLICY "Admin manage referral logs" ON public.referral_logs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'sales'::app_role));

CREATE INDEX IF NOT EXISTS idx_referral_logs_referrer ON public.referral_logs(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_logs_created ON public.referral_logs(created_at DESC);
