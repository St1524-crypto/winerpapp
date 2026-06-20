DROP POLICY IF EXISTS "Anyone can view wholesale tiers" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Authenticated view wholesale tiers" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Staff or business members view wholesale tiers" ON public.product_wholesale_tiers;
DROP POLICY IF EXISTS "Staff view wholesale tiers" ON public.product_wholesale_tiers;

REVOKE SELECT ON public.product_wholesale_tiers FROM anon;
REVOKE SELECT ON public.product_wholesale_tiers FROM PUBLIC;

CREATE POLICY "Staff view wholesale tiers"
ON public.product_wholesale_tiers
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
  OR private.has_role(auth.uid(), 'sales'::app_role)
  OR private.has_role(auth.uid(), 'warehouse'::app_role)
);

CREATE OR REPLACE VIEW public.public_member_profiles AS
SELECT
  id, name, display_name, member_no, marketing_slug, avatar_url,
  profile_avatar, profile_cover, brand_name, brand_intro,
  line_url, facebook_url, instagram_url, youtube_url, page_template, is_vip
FROM public.profiles
WHERE frozen_code IS NULL
  AND (member_status IS NULL OR member_status = 'active');

REVOKE ALL ON public.public_member_profiles FROM PUBLIC;
GRANT SELECT ON public.public_member_profiles TO anon, authenticated;