
-- 1) product_wholesale_tiers: add RESTRICTIVE tenant scoping via products join
CREATE POLICY "tenant_scope_restrictive"
  ON public.product_wholesale_tiers
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (p.company_id IS NULL OR p.company_id = private.current_company_id())
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_wholesale_tiers.product_id
        AND (p.company_id IS NULL OR p.company_id = private.current_company_id())
    )
  );

-- 2) quotes public token: SECURITY DEFINER function for anon token-scoped reads
CREATE OR REPLACE FUNCTION public.get_quote_by_public_token(_token text)
RETURNS TABLE (
  id uuid,
  quote_no text,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  quote_date date,
  valid_until date,
  salesperson_name text,
  status text,
  company_snapshot jsonb,
  bank_snapshot jsonb,
  subtotal numeric,
  discount_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  notes text,
  payment_terms text,
  items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    q.id, q.quote_no, q.customer_name, q.customer_phone, q.customer_email,
    q.customer_address, q.quote_date, q.valid_until, q.salesperson_name,
    q.status, q.company_snapshot, q.bank_snapshot, q.subtotal,
    q.discount_amount, q.tax_amount, q.total_amount, q.notes, q.payment_terms,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(qi.*) ORDER BY qi.sort_order)
       FROM public.quote_items qi WHERE qi.quote_id = q.id),
      '[]'::jsonb
    ) AS items
  FROM public.quotes q
  WHERE q.public_token = _token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quote_by_public_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_public_token(text) TO anon, authenticated;

-- 3) webhook_endpoints: hide bearer_token from admins via column-level revoke
--    Split the "wh admin manage" ALL policy so SELECT excludes bearer_token column.
REVOKE SELECT (bearer_token) ON public.webhook_endpoints FROM authenticated;
REVOKE ALL ON public.webhook_endpoints FROM anon;
GRANT SELECT (id, company_id, name, url, events, active, created_at, updated_at),
      INSERT, UPDATE, DELETE
  ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;

-- For UPDATE/INSERT of bearer_token, admins still need column privileges.
-- Keep INSERT/UPDATE broad; RLS still enforces admin role. Column-level SELECT
-- revoke is enough to prevent reading the secret through the Data API.
GRANT INSERT (id, company_id, name, url, bearer_token, events, active),
      UPDATE (name, url, bearer_token, events, active, updated_at)
  ON public.webhook_endpoints TO authenticated;
