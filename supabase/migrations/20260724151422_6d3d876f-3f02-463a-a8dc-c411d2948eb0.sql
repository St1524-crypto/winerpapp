CREATE OR REPLACE FUNCTION private.prevent_member_privilege_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $function$
BEGIN
  -- 管理員/超級管理員：允許
  IF auth.uid() IS NOT NULL AND (
       private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RETURN NEW;
  END IF;

  -- 系統/服務端 SECURITY DEFINER 呼叫（如 process_paid_order_upgrades、
  -- settle_daily_bonus、Edge Function 等）：auth.uid() 為 NULL 且
  -- current_user 屬於受信任的資料庫角色 → 允許
  IF auth.uid() IS NULL AND current_user IN (
       'postgres','service_role','supabase_admin','supabase_auth_admin'
  ) THEN
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
$function$;