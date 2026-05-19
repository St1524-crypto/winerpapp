
-- =============================================
-- Phase 1: Multi-tenant foundation
-- =============================================

-- 1. profiles.current_company_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_current_company ON public.profiles(current_company_id);

-- 2. SECURITY DEFINER helpers in private schema
CREATE OR REPLACE FUNCTION private.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.has_company_role(_company_id uuid, _user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = _company_id AND user_id = _user_id AND role = _role
  );
$$;

-- current_company_id from profiles, but only if user actually belongs to that company.
-- Returns NULL otherwise so RLS naturally denies access.
CREATE OR REPLACE FUNCTION private.current_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.current_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.current_company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p.current_company_id AND cm.user_id = auth.uid()
    );
$$;

-- Public wrappers (so app code can call without schema prefix issues)
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = private, public
AS $$ SELECT private.current_company_id() $$;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = private, public
AS $$ SELECT private.is_company_member(_company_id, _user_id) $$;

-- 3. Restrict profile UPDATE so current_company_id can only be set to a company the user belongs to
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (
    current_company_id IS NULL
    OR private.is_company_member(current_company_id, auth.uid())
  )
);

-- 4. Companies RLS: allow members to view their companies
DROP POLICY IF EXISTS "Members view own companies" ON public.companies;
CREATE POLICY "Members view own companies"
ON public.companies
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.is_company_member(id, auth.uid())
);

-- 5. Company members: allow members to view fellow members of companies they belong to
DROP POLICY IF EXISTS "Members view fellow members" ON public.company_members;
CREATE POLICY "Members view fellow members"
ON public.company_members
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR auth.uid() = user_id
  OR private.is_company_member(company_id, auth.uid())
);

-- 6. Backfill: create default company and migrate existing users into it
DO $$
DECLARE
  v_company_id uuid;
  v_user record;
BEGIN
  -- Skip if any company already exists
  IF EXISTS (SELECT 1 FROM public.companies LIMIT 1) THEN
    SELECT id INTO v_company_id FROM public.companies ORDER BY created_at LIMIT 1;
  ELSE
    INSERT INTO public.companies (company_name, status)
    VALUES ('預設公司', 'active')
    RETURNING id INTO v_company_id;
  END IF;

  -- Add every existing profile to the default company as admin (idempotent)
  FOR v_user IN SELECT id FROM public.profiles LOOP
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (v_company_id, v_user.id, 'admin')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Set current_company_id for every user that doesn't have one
  UPDATE public.profiles
  SET current_company_id = v_company_id
  WHERE current_company_id IS NULL;
END $$;

-- 7. Update handle_new_user to NOT auto-create a company (keep existing role assignment)
-- (No change needed; new users will be added to companies manually by super_admin)
