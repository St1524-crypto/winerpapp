
-- Restrict access to internal margin field cost_price on public.products.
-- Regular authenticated users (B2C shoppers) and anonymous users must not
-- be able to read cost_price. Staff roles read it via a SECURITY DEFINER RPC.

REVOKE SELECT (cost_price) ON public.products FROM authenticated;
REVOKE SELECT (cost_price) ON public.products FROM anon;

CREATE OR REPLACE FUNCTION public.get_product_costs(_ids uuid[])
RETURNS TABLE(id uuid, cost_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'private', 'public'
AS $$
  SELECT p.id, p.cost_price
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

REVOKE ALL ON FUNCTION public.get_product_costs(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_costs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_costs(uuid[]) TO service_role;
