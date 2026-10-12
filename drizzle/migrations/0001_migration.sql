-- Guest carts: replace header-based RLS with token-parameter security-definer RPCs
DROP POLICY IF EXISTS "Guest manage cart items by session header" ON public.cart_items;
DROP POLICY IF EXISTS "Guest manage carts by session header" ON public.carts;
REVOKE ALL ON public.cart_items FROM anon;
REVOKE ALL ON public.carts FROM anon;

CREATE OR REPLACE FUNCTION public.guest_cart_ensure(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 64 THEN RAISE EXCEPTION 'invalid cart token'; END IF;
  SELECT id INTO _id FROM carts WHERE session_token = _token AND user_id IS NULL
    AND updated_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT 1;
  IF _id IS NULL THEN
    INSERT INTO carts(session_token) VALUES (_token) RETURNING id INTO _id;
  ELSE
    UPDATE carts SET updated_at = now() WHERE id = _id;
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.guest_cart_items(_token text)
RETURNS SETOF public.cart_items LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ci.* FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
  WHERE c.session_token = _token AND c.user_id IS NULL AND length(_token) >= 64
    AND c.updated_at > now() - interval '14 days'
  ORDER BY ci.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.guest_cart_add(_token text, _product_id uuid, _qty int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid; _iid uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 OR _qty > 9999 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
  _cid := public.guest_cart_ensure(_token);
  SELECT id INTO _iid FROM cart_items WHERE cart_id = _cid AND product_id = _product_id AND bundle_line_key IS NULL LIMIT 1;
  IF _iid IS NULL THEN
    INSERT INTO cart_items(cart_id, product_id, quantity) VALUES (_cid, _product_id, _qty);
  ELSE
    UPDATE cart_items SET quantity = LEAST(quantity + _qty, 9999) WHERE id = _iid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guest_cart_set_qty(_token text, _item_id uuid, _qty int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  _cid := public.guest_cart_ensure(_token);
  IF _qty IS NULL OR _qty <= 0 THEN
    DELETE FROM cart_items WHERE id = _item_id AND cart_id = _cid;
  ELSE
    UPDATE cart_items SET quantity = LEAST(_qty, 9999) WHERE id = _item_id AND cart_id = _cid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guest_cart_clear(_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  _cid := public.guest_cart_ensure(_token);
  DELETE FROM cart_items WHERE cart_id = _cid;
END $$;

-- Signed-in user: merge guest cart into own cart (or adopt it)
CREATE OR REPLACE FUNCTION public.guest_cart_claim(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ucart uuid; _gcart uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO _ucart FROM carts WHERE user_id = _uid ORDER BY created_at DESC LIMIT 1;
  IF _token IS NOT NULL AND length(_token) >= 64 THEN
    SELECT id INTO _gcart FROM carts WHERE session_token = _token AND user_id IS NULL ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF _gcart IS NOT NULL THEN
    IF _ucart IS NULL THEN
      UPDATE carts SET user_id = _uid, session_token = NULL, updated_at = now() WHERE id = _gcart;
      RETURN _gcart;
    END IF;
    INSERT INTO cart_items(cart_id, product_id, quantity, bundle_id, bundle_line_key)
      SELECT _ucart, product_id, quantity, bundle_id, bundle_line_key FROM cart_items WHERE cart_id = _gcart;
    DELETE FROM carts WHERE id = _gcart;
  END IF;
  IF _ucart IS NULL THEN
    INSERT INTO carts(user_id) VALUES (_uid) RETURNING id INTO _ucart;
  END IF;
  RETURN _ucart;
END $$;

REVOKE ALL ON FUNCTION public.guest_cart_ensure(text), public.guest_cart_items(text), public.guest_cart_add(text,uuid,int),
  public.guest_cart_set_qty(text,uuid,int), public.guest_cart_clear(text), public.guest_cart_claim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_cart_ensure(text), public.guest_cart_items(text), public.guest_cart_add(text,uuid,int),
  public.guest_cart_set_qty(text,uuid,int), public.guest_cart_clear(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_cart_claim(text) TO authenticated;