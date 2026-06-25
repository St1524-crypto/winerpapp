
-- Column-level revoke: stop exposing internal pricing fields via PostgREST
REVOKE SELECT (cost_price) ON public.products FROM anon, authenticated;
REVOKE SELECT (wholesale_price) ON public.products FROM anon, authenticated;

-- Extend wholesale-price RPC to allow dealers/VIP self-read
CREATE OR REPLACE FUNCTION public.get_product_wholesale_prices(_ids uuid[])
RETURNS TABLE(id uuid, wholesale_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'private', 'public'
AS $function$
  SELECT p.id, p.wholesale_price
  FROM public.products p
  WHERE p.id = ANY(_ids)
    AND (
      private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
      OR private.has_role(auth.uid(), 'sales'::app_role)
      OR private.has_role(auth.uid(), 'warehouse'::app_role)
      OR public.is_active_dealer(auth.uid())
      OR public.is_active_vip(auth.uid())
    );
$function$;
