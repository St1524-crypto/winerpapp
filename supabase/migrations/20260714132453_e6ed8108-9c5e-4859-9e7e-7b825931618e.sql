
DO $$
DECLARE r record; cfg text; new_cfg text;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public','private')
  LOOP
    cfg := NULL;
    IF r.proconfig IS NOT NULL THEN
      SELECT c INTO cfg FROM unnest(r.proconfig) c WHERE c LIKE 'search_path=%' LIMIT 1;
    END IF;
    IF cfg IS NULL THEN
      new_cfg := 'public, pg_temp';
    ELSE
      IF position('pg_temp' in cfg) > 0 THEN CONTINUE; END IF;
      -- Skip functions intentionally pinned to empty search_path
      IF cfg = 'search_path=""' OR cfg = 'search_path=' THEN CONTINUE; END IF;
      new_cfg := substring(cfg from 13) || ', pg_temp';
    END IF;
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %s',
                   r.nspname, r.proname, r.args, new_cfg);
  END LOOP;
END $$;

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
  AND updated_at > (now() - interval '14 days')
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
      AND c.updated_at > (now() - interval '14 days')
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

DROP POLICY IF EXISTS "Block anon insert on cooperation applications" ON public.cooperation_applications;
CREATE POLICY "Block anon insert on cooperation applications"
ON public.cooperation_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (false);
