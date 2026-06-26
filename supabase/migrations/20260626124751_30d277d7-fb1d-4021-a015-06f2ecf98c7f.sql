
-- Merge duplicate guest carts per session_token: keep the oldest, move all items to it, delete others.
WITH ranked AS (
  SELECT id, session_token,
         FIRST_VALUE(id) OVER (PARTITION BY session_token ORDER BY created_at ASC) AS keep_id
  FROM public.carts
  WHERE user_id IS NULL AND session_token IS NOT NULL
)
UPDATE public.cart_items ci
SET cart_id = r.keep_id
FROM ranked r
WHERE ci.cart_id = r.id AND r.id <> r.keep_id;

DELETE FROM public.carts c
USING (
  SELECT id, FIRST_VALUE(id) OVER (PARTITION BY session_token ORDER BY created_at ASC) AS keep_id
  FROM public.carts
  WHERE user_id IS NULL AND session_token IS NOT NULL
) r
WHERE c.id = r.id AND r.id <> r.keep_id;

-- Likewise dedupe per-user carts
WITH ranked AS (
  SELECT id, user_id,
         FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY created_at ASC) AS keep_id
  FROM public.carts
  WHERE user_id IS NOT NULL
)
UPDATE public.cart_items ci
SET cart_id = r.keep_id
FROM ranked r
WHERE ci.cart_id = r.id AND r.id <> r.keep_id;

DELETE FROM public.carts c
USING (
  SELECT id, FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY created_at ASC) AS keep_id
  FROM public.carts
  WHERE user_id IS NOT NULL
) r
WHERE c.id = r.id AND r.id <> r.keep_id;

-- Prevent regression
CREATE UNIQUE INDEX IF NOT EXISTS carts_guest_session_unique
  ON public.carts (session_token) WHERE user_id IS NULL AND session_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS carts_user_unique
  ON public.carts (user_id) WHERE user_id IS NOT NULL;
