CREATE TABLE public.product_wholesale_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty integer NOT NULL CHECK (min_qty >= 1),
  max_qty integer CHECK (max_qty IS NULL OR max_qty >= min_qty),
  unit_price numeric NOT NULL DEFAULT 0,
  unit_reward_points integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pwt_product_minqty ON public.product_wholesale_tiers(product_id, min_qty);

GRANT SELECT ON public.product_wholesale_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_wholesale_tiers TO authenticated;
GRANT ALL ON public.product_wholesale_tiers TO service_role;

ALTER TABLE public.product_wholesale_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view wholesale tiers"
ON public.product_wholesale_tiers
FOR SELECT
USING (true);

CREATE POLICY "Admins manage wholesale tiers (insert)"
ON public.product_wholesale_tiers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage wholesale tiers (update)"
ON public.product_wholesale_tiers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage wholesale tiers (delete)"
ON public.product_wholesale_tiers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pwt_touch_updated
BEFORE UPDATE ON public.product_wholesale_tiers
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();