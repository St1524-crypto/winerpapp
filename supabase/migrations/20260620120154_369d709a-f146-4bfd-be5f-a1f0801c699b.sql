-- From 20260620194000_restrict_staff_profile_sensitive_fields.sql
DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;

CREATE POLICY "Admins view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

-- From 20260620195000_harden_security_scan_policies.sql
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM PUBLIC;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id, sku, name, category, price, stock, image, created_at,
  short_description, description, category_id, safe_stock, status,
  featured, updated_at, company_id, reward_points, discount_points_max, specs
) ON public.products TO anon;

GRANT SELECT (wholesale_price, cost_price) ON public.products TO service_role;

DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Anon can insert anonymous login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Users can insert own login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "No client login attempt inserts" ON public.login_attempts;

REVOKE INSERT ON public.login_attempts FROM anon;
REVOKE INSERT ON public.login_attempts FROM authenticated;
REVOKE INSERT ON public.login_attempts FROM PUBLIC;

CREATE POLICY "No client login attempt inserts"
ON public.login_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

GRANT ALL ON public.login_attempts TO service_role;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM PUBLIC;
REVOKE SELECT (phone, birthday, id_no, addr_home, addr_mail)
ON public.profiles
FROM anon, PUBLIC;