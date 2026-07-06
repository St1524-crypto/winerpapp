-- Harden profile protected fields so authenticated users cannot self-promote
-- to VIP/dealer or alter account identity / reward relationship fields.

DO $$
DECLARE
  protected_column text;
  protected_columns text[] := ARRAY[
    'is_vip','is_dealer','member_status','vip_expires_at','vip_tier','legacy_rank',
    'placement_id','referred_by','referral_code','member_no','current_company_id',
    'frozen_code','legacy_bonus_total','id_no'
  ];
BEGIN
  FOREACH protected_column IN ARRAY protected_columns LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name=protected_column
    ) THEN
      EXECUTE format('REVOKE INSERT (%I) ON public.profiles FROM PUBLIC, anon, authenticated', protected_column);
      EXECUTE format('REVOKE UPDATE (%I) ON public.profiles FROM PUBLIC, anon, authenticated', protected_column);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.profiles_block_sensitive_self_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $fn$
DECLARE
  _is_privileged boolean := false;
  _sensitive_set boolean := false;
BEGIN
  IF auth.uid() IS NULL
     OR current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    RETURN NEW;
  END IF;

  SELECT private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'finance'::app_role)
    INTO _is_privileged;

  IF COALESCE(_is_privileged, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _sensitive_set :=
      COALESCE(NEW.is_vip, false) = true
      OR COALESCE(NEW.is_dealer, false) = true
      OR NEW.member_status IS NOT NULL
      OR NEW.vip_expires_at IS NOT NULL
      OR NEW.vip_tier IS NOT NULL
      OR NEW.legacy_rank IS NOT NULL
      OR NEW.placement_id IS NOT NULL
      OR NEW.referred_by IS NOT NULL
      OR NEW.referral_code IS NOT NULL
      OR NEW.member_no IS NOT NULL
      OR NEW.current_company_id IS NOT NULL
      OR NEW.frozen_code IS NOT NULL
      OR COALESCE(NEW.legacy_bonus_total, 0) <> 0
      OR NEW.id_no IS NOT NULL;

    IF _sensitive_set THEN
      RAISE EXCEPTION 'profiles_sensitive_insert_forbidden'
        USING HINT = 'Protected profile fields can only be set by admin, finance, or backend service logic.';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_vip IS DISTINCT FROM OLD.is_vip
       OR NEW.is_dealer IS DISTINCT FROM OLD.is_dealer
       OR NEW.member_status IS DISTINCT FROM OLD.member_status
       OR NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at
       OR NEW.vip_tier IS DISTINCT FROM OLD.vip_tier
       OR NEW.legacy_rank IS DISTINCT FROM OLD.legacy_rank
       OR NEW.placement_id IS DISTINCT FROM OLD.placement_id
       OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.member_no IS DISTINCT FROM OLD.member_no
       OR NEW.current_company_id IS DISTINCT FROM OLD.current_company_id
       OR NEW.frozen_code IS DISTINCT FROM OLD.frozen_code
       OR NEW.legacy_bonus_total IS DISTINCT FROM OLD.legacy_bonus_total
       OR NEW.id_no IS DISTINCT FROM OLD.id_no
    THEN
      RAISE EXCEPTION 'profiles_sensitive_update_forbidden'
        USING HINT = 'Protected profile fields can only be modified by admin, finance, or backend service logic.';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_block_sensitive_self_update ON public.profiles;
DROP TRIGGER IF EXISTS profiles_restrict_self_sensitive_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_block_sensitive_self_write ON public.profiles;

CREATE TRIGGER trg_profiles_block_sensitive_self_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_block_sensitive_self_write();