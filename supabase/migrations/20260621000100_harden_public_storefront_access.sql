-- Harden public storefront access and clear stale wholesale-tier read policies.
--
-- Lovable's scanner may keep reporting old product_wholesale_tiers policies when
-- they reference business_account_users. This migration removes every SELECT
-- policy on that table, then creates a single staff-only read policy.
--
-- It also grants anonymous/authenticated users read access only to non-PII
-- storefront columns on profiles, guarded by an active/unfrozen RLS policy.

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_wholesale_tiers'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.product_wholesale_tiers',
      policy_record.policyname
    );
  END LOOP;
END $$;

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

DROP POLICY IF EXISTS "Public read active member storefront profiles" ON public.profiles;

REVOKE SELECT (phone, birthday, id_no, addr_home, addr_mail, email)
ON public.profiles
FROM anon, PUBLIC;

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
  is_vip
) ON public.profiles TO anon, authenticated;

CREATE POLICY "Public read active member storefront profiles"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (
  frozen_code IS NULL
  AND (member_status IS NULL OR member_status = 'active')
  AND (
    member_no IS NOT NULL
    OR marketing_slug IS NOT NULL
    OR referral_code IS NOT NULL
  )
);

CREATE OR REPLACE VIEW public.public_member_profiles AS
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
WHERE frozen_code IS NULL
  AND (member_status IS NULL OR member_status = 'active');

ALTER VIEW public.public_member_profiles SET (security_invoker = true);

REVOKE ALL ON public.public_member_profiles FROM PUBLIC;
GRANT SELECT ON public.public_member_profiles TO anon, authenticated;
