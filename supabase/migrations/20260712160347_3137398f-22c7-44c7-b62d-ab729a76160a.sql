
CREATE TABLE public.repurchase_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_image text,
  bundle_price numeric(12,2) NOT NULL DEFAULT 0,
  bundle_reward_points integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','vip','dealer')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('active','inactive','draft')),
  start_at timestamptz,
  end_at timestamptz,
  max_per_order integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.repurchase_bundles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repurchase_bundles TO authenticated;
GRANT ALL ON public.repurchase_bundles TO service_role;

ALTER TABLE public.repurchase_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bundles_public_read_active"
ON public.repurchase_bundles FOR SELECT
TO anon, authenticated
USING (
  status = 'active'
  AND (start_at IS NULL OR start_at <= now())
  AND (end_at IS NULL OR end_at > now())
  AND (
    visibility = 'all'
    OR (visibility = 'vip' AND auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_vip = true
        AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now())
    ))
    OR (visibility = 'dealer' AND auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.dealer_tier_status d WHERE d.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "bundles_admin_all"
ON public.repurchase_bundles FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

CREATE OR REPLACE FUNCTION public.tg_repurchase_bundles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER repurchase_bundles_set_updated_at
BEFORE UPDATE ON public.repurchase_bundles
FOR EACH ROW EXECUTE FUNCTION public.tg_repurchase_bundles_updated_at();

CREATE TABLE public.repurchase_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.repurchase_bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, product_id)
);

GRANT SELECT ON public.repurchase_bundle_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repurchase_bundle_items TO authenticated;
GRANT ALL ON public.repurchase_bundle_items TO service_role;

ALTER TABLE public.repurchase_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bundle_items_public_read"
ON public.repurchase_bundle_items FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.repurchase_bundles b
    WHERE b.id = bundle_id
      AND b.status = 'active'
      AND (b.start_at IS NULL OR b.start_at <= now())
      AND (b.end_at IS NULL OR b.end_at > now())
      AND (
        b.visibility = 'all'
        OR (b.visibility = 'vip' AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.is_vip = true
            AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now())
        ))
        OR (b.visibility = 'dealer' AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.dealer_tier_status d WHERE d.user_id = auth.uid()
        ))
      )
  )
);

CREATE POLICY "bundle_items_admin_all"
ON public.repurchase_bundle_items FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.repurchase_bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bundle_line_key text;

CREATE INDEX IF NOT EXISTS idx_sales_order_items_bundle_line
  ON public.sales_order_items(sales_order_id, bundle_line_key)
  WHERE bundle_line_key IS NOT NULL;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES public.repurchase_bundles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bundle_line_key text;

CREATE INDEX IF NOT EXISTS idx_cart_items_bundle_line
  ON public.cart_items(cart_id, bundle_line_key)
  WHERE bundle_line_key IS NOT NULL;
