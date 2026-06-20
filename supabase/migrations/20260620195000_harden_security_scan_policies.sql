-- Harden DB policies flagged by Lovable basic security scan.
--
-- 1. Products: anon may read public storefront fields only. Internal margin
--    fields (wholesale_price, cost_price) stay server/admin-only.
-- 2. Login attempts: browser clients must not insert arbitrary audit rows.
--    Login logging is performed by server functions through service_role.
-- 3. Profiles: do not expose the base profiles table to anonymous/public roles.
--    Public storefront data is exposed through dedicated functions/routes.

-- Products: remove table-level anon access, then grant a safe column allowlist.
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM PUBLIC;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id,
  sku,
  name,
  category,
  price,
  stock,
  image,
  created_at,
  short_description,
  description,
  category_id,
  safe_stock,
  status,
  featured,
  updated_at,
  company_id,
  reward_points,
  discount_points_max,
  specs
) ON public.products TO anon;

GRANT SELECT (wholesale_price, cost_price) ON public.products TO service_role;

-- Login attempts: no direct client-side inserts. Server functions use
-- supabaseAdmin/service_role and bypass RLS for legitimate audit logging.
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

-- Profiles: anonymous visitors should not query the base table directly.
-- Member-facing public data is provided by explicit storefront APIs.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM PUBLIC;
REVOKE SELECT (phone, birthday, id_no, addr_home, addr_mail)
ON public.profiles
FROM anon, PUBLIC;
