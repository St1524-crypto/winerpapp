
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := false;
BEGIN
  -- service_role / 未經 auth 的內部呼叫 (例如遷移 / trigger 觸發) 直接放行
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _is_admin := private.has_role(_uid, 'super_admin'::app_role)
            OR private.has_role(_uid, 'admin'::app_role);

  IF _is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 非管理員新增自己 profile 時，強制安全預設值
    NEW.is_vip := COALESCE(false, NEW.is_vip);
    NEW.is_vip := false;
    NEW.is_dealer := false;
    NEW.vip_tier := NULL;
    NEW.vip_expires_at := NULL;
    NEW.member_status := COALESCE(OLD.member_status, 'active');
    NEW.legacy_bonus_total := 0;
    NEW.legacy_rank := NULL;
    -- referred_by 允許在 INSERT 時設定（推薦人綁定）
    RETURN NEW;
  END IF;

  -- UPDATE：非管理員不得變更以下欄位
  IF NEW.is_vip IS DISTINCT FROM OLD.is_vip THEN
    RAISE EXCEPTION 'permission denied: cannot modify is_vip';
  END IF;
  IF NEW.is_dealer IS DISTINCT FROM OLD.is_dealer THEN
    RAISE EXCEPTION 'permission denied: cannot modify is_dealer';
  END IF;
  IF NEW.vip_tier IS DISTINCT FROM OLD.vip_tier THEN
    RAISE EXCEPTION 'permission denied: cannot modify vip_tier';
  END IF;
  IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN
    RAISE EXCEPTION 'permission denied: cannot modify vip_expires_at';
  END IF;
  IF NEW.member_status IS DISTINCT FROM OLD.member_status THEN
    RAISE EXCEPTION 'permission denied: cannot modify member_status';
  END IF;
  IF NEW.legacy_bonus_total IS DISTINCT FROM OLD.legacy_bonus_total THEN
    RAISE EXCEPTION 'permission denied: cannot modify legacy_bonus_total';
  END IF;
  IF NEW.legacy_rank IS DISTINCT FROM OLD.legacy_rank THEN
    RAISE EXCEPTION 'permission denied: cannot modify legacy_rank';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'permission denied: cannot modify referred_by';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
