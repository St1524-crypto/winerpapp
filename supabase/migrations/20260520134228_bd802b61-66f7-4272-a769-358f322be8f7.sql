-- 1) 強化 companies 表的 SELECT 規則：移除過於寬鬆的「true」政策
DROP POLICY IF EXISTS "Auth view companies" ON public.companies;
DROP POLICY IF EXISTS "Members view own companies" ON public.companies;

-- 所有登入者可看到啟用中的公司
CREATE POLICY "Auth view active companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 成員可看到自己歸屬的公司（即使被停用，便於前端顯示「已停用」狀態）
CREATE POLICY "Members view own companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.is_company_member(id, auth.uid())
  );

-- 2) 讓 current_company_id() 在公司被停用時回傳 NULL
--    這樣所有以 tenant_scope (company_id = current_company_id()) 限制的表
--    就會自動排除停用公司的資料（super_admin 不受影響，已在各 tenant_scope 中放行）
CREATE OR REPLACE FUNCTION private.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.profiles p
  JOIN public.companies c ON c.id = p.current_company_id
  WHERE p.id = auth.uid()
    AND c.status = 'active'
  LIMIT 1
$$;