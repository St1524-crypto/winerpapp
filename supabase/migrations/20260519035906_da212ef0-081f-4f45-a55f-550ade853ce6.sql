
-- Granular role-based RLS policies for each module

-- PRODUCTS: sales/warehouse can manage; all authenticated can view
DROP POLICY IF EXISTS "Sales warehouse manage products" ON public.products;
CREATE POLICY "Sales warehouse manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'warehouse'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'warehouse'));

-- INVENTORY LOGS: warehouse can manage
DROP POLICY IF EXISTS "Warehouse manage inventory logs" ON public.inventory_logs;
CREATE POLICY "Warehouse manage inventory logs" ON public.inventory_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'warehouse'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'warehouse'));

-- ORDERS: sales/finance can manage
DROP POLICY IF EXISTS "Sales finance manage orders" ON public.orders;
CREATE POLICY "Sales finance manage orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'finance'));

-- PROFILES: super_admin can view all profiles (for member management)
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- USER_ROLES: already covered (super_admin manages, users view own)
