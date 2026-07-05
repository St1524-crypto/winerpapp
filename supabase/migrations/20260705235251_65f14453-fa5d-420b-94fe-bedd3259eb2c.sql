
CREATE OR REPLACE FUNCTION public.profiles_block_sensitive_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $$
DECLARE
  _is_admin boolean;
  _sensitive_set boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_vip            IS NOT DISTINCT FROM NEW.is_vip
       AND OLD.is_dealer     IS NOT DISTINCT FROM NEW.is_dealer
       AND OLD.member_status IS NOT DISTINCT FROM NEW.member_status
       AND OLD.vip_expires_at IS NOT DISTINCT FROM NEW.vip_expires_at
       AND OLD.vip_tier      IS NOT DISTINCT FROM NEW.vip_tier
       AND OLD.legacy_rank   IS NOT DISTINCT FROM NEW.legacy_rank
       AND OLD.placement_id  IS NOT DISTINCT FROM NEW.placement_id
       AND OLD.referred_by   IS NOT DISTINCT FROM NEW.referred_by
    THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    _sensitive_set :=
      COALESCE(NEW.is_vip, false) = true
      OR COALESCE(NEW.is_dealer, false) = true
      OR NEW.vip_expires_at IS NOT NULL
      OR NEW.vip_tier IS NOT NULL
      OR NEW.legacy_rank IS NOT NULL
      OR NEW.placement_id IS NOT NULL
      OR NEW.referred_by IS NOT NULL
      OR (NEW.member_status IS NOT NULL AND NEW.member_status <> 'active');
    IF NOT _sensitive_set THEN
      RETURN NEW;
    END IF;
  END IF;

  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    RETURN NEW;
  END IF;

  SELECT private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
    INTO _is_admin;

  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: cannot set privileged profile fields (is_vip, is_dealer, member_status, vip_tier, vip_expires_at, legacy_rank, placement_id, referred_by)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE UPDATE (vip_tier) ON public.profiles FROM authenticated;
