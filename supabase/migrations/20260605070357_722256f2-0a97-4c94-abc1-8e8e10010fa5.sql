-- 1) Lock down products.cost_price at the column level so anon/authenticated cannot read it
REVOKE SELECT (cost_price) ON public.products FROM anon, authenticated;

-- 2) login_attempts: allow inserts so tracking works during sign-in (incl. unauthenticated attempts)
DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;
CREATE POLICY "Anyone can insert login attempts"
  ON public.login_attempts
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON public.login_attempts TO anon, authenticated;