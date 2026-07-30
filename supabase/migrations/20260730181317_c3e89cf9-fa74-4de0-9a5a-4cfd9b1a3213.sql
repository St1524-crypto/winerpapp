DROP INDEX IF EXISTS public.profiles_phone_uidx;

CREATE INDEX IF NOT EXISTS profiles_phone_idx ON public.profiles (phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_profile_phone_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.profiles p
  WHERE p.phone = NEW.phone
    AND p.id <> NEW.id;

  IF cnt >= 3 THEN
    RAISE EXCEPTION '此電話號碼已達註冊上限（最多 3 位會員）';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_phone_limit ON public.profiles;
CREATE TRIGGER trg_profiles_phone_limit
BEFORE INSERT OR UPDATE OF phone ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_phone_limit();