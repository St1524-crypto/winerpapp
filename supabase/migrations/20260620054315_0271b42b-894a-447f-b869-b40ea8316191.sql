
-- 1. Revoke wholesale_price / cost_price column SELECT from anon, authenticated, PUBLIC
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon, authenticated, PUBLIC;

-- Re-grant to privileged roles only via service_role (already has ALL); ensure has_role-gated access happens via SECURITY DEFINER funcs (already in place: get_product_costs / get_product_wholesale_prices)
GRANT SELECT (wholesale_price, cost_price) ON public.products TO service_role;

-- 2. Tighten group_buys public read: only open & non-expired rows; hide winner fields via view
DROP POLICY IF EXISTS "gb public read" ON public.group_buys;

CREATE POLICY "gb public read open"
ON public.group_buys
FOR SELECT
TO anon, authenticated
USING (status = 'open' AND (expires_at IS NULL OR expires_at > now()));

-- Authenticated participants & admins can see their own / managed group buys in full
CREATE POLICY "gb participant read"
ON public.group_buys
FOR SELECT
TO authenticated
USING (
  initiator_id = auth.uid()
  OR winner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.group_buy_orders o WHERE o.group_buy_id = group_buys.id AND o.user_id = auth.uid())
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);
