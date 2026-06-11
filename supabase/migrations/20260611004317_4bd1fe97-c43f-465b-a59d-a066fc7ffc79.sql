
-- 1) Products: ensure anon cannot read wholesale_price/cost_price columns
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon;

-- 2) monthly_responsibility_points: add admin/finance write policies
DROP POLICY IF EXISTS "Admins manage responsibility points" ON public.monthly_responsibility_points;
CREATE POLICY "Admins manage responsibility points"
ON public.monthly_responsibility_points
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

-- 3) user_sessions: add owner-scoped INSERT policy
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.user_sessions;
CREATE POLICY "Users can insert their own sessions"
ON public.user_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
