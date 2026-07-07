
-- 1) categories: remove permissive USING true
DROP POLICY IF EXISTS "Authenticated view categories" ON public.categories;

-- 2) product_wholesale_tiers: scope by product.company_id
DROP POLICY IF EXISTS "Members view entitled wholesale tiers" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Public read retail tiers" ON public.product_wholesale_tiers;

CREATE POLICY "Members view entitled wholesale tiers"
  ON public.product_wholesale_tiers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (
          private.has_role(auth.uid(), 'super_admin'::app_role)
          OR p.company_id IS NULL
          OR p.company_id = private.current_company_id()
        )
    )
    AND (
      (visibility = 'all'::text)
      OR ((visibility = 'vip'::text) AND is_active_vip(auth.uid()))
      OR ((visibility = 'dealer'::text) AND is_active_dealer(auth.uid()))
    )
  );

CREATE POLICY "Public read retail tiers"
  ON public.product_wholesale_tiers
  FOR SELECT
  TO anon
  USING (
    visibility = 'all'::text
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND p.status = 'active'
    )
  );

-- 3) storage: branding read policy must verify company membership for companies/ prefix
DROP POLICY IF EXISTS "Branding read scoped" ON storage.objects;
CREATE POLICY "Branding read scoped"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'branding'::text
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (storage.foldername(name))[1] = 'companies'::text
        AND auth.uid() IS NOT NULL
        AND private.is_company_member(
          (NULLIF((storage.foldername(name))[2], ''::text))::uuid,
          auth.uid()
        )
      )
      OR (
        auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = 'pending'::text
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
    )
  );

-- 4) quotes: explicitly revoke anon access; document public_token handling
REVOKE ALL ON public.quotes FROM anon;
COMMENT ON COLUMN public.quotes.public_token IS
  'Opaque token for public quote sharing. Do NOT add a permissive anon SELECT policy on public.quotes. Any public quote view must go through a SECURITY DEFINER function or view that verifies the exact token match and returns only the intended columns.';
