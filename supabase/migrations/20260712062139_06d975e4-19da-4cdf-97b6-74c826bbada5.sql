
-- ========== Atomic wallet operations (row-locked) ==========
CREATE OR REPLACE FUNCTION public.spend_cash_balance(_user_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur numeric;
  after_bal numeric;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT cash_balance INTO cur
    FROM public.member_points_wallet
    WHERE user_id = _user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.member_points_wallet(user_id, cash_balance)
      VALUES (_user_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
    cur := 0;
  END IF;

  IF cur < _amount THEN
    RAISE EXCEPTION 'insufficient cash balance (have %, need %)', cur, _amount
      USING ERRCODE = 'check_violation';
  END IF;

  after_bal := round((cur - _amount)::numeric, 2);
  UPDATE public.member_points_wallet
    SET cash_balance = after_bal,
        updated_at = now()
    WHERE user_id = _user_id;
  RETURN after_bal;
END;
$$;

CREATE OR REPLACE FUNCTION public.spend_shopping_points(_user_id uuid, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur integer;
  after_bal integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT shopping_points INTO cur
    FROM public.member_points_wallet
    WHERE user_id = _user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.member_points_wallet(user_id, shopping_points)
      VALUES (_user_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
    cur := 0;
  END IF;

  IF cur < _amount THEN
    RAISE EXCEPTION 'insufficient shopping points (have %, need %)', cur, _amount
      USING ERRCODE = 'check_violation';
  END IF;

  after_bal := cur - _amount;
  UPDATE public.member_points_wallet
    SET shopping_points = after_bal,
        updated_at = now()
    WHERE user_id = _user_id;
  RETURN after_bal;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_cash_balance(_user_id uuid, _delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur numeric;
  after_bal numeric;
BEGIN
  SELECT cash_balance INTO cur
    FROM public.member_points_wallet
    WHERE user_id = _user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.member_points_wallet(user_id, cash_balance)
      VALUES (_user_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
    cur := 0;
  END IF;

  after_bal := round((cur + coalesce(_delta, 0))::numeric, 2);
  IF after_bal < 0 THEN
    RAISE EXCEPTION 'cash balance cannot go negative (have %, delta %)', cur, _delta
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.member_points_wallet
    SET cash_balance = after_bal,
        updated_at = now()
    WHERE user_id = _user_id;
  RETURN after_bal;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_cash_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_shopping_points(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_cash_balance(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_cash_balance(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_shopping_points(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_cash_balance(uuid, numeric) TO service_role;

-- ========== Guest signup OTP verification & rate limit ==========
CREATE TABLE IF NOT EXISTS public.guest_signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  ip text,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.guest_signup_otps TO service_role;
ALTER TABLE public.guest_signup_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guest_otp service_role only"
  ON public.guest_signup_otps FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS guest_signup_otps_phone_idx
  ON public.guest_signup_otps (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_signup_otps_ip_idx
  ON public.guest_signup_otps (ip, created_at DESC);

-- Rate limit: max 5 send-requests per IP per hour, max 3 per phone per hour
CREATE OR REPLACE FUNCTION public.check_guest_signup_rate_limit(_ip text, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ip_count integer;
  phone_count integer;
BEGIN
  IF _ip IS NOT NULL THEN
    SELECT count(*) INTO ip_count
      FROM public.guest_signup_otps
      WHERE ip = _ip AND created_at > now() - interval '1 hour';
    IF ip_count >= 5 THEN
      RAISE EXCEPTION 'rate_limited_ip' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT count(*) INTO phone_count
    FROM public.guest_signup_otps
    WHERE phone = _phone AND created_at > now() - interval '1 hour';
  IF phone_count >= 3 THEN
    RAISE EXCEPTION 'rate_limited_phone' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Verify OTP: returns true and marks consumed; increments attempts on failure
CREATE OR REPLACE FUNCTION public.verify_guest_signup_otp(_phone text, _email text, _code_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT id, code_hash, attempts, expires_at, consumed_at INTO rec
    FROM public.guest_signup_otps
    WHERE phone = _phone AND email = _email
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF rec.consumed_at IS NOT NULL THEN RETURN false; END IF;
  IF rec.expires_at < now() THEN RETURN false; END IF;
  IF rec.attempts >= 5 THEN RETURN false; END IF;

  IF rec.code_hash <> _code_hash THEN
    UPDATE public.guest_signup_otps
      SET attempts = attempts + 1
      WHERE id = rec.id;
    RETURN false;
  END IF;

  UPDATE public.guest_signup_otps
    SET consumed_at = now()
    WHERE id = rec.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_guest_signup_rate_limit(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_guest_signup_otp(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_guest_signup_rate_limit(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_guest_signup_otp(text, text, text) TO service_role;
