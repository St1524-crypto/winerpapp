
-- 1) Harden guest cart RLS: require freshness + 64-char token, restrict to anon role
DROP POLICY IF EXISTS "Guest manage carts by session header" ON public.carts;
CREATE POLICY "Guest manage carts by session header"
ON public.carts
FOR ALL
TO anon
USING (
  user_id IS NULL
  AND session_token IS NOT NULL
  AND length(session_token) >= 64
  AND session_token = NULLIF(((current_setting('request.headers'::text, true))::json ->> 'x-cart-session'), '')
  AND updated_at > (now() - interval '30 days')
)
WITH CHECK (
  user_id IS NULL
  AND session_token IS NOT NULL
  AND length(session_token) >= 64
  AND session_token = NULLIF(((current_setting('request.headers'::text, true))::json ->> 'x-cart-session'), '')
);

DROP POLICY IF EXISTS "Guest manage cart items by session header" ON public.cart_items;
CREATE POLICY "Guest manage cart items by session header"
ON public.cart_items
FOR ALL
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id IS NULL
      AND c.session_token IS NOT NULL
      AND length(c.session_token) >= 64
      AND c.session_token = NULLIF(((current_setting('request.headers'::text, true))::json ->> 'x-cart-session'), '')
      AND c.updated_at > (now() - interval '30 days')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id IS NULL
      AND c.session_token IS NOT NULL
      AND length(c.session_token) >= 64
      AND c.session_token = NULLIF(((current_setting('request.headers'::text, true))::json ->> 'x-cart-session'), '')
  )
);

-- 2) Restrict operations policies from public role to authenticated role
DROP POLICY IF EXISTS ops_ai_admin_all ON public.operation_ai_summaries;
CREATE POLICY ops_ai_admin_all ON public.operation_ai_summaries
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role));

DROP POLICY IF EXISTS ops_att_admin_all ON public.operation_attendance_logs;
CREATE POLICY ops_att_admin_all ON public.operation_attendance_logs
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role) OR (public.get_operation_role(auth.uid()) = 'manager'::public.operation_role));

DROP POLICY IF EXISTS ops_att_self_insert ON public.operation_attendance_logs;
CREATE POLICY ops_att_self_insert ON public.operation_attendance_logs
FOR INSERT TO authenticated
WITH CHECK ((user_id = auth.uid()) AND public.is_operation_participant(auth.uid()));

DROP POLICY IF EXISTS ops_att_self_read ON public.operation_attendance_logs;
CREATE POLICY ops_att_self_read ON public.operation_attendance_logs
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS ops_participants_admin_all ON public.operation_participants;
CREATE POLICY ops_participants_admin_all ON public.operation_participants
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS ops_participants_self_read ON public.operation_participants;
CREATE POLICY ops_participants_self_read ON public.operation_participants
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3) Add RESTRICTIVE tenant-scope policy on quotes (aligns with quote_items pattern)
DROP POLICY IF EXISTS "quotes tenant_scope restrictive" ON public.quotes;
CREATE POLICY "quotes tenant_scope restrictive"
ON public.quotes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id())
)
WITH CHECK (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR (company_id = private.current_company_id())
);
