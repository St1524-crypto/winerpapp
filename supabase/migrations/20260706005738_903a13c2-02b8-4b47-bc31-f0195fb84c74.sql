-- Harden quote tenant isolation and member storefront public reads.
DROP POLICY IF EXISTS "qcs admin manage" ON public.quote_company_settings;
DROP POLICY IF EXISTS "qcs sales staff read" ON public.quote_company_settings;
DROP POLICY IF EXISTS "qcs tenant admin manage" ON public.quote_company_settings;
DROP POLICY IF EXISTS "qcs tenant staff read" ON public.quote_company_settings;

CREATE POLICY "qcs tenant admin manage"
ON public.quote_company_settings FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
);

CREATE POLICY "qcs tenant staff read"
ON public.quote_company_settings FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role)))
);

DROP POLICY IF EXISTS "qba admin manage" ON public.quote_bank_accounts;
DROP POLICY IF EXISTS "qba sales finance read" ON public.quote_bank_accounts;
DROP POLICY IF EXISTS "qba tenant admin manage" ON public.quote_bank_accounts;
DROP POLICY IF EXISTS "qba tenant staff read" ON public.quote_bank_accounts;

CREATE POLICY "qba tenant admin manage"
ON public.quote_bank_accounts FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
);

CREATE POLICY "qba tenant staff read"
ON public.quote_bank_accounts FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role) OR private.has_role(auth.uid(),'sales'::app_role)))
);

DROP POLICY IF EXISTS "quotes admin manage" ON public.quotes;
DROP POLICY IF EXISTS "quotes sales create" ON public.quotes;
DROP POLICY IF EXISTS "quotes sales read own" ON public.quotes;
DROP POLICY IF EXISTS "quotes sales update own non-converted" ON public.quotes;
DROP POLICY IF EXISTS "quotes public read by token" ON public.quotes;
DROP POLICY IF EXISTS "quotes tenant admin manage" ON public.quotes;
DROP POLICY IF EXISTS "quotes tenant sales create" ON public.quotes;
DROP POLICY IF EXISTS "quotes tenant sales read own" ON public.quotes;
DROP POLICY IF EXISTS "quotes tenant sales update own non-converted" ON public.quotes;

REVOKE SELECT ON public.quotes FROM anon;

CREATE POLICY "quotes tenant admin manage"
ON public.quotes FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id()
      AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))
);

CREATE POLICY "quotes tenant sales create"
ON public.quotes FOR INSERT TO authenticated
WITH CHECK (
  company_id = private.current_company_id()
  AND private.has_role(auth.uid(),'sales'::app_role)
  AND created_by = auth.uid()
);

CREATE POLICY "quotes tenant sales read own"
ON public.quotes FOR SELECT TO authenticated
USING (
  company_id = private.current_company_id()
  AND private.has_role(auth.uid(),'sales'::app_role)
  AND (created_by = auth.uid() OR salesperson_id = auth.uid())
);

CREATE POLICY "quotes tenant sales update own non-converted"
ON public.quotes FOR UPDATE TO authenticated
USING (
  company_id = private.current_company_id()
  AND private.has_role(auth.uid(),'sales'::app_role)
  AND created_by = auth.uid()
  AND status <> 'converted'
)
WITH CHECK (
  company_id = private.current_company_id()
  AND private.has_role(auth.uid(),'sales'::app_role)
  AND created_by = auth.uid()
  AND status <> 'converted'
);

DROP POLICY IF EXISTS "qi admin manage" ON public.quote_items;
DROP POLICY IF EXISTS "qi sales manage own non-converted" ON public.quote_items;
DROP POLICY IF EXISTS "qi sales read own" ON public.quote_items;
DROP POLICY IF EXISTS "qi public read by token" ON public.quote_items;
DROP POLICY IF EXISTS "qi tenant admin manage" ON public.quote_items;
DROP POLICY IF EXISTS "qi tenant sales manage own non-converted" ON public.quote_items;
DROP POLICY IF EXISTS "qi tenant sales read own" ON public.quote_items;

REVOKE SELECT ON public.quote_items FROM anon;

CREATE POLICY "qi tenant admin manage"
ON public.quote_items FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND (private.has_role(auth.uid(),'super_admin'::app_role)
         OR (q.company_id = private.current_company_id()
             AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND (private.has_role(auth.uid(),'super_admin'::app_role)
         OR (q.company_id = private.current_company_id()
             AND (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'finance'::app_role)))))
);

CREATE POLICY "qi tenant sales manage own non-converted"
ON public.quote_items FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND q.company_id = private.current_company_id()
    AND private.has_role(auth.uid(),'sales'::app_role)
    AND q.created_by = auth.uid()
    AND q.status <> 'converted')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND q.company_id = private.current_company_id()
    AND private.has_role(auth.uid(),'sales'::app_role)
    AND q.created_by = auth.uid()
    AND q.status <> 'converted')
);

CREATE POLICY "qi tenant sales read own"
ON public.quote_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
    AND q.company_id = private.current_company_id()
    AND private.has_role(auth.uid(),'sales'::app_role)
    AND (q.created_by = auth.uid() OR q.salesperson_id = auth.uid()))
);

DROP POLICY IF EXISTS "public read custom" ON public.member_custom_products;
DROP POLICY IF EXISTS "public read custom active members" ON public.member_custom_products;
DROP POLICY IF EXISTS "anon read custom active members" ON public.member_custom_products;
DROP POLICY IF EXISTS "authenticated read custom active members" ON public.member_custom_products;

REVOKE SELECT ON public.member_custom_products FROM anon;
REVOKE SELECT ON public.member_custom_products FROM PUBLIC;
GRANT SELECT (id, title, description, image_url, video_url, purchase_url, is_active, created_at, updated_at)
  ON public.member_custom_products TO anon;

CREATE POLICY "anon read custom active members"
ON public.member_custom_products FOR SELECT TO anon
USING (
  is_active = true
  AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = member_custom_products.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status IN ('active', U&'\6B63\5F0F\6703\54E1'))
      AND (p.member_no IS NOT NULL OR p.marketing_slug IS NOT NULL OR p.referral_code IS NOT NULL))
);

CREATE POLICY "authenticated read custom active members"
ON public.member_custom_products FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = member_custom_products.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status IN ('active', U&'\6B63\5F0F\6703\54E1'))
      AND (p.member_no IS NOT NULL OR p.marketing_slug IS NOT NULL OR p.referral_code IS NOT NULL))
);