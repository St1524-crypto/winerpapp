ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_marketing_slug_uidx
  ON public.profiles (lower(marketing_slug))
  WHERE marketing_slug IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_marketing_slug_format_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_marketing_slug_format_chk
  CHECK (marketing_slug IS NULL OR marketing_slug ~ '^[A-Za-z0-9_-]{3,32}$');