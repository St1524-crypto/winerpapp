-- Atomic default address toggle
CREATE OR REPLACE FUNCTION public.set_default_address(_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id FROM public.customer_addresses WHERE id = _address_id;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Address not found';
  END IF;
  IF _user_id <> auth.uid() AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.customer_addresses
     SET is_default = (id = _address_id),
         updated_at = now()
   WHERE user_id = _user_id;
END;
$$;

-- Ensure only one default per user at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_per_user
  ON public.customer_addresses(user_id)
  WHERE is_default = true;