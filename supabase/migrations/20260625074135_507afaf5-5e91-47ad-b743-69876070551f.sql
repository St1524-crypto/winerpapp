-- Phase 1: VIP wholesale tier visibility + server-side price quote

-- 1. Add visibility classification to existing tiers
ALTER TABLE public.product_wholesale_tiers
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'vip'
    CHECK (visibility IN ('all','vip','dealer'));

-- 2. Helper: is the caller an active VIP member?
CREATE OR REPLACE FUNCTION public.is_active_vip(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND COALESCE(p.is_vip, false) = true
      AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_dealer(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND COALESCE(p.is_dealer, false) = true
  );
$$;

-- 3. Add SELECT policy so VIP / dealer members can read tiers they're entitled to
DROP POLICY IF EXISTS "Members view entitled wholesale tiers" ON public.product_wholesale_tiers;
CREATE POLICY "Members view entitled wholesale tiers"
ON public.product_wholesale_tiers
FOR SELECT TO authenticated
USING (
  visibility = 'all'
  OR (visibility = 'vip' AND public.is_active_vip(auth.uid()))
  OR (visibility = 'dealer' AND public.is_active_dealer(auth.uid()))
);

-- 4. Server-side price quote (RLS-bypass via SECURITY DEFINER but caller-aware)
CREATE OR REPLACE FUNCTION public.quote_wholesale_price(_product_id uuid, _qty int)
RETURNS TABLE(
  unit_price numeric,
  unit_reward_points int,
  tier_min_qty int,
  tier_max_qty int,
  visibility text,
  applied boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_vip boolean := false;
  _is_dealer boolean := false;
  _base_price numeric;
BEGIN
  IF _qty IS NULL OR _qty < 1 THEN _qty := 1; END IF;

  IF _uid IS NOT NULL THEN
    _is_vip := public.is_active_vip(_uid);
    _is_dealer := public.is_active_dealer(_uid);
  END IF;

  SELECT p.price INTO _base_price FROM public.products p
   WHERE p.id = _product_id AND p.status = 'active';
  IF _base_price IS NULL THEN
    RETURN; -- no rows
  END IF;

  RETURN QUERY
  SELECT t.unit_price, t.unit_reward_points, t.min_qty, t.max_qty, t.visibility, true
  FROM public.product_wholesale_tiers t
  WHERE t.product_id = _product_id
    AND _qty >= t.min_qty
    AND (t.max_qty IS NULL OR _qty <= t.max_qty)
    AND (
      t.visibility = 'all'
      OR (t.visibility = 'vip' AND _is_vip)
      OR (t.visibility = 'dealer' AND _is_dealer)
    )
  ORDER BY t.unit_price ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT _base_price, 0, NULL::int, NULL::int, 'none'::text, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.quote_wholesale_price(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_vip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_dealer(uuid) TO authenticated;