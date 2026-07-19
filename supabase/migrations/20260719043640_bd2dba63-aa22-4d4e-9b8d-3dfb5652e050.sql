-- 1) products: block anon from reading cost_price / wholesale_price
REVOKE SELECT (cost_price, wholesale_price) ON public.products FROM anon;

-- 2) shop_content_questions: block anon from reading user_id (asker's identity)
REVOKE SELECT (user_id) ON public.shop_content_questions FROM anon;

-- 3) webhook_endpoints: scope admin-manage policy to the admin's own company
DROP POLICY IF EXISTS "wh admin manage" ON public.webhook_endpoints;
CREATE POLICY "wh admin manage"
  ON public.webhook_endpoints
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND company_id = private.current_company_id()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND company_id = private.current_company_id()
    )
  );