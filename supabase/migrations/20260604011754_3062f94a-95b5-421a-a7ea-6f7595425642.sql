
-- 1. Drop overly-permissive USING (true) SELECT policies on sensitive config tables
DROP POLICY IF EXISTS "bonus_settings read all auth" ON public.bonus_settings;
DROP POLICY IF EXISTS "Authenticated view dealer settings" ON public.dealer_program_settings;
DROP POLICY IF EXISTS "Authenticated view tiers" ON public.dealer_tiers;
DROP POLICY IF EXISTS "Authenticated can read monthly tier bonus" ON public.monthly_tier_bonus_settings;
DROP POLICY IF EXISTS "rr read all auth" ON public.rank_rebate_settings;
DROP POLICY IF EXISTS "rb read all auth" ON public.repurchase_bonus_settings;
DROP POLICY IF EXISTS "Authenticated view settings" ON public.system_settings;

-- 2. Restrict products SELECT for authenticated to active rows only (matches anon visibility);
--    remove the USING (true) blanket read.
DROP POLICY IF EXISTS "Authenticated view products" ON public.products;
CREATE POLICY "Authenticated view active products"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  );

-- 3. Revoke cost_price column SELECT from anon/authenticated; staff fetch it via
--    SECURITY DEFINER function public.get_product_costs(_ids uuid[]).
REVOKE SELECT (cost_price) ON public.products FROM anon, authenticated;

-- 4. Restrict id_no (national ID) on profiles to super_admin/admin only via column-level revoke.
--    Other roles (sales) keep row access but lose id_no column visibility.
REVOKE SELECT (id_no) ON public.profiles FROM anon, authenticated;
GRANT SELECT (id_no) ON public.profiles TO service_role;
-- Provide an admin-only SECURITY DEFINER accessor for legitimate id_no reads.
CREATE OR REPLACE FUNCTION public.get_profile_id_no(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id_no
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_profile_id_no(uuid) TO authenticated;

-- 5. login_attempts: add INSERT policies so authenticated login flow can record
--    attempts (service_role always bypasses RLS, but covers client-driven inserts too).
CREATE POLICY "Anyone can insert login attempts"
  ON public.login_attempts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 6. Storage: expose product-images bucket reads to anon + authenticated so the
--    storefront/list calls work (bucket is public; this just enables the storage API).
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');
