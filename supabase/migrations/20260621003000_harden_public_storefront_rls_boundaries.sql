-- Harden public storefront RLS boundaries for Lovable security scan.
--
-- 1. Keep public_member_profiles as SECURITY INVOKER to avoid security-definer
--    view findings, but grant only non-PII storefront columns on profiles.
-- 2. Revoke PII columns from anon/authenticated/PUBLIC.
-- 3. Do not allow anonymous users to read member_featured_products directly,
--    because the base table contains member_id UUIDs. Public storefront reads
--    happen through server functions and/or safe views.

DROP VIEW IF EXISTS public.public_member_profiles;

DROP POLICY IF EXISTS "Public read active member storefront profiles" ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM PUBLIC;

REVOKE SELECT (
  phone,
  birthday,
  id_no,
  addr_home,
  addr_mail,
  email
) ON public.profiles FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  avatar_url,
  profile_avatar,
  profile_cover,
  brand_name,
  brand_intro,
  line_url,
  facebook_url,
  instagram_url,
  youtube_url,
  page_template,
  is_vip,
  frozen_code,
  member_status
) ON public.profiles TO anon, authenticated;

CREATE POLICY "Public read active member storefront profiles"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (
  (frozen_code IS NULL OR frozen_code = 'N')
  AND (
    member_status IS NULL
    OR member_status = 'active'
    OR member_status = '正式會員'
  )
  AND (
    member_no IS NOT NULL
    OR marketing_slug IS NOT NULL
    OR referral_code IS NOT NULL
  )
);

CREATE VIEW public.public_member_profiles
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  avatar_url,
  profile_avatar,
  profile_cover,
  brand_name,
  brand_intro,
  line_url,
  facebook_url,
  instagram_url,
  youtube_url,
  page_template,
  is_vip
FROM public.profiles
WHERE (frozen_code IS NULL OR frozen_code = 'N')
  AND (
    member_status IS NULL
    OR member_status = 'active'
    OR member_status = '正式會員'
  );

REVOKE ALL ON public.public_member_profiles FROM PUBLIC;
GRANT SELECT ON public.public_member_profiles TO anon, authenticated;

DROP POLICY IF EXISTS "public read featured" ON public.member_featured_products;
DROP POLICY IF EXISTS "Public read featured products" ON public.member_featured_products;
DROP POLICY IF EXISTS "Public read active member featured products" ON public.member_featured_products;

REVOKE SELECT ON public.member_featured_products FROM anon;
REVOKE SELECT ON public.member_featured_products FROM PUBLIC;

CREATE OR REPLACE VIEW public.public_member_featured_products AS
SELECT
  mfp.id,
  p.member_no,
  p.marketing_slug,
  p.referral_code,
  mfp.product_id,
  mfp.sort_order,
  mfp.created_at
FROM public.member_featured_products mfp
JOIN public.profiles p ON p.id = mfp.member_id
WHERE (p.frozen_code IS NULL OR p.frozen_code = 'N')
  AND (
    p.member_status IS NULL
    OR p.member_status = 'active'
    OR p.member_status = '正式會員'
  );

REVOKE ALL ON public.public_member_featured_products FROM PUBLIC;
GRANT SELECT ON public.public_member_featured_products TO anon, authenticated;
