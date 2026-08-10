-- 1) quotes: hide public_token from direct table reads
REVOKE SELECT ON public.quotes FROM authenticated;
REVOKE SELECT ON public.quotes FROM anon;
GRANT SELECT (id, company_id, quote_no, customer_name, customer_phone, customer_email,
  customer_address, quote_date, valid_until, salesperson_id, salesperson_name, status,
  bank_account_id, company_snapshot, bank_snapshot, subtotal, discount_amount, tax_amount,
  total_amount, notes, payment_terms, converted_order_id, converted_at, created_by,
  created_at, updated_at) ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

-- 2) webhook_endpoints: restore column-scoped access without bearer_token
GRANT SELECT (id, company_id, name, url, events, active, created_at, updated_at)
  ON public.webhook_endpoints TO authenticated;
REVOKE UPDATE ON public.webhook_endpoints FROM authenticated;
REVOKE SELECT, UPDATE ON public.webhook_endpoints FROM anon;
GRANT UPDATE (name, url, events, active, updated_at)
  ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;

-- 3) shop_content_questions: restrictive scoping to the owning content page
DROP POLICY IF EXISTS "questions scope restrictive" ON public.shop_content_questions;
CREATE POLICY "questions scope restrictive"
  ON public.shop_content_questions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shop_content_pages p
      WHERE p.id = shop_content_questions.page_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shop_content_pages p
      WHERE p.id = shop_content_questions.page_id
    )
  );