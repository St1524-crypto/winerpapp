-- Restrict wholesale_price column access to staff via SECURITY DEFINER RPC.
-- Revoke direct column SELECT from anon/authenticated; admins still see it
-- via the service role and the new RPC mirrors get_product_costs.

REVOKE SELECT (wholesale_price) ON public.products FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_product_wholesale_prices(_ids uuid[])
RETURNS TABLE(id uuid, wholesale_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'private', 'public'
AS $$
  SELECT p.id, p.wholesale_price
  FROM public.products p
  WHERE p.id = ANY(_ids)
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
      OR private.has_role(auth.uid(), 'sales'::app_role)
      OR private.has_role(auth.uid(), 'warehouse'::app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_product_wholesale_prices(uuid[]) TO authenticated;