
-- 1) business_accounts: scope RESTRICTIVE tenant_scope policy to authenticated only
ALTER POLICY tenant_scope ON public.business_accounts TO authenticated;

-- 2) member_videos: replace broad authenticated read with owner + published-storefront scope
DROP POLICY IF EXISTS "authenticated read videos active members" ON public.member_videos;

CREATE POLICY "Members view own videos or published storefront videos"
ON public.member_videos
FOR SELECT
TO authenticated
USING (
  member_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.member_storefront_pages sp
    JOIN public.profiles p ON p.id = member_videos.member_id
    WHERE sp.member_id = member_videos.member_id
      AND sp.published_at IS NOT NULL
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status = ANY (ARRAY['active','正式會員']))
  )
);

-- 3) profiles: block non-admin self-writes of membership/VIP/dealer flags used by pricing visibility
CREATE OR REPLACE FUNCTION private.prevent_member_privilege_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_vip IS DISTINCT FROM OLD.is_vip
     OR NEW.is_dealer IS DISTINCT FROM OLD.is_dealer
     OR NEW.vip_tier IS DISTINCT FROM OLD.vip_tier
     OR NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at
     OR NEW.frozen_code IS DISTINCT FROM OLD.frozen_code
     OR NEW.member_status IS DISTINCT FROM OLD.member_status
  THEN
    RAISE EXCEPTION 'Only admins may modify membership privilege fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_member_privilege_self_update ON public.profiles;
CREATE TRIGGER prevent_member_privilege_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.prevent_member_privilege_self_update();
