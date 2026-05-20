
-- Add columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_no text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_member_no_uidx ON public.profiles(member_no);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_uidx ON public.profiles(phone) WHERE phone IS NOT NULL;

-- Sequence for member numbers
CREATE SEQUENCE IF NOT EXISTS public.member_no_seq START WITH 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.generate_member_no()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'M' || lpad(nextval('public.member_no_seq')::text, 6, '0')
$$;

-- Update handle_new_user to populate member_no and phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone text;
  _name text;
  _email text;
BEGIN
  _email := NEW.email;
  _phone := COALESCE(NEW.phone, NULLIF(NEW.raw_user_meta_data->>'phone',''));
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name',''),
    CASE WHEN _email IS NOT NULL AND _email <> '' THEN split_part(_email,'@',1)
         ELSE COALESCE(_phone, 'user') END
  );

  INSERT INTO public.profiles (id, name, email, phone, member_no)
  VALUES (NEW.id, _name, _email, _phone, public.generate_member_no());

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill existing profiles without member_no
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE member_no IS NULL ORDER BY created_at LOOP
    UPDATE public.profiles SET member_no = public.generate_member_no() WHERE id = r.id;
  END LOOP;
END $$;

-- Backfill phone from auth.users for existing profiles
UPDATE public.profiles p
SET phone = u.phone
FROM auth.users u
WHERE p.id = u.id AND p.phone IS NULL AND u.phone IS NOT NULL AND u.phone <> '';
