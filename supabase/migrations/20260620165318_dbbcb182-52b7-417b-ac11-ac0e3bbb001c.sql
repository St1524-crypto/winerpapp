-- Restore safe public member storefront reads without exposing the base profiles table.
DROP VIEW IF EXISTS public.public_member_profiles;

CREATE VIEW public.public_member_profiles AS
SELECT
  id, name, display_name, member_no, marketing_slug, referral_code,
  avatar_url, profile_avatar, profile_cover, brand_name, brand_intro,
  line_url, facebook_url, instagram_url, youtube_url, page_template, is_vip
FROM public.profiles
WHERE frozen_code IS NULL
  AND (member_status IS NULL OR member_status = 'active');

DROP POLICY IF EXISTS "Public read active member storefront profiles" ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM PUBLIC;
REVOKE SELECT (phone, birthday, id_no, addr_home, addr_mail, email) ON public.profiles FROM anon, PUBLIC;

REVOKE ALL ON public.public_member_profiles FROM PUBLIC;
GRANT SELECT ON public.public_member_profiles TO anon, authenticated;