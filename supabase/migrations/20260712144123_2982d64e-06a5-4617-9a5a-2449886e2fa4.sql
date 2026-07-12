-- Remove broad authenticated read on member_custom_products.
-- All public storefront reads go through the getMemberStorefront server function
-- which uses supabaseAdmin. Owners still manage their rows via "members manage own custom".
DROP POLICY IF EXISTS "authenticated read custom active members" ON public.member_custom_products;

-- Remove public anon INSERT on cooperation_applications.
-- All submissions go through submitCooperationApplication server function
-- which uses supabaseAdmin (bypasses RLS) with zod validation + honeypot.
-- This prevents anonymous flooding directly against the Data API.
DROP POLICY IF EXISTS "Anyone can submit cooperation applications" ON public.cooperation_applications;
REVOKE INSERT ON public.cooperation_applications FROM anon;
REVOKE INSERT ON public.cooperation_applications FROM authenticated;