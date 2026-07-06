-- Harden profiles self-update: prevent members from setting privileged fields
CREATE OR REPLACE FUNCTION public.profiles_restrict_self_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  is_privileged boolean := false;
BEGIN
  -- Service role / bypass: no auth.uid()
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins/super_admins may change anything
  BEGIN
    is_privileged := private.has_role(auth.uid(), 'admin')
                  OR private.has_role(auth.uid(), 'super_admin');
  EXCEPTION WHEN OTHERS THEN
    is_privileged := false;
  END;

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Only apply restrictions when the user is updating their own row
  IF NEW.id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Block changes to privileged / business-critical columns
  IF NEW.is_vip IS DISTINCT FROM OLD.is_vip
     OR NEW.is_dealer IS DISTINCT FROM OLD.is_dealer
     OR NEW.vip_tier IS DISTINCT FROM OLD.vip_tier
     OR NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at
     OR NEW.member_status IS DISTINCT FROM OLD.member_status
     OR NEW.frozen_code IS DISTINCT FROM OLD.frozen_code
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.placement_id IS DISTINCT FROM OLD.placement_id
     OR NEW.referrer_id IS DISTINCT FROM OLD.referrer_id
     OR NEW.legacy_bonus_total IS DISTINCT FROM OLD.legacy_bonus_total
     OR NEW.member_no IS DISTINCT FROM OLD.member_no
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
  THEN
    RAISE EXCEPTION 'profiles_self_update_sensitive_columns_forbidden'
      USING HINT = 'Sensitive profile fields can only be modified by admins or backend logic.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_restrict_self_sensitive_update ON public.profiles;
CREATE TRIGGER profiles_restrict_self_sensitive_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_restrict_self_sensitive_update();