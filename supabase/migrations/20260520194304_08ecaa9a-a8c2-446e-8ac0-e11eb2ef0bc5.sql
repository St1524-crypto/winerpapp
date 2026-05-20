
-- 1) BEFORE INSERT：若為公司第一位成員，強制 role='admin'
CREATE OR REPLACE FUNCTION private.company_members_first_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  member_count int;
BEGIN
  SELECT COUNT(*) INTO member_count
  FROM public.company_members
  WHERE company_id = NEW.company_id;

  IF member_count = 0 THEN
    NEW.role := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_members_first_is_admin ON public.company_members;
CREATE TRIGGER trg_company_members_first_is_admin
BEFORE INSERT ON public.company_members
FOR EACH ROW
EXECUTE FUNCTION private.company_members_first_is_admin();

-- 2) AFTER INSERT：若為第一位成員，且尚未有 admin/super_admin 應用角色，加上 admin
CREATE OR REPLACE FUNCTION private.company_members_grant_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  member_count int;
  already_priv boolean;
BEGIN
  SELECT COUNT(*) INTO member_count
  FROM public.company_members
  WHERE company_id = NEW.company_id;

  -- 只在「該使用者是該公司唯一成員」時生效（= 第一位）
  IF member_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role IN ('admin'::app_role, 'super_admin'::app_role)
  ) INTO already_priv;

  IF NOT already_priv THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_members_grant_admin_role ON public.company_members;
CREATE TRIGGER trg_company_members_grant_admin_role
AFTER INSERT ON public.company_members
FOR EACH ROW
EXECUTE FUNCTION private.company_members_grant_admin_role();

-- 3) 補登：每間公司「最早加入」的成員若未具備 admin/super_admin，補一個 admin 應用角色
WITH first_members AS (
  SELECT DISTINCT ON (company_id) company_id, user_id
  FROM public.company_members
  ORDER BY company_id, created_at ASC
)
INSERT INTO public.user_roles (user_id, role)
SELECT fm.user_id, 'admin'::app_role
FROM first_members fm
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = fm.user_id
    AND ur.role IN ('admin'::app_role, 'super_admin'::app_role)
)
ON CONFLICT (user_id, role) DO NOTHING;
