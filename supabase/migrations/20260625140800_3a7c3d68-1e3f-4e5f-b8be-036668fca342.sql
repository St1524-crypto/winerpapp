
-- Snapshot columns on sales_order_items
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS original_unit_price numeric,
  ADD COLUMN IF NOT EXISTS tier_reward_points integer,
  ADD COLUMN IF NOT EXISTS tier_min_qty integer,
  ADD COLUMN IF NOT EXISTS tier_max_qty integer,
  ADD COLUMN IF NOT EXISTS pricing_tier_visibility text;

-- Retail reward split ledger
CREATE TABLE IF NOT EXISTS public.retail_reward_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_item_id uuid REFERENCES public.sales_order_items(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_tier text,
  referrer_tier text,
  base_reward_points integer NOT NULL DEFAULT 0,
  buyer_points integer NOT NULL DEFAULT 0,
  referrer_points integer NOT NULL DEFAULT 0,
  buyer_share_pct numeric NOT NULL DEFAULT 10,
  referrer_share_pct numeric NOT NULL DEFAULT 90,
  referrer_withheld boolean NOT NULL DEFAULT false,
  withheld_reason text,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'released',
  notes text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retail_reward_splits_dedupe_key_uk UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_retail_reward_splits_order ON public.retail_reward_splits(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_retail_reward_splits_buyer ON public.retail_reward_splits(buyer_id);
CREATE INDEX IF NOT EXISTS idx_retail_reward_splits_referrer ON public.retail_reward_splits(referrer_id);

GRANT SELECT ON public.retail_reward_splits TO authenticated;
GRANT ALL ON public.retail_reward_splits TO service_role;

ALTER TABLE public.retail_reward_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retail_reward_splits_self_read"
  ON public.retail_reward_splits FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = referrer_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

CREATE TRIGGER trg_retail_reward_splits_touch
  BEFORE UPDATE ON public.retail_reward_splits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
