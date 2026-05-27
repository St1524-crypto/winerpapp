
-- ===== Carts =====
DROP POLICY IF EXISTS "Users manage own carts" ON public.carts;
DROP POLICY IF EXISTS "Anon manage carts by session" ON public.carts;

CREATE POLICY "Users manage own carts auth" ON public.carts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Guest manage carts by session header" ON public.carts
  FOR ALL TO anon, authenticated
  USING (
    user_id IS NULL
    AND session_token IS NOT NULL
    AND session_token = nullif(current_setting('request.headers', true)::json->>'x-cart-session', '')
  )
  WITH CHECK (
    user_id IS NULL
    AND session_token IS NOT NULL
    AND session_token = nullif(current_setting('request.headers', true)::json->>'x-cart-session', '')
  );

-- ===== Cart items =====
DROP POLICY IF EXISTS "Users manage own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Anon manage cart items" ON public.cart_items;

CREATE POLICY "Users manage own cart items auth" ON public.cart_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid())
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid())
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Guest manage cart items by session header" ON public.cart_items
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id IS NULL
        AND c.session_token IS NOT NULL
        AND c.session_token = nullif(current_setting('request.headers', true)::json->>'x-cart-session', '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id IS NULL
        AND c.session_token IS NOT NULL
        AND c.session_token = nullif(current_setting('request.headers', true)::json->>'x-cart-session', '')
    )
  );

-- ===== Orders =====
DROP POLICY IF EXISTS "Authenticated view orders" ON public.orders;
CREATE POLICY "Staff view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- ===== Inventory logs =====
DROP POLICY IF EXISTS "Authenticated view inventory" ON public.inventory_logs;
CREATE POLICY "Staff view inventory logs" ON public.inventory_logs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- ===== Inventory transactions =====
DROP POLICY IF EXISTS "Authenticated view inv tx" ON public.inventory_transactions;
CREATE POLICY "Staff view inventory tx" ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'finance'::app_role)
  );

-- ===== Storage SELECT policies =====
DROP POLICY IF EXISTS "Product images public read" ON storage.objects;
CREATE POLICY "Product images public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Branding read scoped" ON storage.objects;
CREATE POLICY "Branding read scoped" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'branding' AND (
      (storage.foldername(name))[1] = 'companies'
      OR (
        auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = 'pending'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
      OR private.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- ===== Harden internal email-queue helpers =====
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
