-- Tighten public read policy on member_custom_products to match member_featured_products / member_videos
DROP POLICY IF EXISTS "public read custom" ON public.member_custom_products;

CREATE POLICY "public read custom active members"
ON public.member_custom_products
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = member_custom_products.member_id
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status IN ('active', '正式會員'))
      AND (
        p.member_no IS NOT NULL
        OR p.marketing_slug IS NOT NULL
        OR p.referral_code IS NOT NULL
      )
  )
);