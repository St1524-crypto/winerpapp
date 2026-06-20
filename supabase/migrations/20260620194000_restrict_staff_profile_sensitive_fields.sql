-- Restrict full profile reads to admin roles.
--
-- profiles contains sensitive member fields such as phone, birthday, id_no,
-- addr_home, and addr_mail. Sales / finance workflows must not receive full
-- profile rows directly; expose scoped safe views or RPCs for those workflows
-- instead of broad table SELECT.

DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;

CREATE POLICY "Admins view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);
