
-- 1) Strengthen is_active_dealer: require is_dealer + non-expired dealer tier status when a status row exists
CREATE OR REPLACE FUNCTION public.is_active_dealer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.dealer_tier_status s ON s.user_id = p.id
    WHERE p.id = _user_id
      AND COALESCE(p.is_dealer, false) = true
      AND (
        s.user_id IS NULL
        OR s.maintenance_expires_at IS NULL
        OR s.maintenance_expires_at > now()
      )
  );
$function$;

-- 2) Explicit narrow anon SELECT policy for product-images bucket, restricted to UUID-prefixed folders
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- 3) Add admin DELETE policy for vip_upgrade_orders (previously fail-closed)
DROP POLICY IF EXISTS "vip_orders admin delete" ON public.vip_upgrade_orders;
CREATE POLICY "vip_orders admin delete"
ON public.vip_upgrade_orders
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);
