
-- 1) Harden guest cart session-header policies: require a sufficiently long token.
DROP POLICY IF EXISTS "Guest manage carts by session header" ON public.carts;
CREATE POLICY "Guest manage carts by session header" ON public.carts
  FOR ALL
  TO anon, authenticated
  USING (
    user_id IS NULL
    AND session_token IS NOT NULL
    AND length(session_token) >= 40
    AND session_token = NULLIF(((current_setting('request.headers', true))::json ->> 'x-cart-session'), '')
  )
  WITH CHECK (
    user_id IS NULL
    AND session_token IS NOT NULL
    AND length(session_token) >= 40
    AND session_token = NULLIF(((current_setting('request.headers', true))::json ->> 'x-cart-session'), '')
  );

DROP POLICY IF EXISTS "Guest manage cart items by session header" ON public.cart_items;
CREATE POLICY "Guest manage cart items by session header" ON public.cart_items
  FOR ALL
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id IS NULL
        AND c.session_token IS NOT NULL
        AND length(c.session_token) >= 40
        AND c.session_token = NULLIF(((current_setting('request.headers', true))::json ->> 'x-cart-session'), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id IS NULL
        AND c.session_token IS NOT NULL
        AND length(c.session_token) >= 40
        AND c.session_token = NULLIF(((current_setting('request.headers', true))::json ->> 'x-cart-session'), '')
    )
  );

-- 2) shop_content_questions: prevent anon from reading internal user_id (and author_name);
--    server function already masks author_name and never returns user_id publicly.
REVOKE SELECT ON public.shop_content_questions FROM anon;
GRANT SELECT (id, page_id, content, reply, replied_at, created_at, is_hidden) ON public.shop_content_questions TO anon;

-- 3) guest_signup_otps: defense-in-depth — explicitly revoke all access from anon/authenticated.
REVOKE ALL ON public.guest_signup_otps FROM anon;
REVOKE ALL ON public.guest_signup_otps FROM authenticated;
GRANT ALL ON public.guest_signup_otps TO service_role;
