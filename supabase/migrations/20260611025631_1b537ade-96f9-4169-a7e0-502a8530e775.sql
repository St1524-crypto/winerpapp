
-- Fix: revoke wholesale_price and cost_price column SELECT from anon (and authenticated as defense in depth; authorized roles use SECURITY DEFINER RPCs get_product_costs / get_product_wholesale_prices)
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM authenticated;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM PUBLIC;

-- Fix: switch monthly_responsibility_points admin ALL policy from public.has_role to private.has_role for consistency
DROP POLICY IF EXISTS "Admins manage responsibility points" ON public.monthly_responsibility_points;
CREATE POLICY "Admins manage responsibility points"
  ON public.monthly_responsibility_points
  FOR ALL
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );
