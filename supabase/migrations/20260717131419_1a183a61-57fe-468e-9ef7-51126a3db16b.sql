
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := false;
BEGIN
  -- service_role / postgres bypass entirely
  IF current_setting('role', true) IN ('service_role') OR session_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;

  -- Admin roles may modify privileged fields
  IF auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    is_privileged := true;
  END IF;

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Revert any client-supplied changes to protected columns
  NEW.is_vip              := OLD.is_vip;
  NEW.is_dealer           := OLD.is_dealer;
  NEW.vip_tier            := OLD.vip_tier;
  NEW.vip_expires_at      := OLD.vip_expires_at;
  NEW.member_status       := OLD.member_status;
  NEW.frozen_code         := OLD.frozen_code;
  NEW.legacy_rank         := OLD.legacy_rank;
  NEW.legacy_bonus_total  := OLD.legacy_bonus_total;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
