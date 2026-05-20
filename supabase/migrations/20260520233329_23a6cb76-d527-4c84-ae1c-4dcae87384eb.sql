ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_dealer boolean NOT NULL DEFAULT false;

-- Allow users to read their own is_dealer flag (already covered by existing "Users view own profile" policy).
-- Allow admins/sales to view all profiles' dealer flag for management.
DROP POLICY IF EXISTS "Sales view all profiles" ON public.profiles;
CREATE POLICY "Sales view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'sales'::app_role));

-- Allow admins to update is_dealer (already covered by "Admins update all profiles"); add admin role too.
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role)
      OR private.has_role(auth.uid(), 'admin'::app_role));