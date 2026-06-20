-- Support legacy member status semantics for public storefront pages.
--
-- Older imported profiles use frozen_code = 'N' for "not frozen" and
-- member_status = '正式會員' for active members. Treat those values as public
-- storefront eligible without mutating production profile data.

DROP VIEW IF EXISTS public.public_member_profiles;

CREATE VIEW public.public_member_profiles AS
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
