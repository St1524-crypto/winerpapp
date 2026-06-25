
-- VIP 升級套組綁定商品 → 走購物車流程
ALTER TABLE public.vip_upgrade_packages
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vip_upgrade_packages_product_id
  ON public.vip_upgrade_packages(product_id);

-- 訂單付款後升級紀錄（冪等）
CREATE TABLE IF NOT EXISTS public.vip_package_upgrade_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.vip_upgrade_packages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tier_code text NOT NULL,
  previous_tier text,
  new_tier text,
  vip_expires_before timestamptz,
  vip_expires_after timestamptz,
  bonus_points integer NOT NULL DEFAULT 0,
  upgraded boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'applied',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, package_id)
);

GRANT SELECT ON public.vip_package_upgrade_logs TO authenticated;
GRANT ALL ON public.vip_package_upgrade_logs TO service_role;

ALTER TABLE public.vip_package_upgrade_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own vip package logs"
  ON public.vip_package_upgrade_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role));
