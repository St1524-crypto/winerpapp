-- Restrict company creation to a single authorized email
CREATE OR REPLACE FUNCTION private.assert_company_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS DISTINCT FROM 'admin-test@winerp.app' THEN
    RAISE EXCEPTION '只有授權帳號 admin-test@winerp.app 可以新增公司' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_creator_guard ON public.companies;
CREATE TRIGGER trg_companies_creator_guard
BEFORE INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION private.assert_company_creator();