-- Block self-update of sensitive profile fields via a RESTRICTIVE policy.
-- Members may still update their own profile (name, avatar, phone, etc.),
-- but any change to is_vip / is_dealer / member_status / vip_expires_at /
-- legacy_rank / placement_id / referred_by must be performed by admin
-- roles (or via service role / SECURITY DEFINER RPCs that bypass RLS).

CREATE OR REPLACE FUNCTION public.profile_sensitive_unchanged(
  _old public.profiles,
  _new public.profiles
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _old.is_vip            IS NOT DISTINCT FROM _new.is_vip
    AND _old.is_dealer     IS NOT DISTINCT FROM _new.is_dealer
    AND _old.member_status IS NOT DISTINCT FROM _new.member_status
    AND _old.vip_expires_at IS NOT DISTINCT FROM _new.vip_expires_at
    AND _old.legacy_rank   IS NOT DISTINCT FROM _new.legacy_rank
    AND _old.placement_id  IS NOT DISTINCT FROM _new.placement_id
    AND _old.referred_by   IS NOT DISTINCT FROM _new.referred_by
$$;

-- Trigger-based guard: blocks changes to sensitive columns unless the
-- caller is an admin (super_admin/admin) or the change is performed by
-- service_role (which bypasses RLS but still fires triggers — we allow
-- it explicitly via session_user check).
CREATE OR REPLACE FUNCTION public.profiles_block_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  -- Allow when nothing sensitive changed
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

  -- Allow service_role / postgres (server-side admin writes)
  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    RETURN NEW;
  END IF;

  -- Otherwise require admin role
  SELECT private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
    INTO _is_admin;

  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: cannot modify privileged profile fields (is_vip, is_dealer, member_status, vip_expires_at, legacy_rank, placement_id, referred_by)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_sensitive_self_update ON public.profiles;
CREATE TRIGGER profiles_block_sensitive_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_sensitive_self_update();