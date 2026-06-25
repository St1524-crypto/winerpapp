
-- 1) Rules table: maps an annual-fee SKU to upgrade behavior + optional free gift
CREATE TABLE public.annual_fee_vip_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  upgrade_days int NOT NULL DEFAULT 365,
  gift_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  gift_quantity int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sku)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_fee_vip_rules TO authenticated;
GRANT ALL ON public.annual_fee_vip_rules TO service_role;

ALTER TABLE public.annual_fee_vip_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_fee_rules_admin_manage"
  ON public.annual_fee_vip_rules FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  );

CREATE TRIGGER annual_fee_vip_rules_touch
  BEFORE UPDATE ON public.annual_fee_vip_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Logs table: idempotency for per-order upgrade
CREATE TABLE public.annual_fee_upgrade_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sku text NOT NULL,
  rule_id uuid REFERENCES public.annual_fee_vip_rules(id) ON DELETE SET NULL,
  upgrade_days int NOT NULL,
  vip_expires_before timestamptz,
  vip_expires_after timestamptz NOT NULL,
  gift_product_id uuid,
  gift_quantity int,
  status text NOT NULL DEFAULT 'applied',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_order_id, sku)
);

GRANT SELECT ON public.annual_fee_upgrade_logs TO authenticated;
GRANT ALL ON public.annual_fee_upgrade_logs TO service_role;

ALTER TABLE public.annual_fee_upgrade_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_fee_logs_admin_read"
  ON public.annual_fee_upgrade_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR user_id = auth.uid()
  );

-- 3) Seed default rule for YBL-HOME-0038 (365 days, no gift by default; admin can edit later)
INSERT INTO public.annual_fee_vip_rules (sku, upgrade_days, is_active, notes)
VALUES ('YBL-HOME-0038', 365, true, '年費商品自動升 VIP 365 天（預設規則）')
ON CONFLICT DO NOTHING;
