
-- 1) Fix SECURITY DEFINER VIEW warning: run as caller
ALTER VIEW public.public_member_profiles SET (security_invoker = true);

-- 2) Allow anon to read only safe (non-PII) columns of profiles, scoped to public-eligible members
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT (
  id, name, display_name, member_no, marketing_slug, referral_code,
  avatar_url, profile_avatar, profile_cover,
  brand_name, brand_intro,
  line_url, facebook_url, instagram_url, youtube_url,
  page_template, is_vip,
  frozen_code, member_status
) ON public.profiles TO anon;

DROP POLICY IF EXISTS "Public storefront read" ON public.profiles;
CREATE POLICY "Public storefront read"
ON public.profiles
FOR SELECT
TO anon
USING (
  (frozen_code IS NULL OR frozen_code = 'N')
  AND (member_status IS NULL OR member_status = 'active' OR member_status = '正式會員')
);

-- 3) Tighten member_featured_products anon read to only publicly visible members
DROP POLICY IF EXISTS "public read featured" ON public.member_featured_products;

CREATE POLICY "Public read featured for visible members"
ON public.member_featured_products
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = member_featured_products.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status = 'active' OR p.member_status = '正式會員')
  )
);

CREATE POLICY "Authenticated read featured for visible members"
ON public.member_featured_products
FOR SELECT
TO authenticated
USING (
  member_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = member_featured_products.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status = 'active' OR p.member_status = '正式會員')
  )
);
