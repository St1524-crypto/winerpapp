
-- Defense in depth for profiles sensitive fields
-- 1) Drop duplicate trigger (keep canonical one)
DROP TRIGGER IF EXISTS profiles_block_sensitive_self_update ON public.profiles;

-- 2) Ensure canonical trigger covers INSERT as well (block users from setting privileged fields on insert)
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
      OR NEW.legacy_rank IS NOT NULL
      OR NEW.placement_id IS NOT NULL
      OR NEW.referred_by IS NOT NULL
      OR (NEW.member_status IS NOT NULL AND NEW.member_status <> 'active');
    IF NOT _sensitive_set THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Allow privileged session/service contexts
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
    RAISE EXCEPTION 'Permission denied: cannot set privileged profile fields (is_vip, is_dealer, member_status, vip_expires_at, legacy_rank, placement_id, referred_by)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_update ON public.profiles;
CREATE TRIGGER trg_profiles_block_sensitive_self_write
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_block_sensitive_self_write();

-- 3) Column-level UPDATE revoke on sensitive columns from authenticated (defense in depth;
--    PostgREST RLS-based updates will be blocked even if trigger is dropped accidentally)
REVOKE UPDATE (is_vip, is_dealer, member_status, vip_expires_at, legacy_rank, placement_id, referred_by, id_no)
  ON public.profiles FROM authenticated;

-- 4) Restrict id_no exposure: revoke direct SELECT of id_no column from authenticated.
--    Admins/super_admins read it via existing SECURITY DEFINER public.get_profile_id_no(_user_id).
REVOKE SELECT (id_no) ON public.profiles FROM authenticated;
REVOKE SELECT (id_no) ON public.profiles FROM anon;
