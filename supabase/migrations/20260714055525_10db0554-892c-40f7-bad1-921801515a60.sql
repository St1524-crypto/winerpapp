
-- Tighten dealer_tier_history cross-company visibility: require staff role
DROP POLICY IF EXISTS "dth tenant_scope restrictive" ON public.dealer_tier_history;
CREATE POLICY "dth tenant_scope restrictive" ON public.dealer_tier_history
AS RESTRICTIVE FOR ALL
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR auth.uid() = user_id
  OR (
    (private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'finance'::app_role)
     OR private.has_role(auth.uid(), 'sales'::app_role))
    AND EXISTS (
      SELECT 1 FROM company_members cm_viewer
      JOIN company_members cm_target ON cm_viewer.company_id = cm_target.company_id
      WHERE cm_viewer.user_id = auth.uid()
        AND cm_target.user_id = dealer_tier_history.user_id
        AND cm_viewer.company_id = private.current_company_id()
    )
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role) OR auth.uid() = user_id
);

-- Backfill shop_content_questions author_name to avoid exposing emails/PII publicly
UPDATE public.shop_content_questions
SET author_name = '會員'
WHERE author_name IS NULL OR author_name = '' OR author_name LIKE '%@%';
