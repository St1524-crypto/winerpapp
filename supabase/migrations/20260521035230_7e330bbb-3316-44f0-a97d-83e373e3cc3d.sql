-- Use company_name as the public slug (preserves CJK), with uniqueness suffix on collision

CREATE OR REPLACE FUNCTION public.slugify_company_name(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  s := COALESCE(_name, '');
  s := btrim(s);
  -- collapse whitespace to single dash
  s := regexp_replace(s, '\s+', '-', 'g');
  -- strip characters that are problematic in URL paths
  s := regexp_replace(s, '[\/\?#&%\\<>"`]', '', 'g');
  IF s = '' THEN
    s := substr(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_company_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  i int := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := public.slugify_company_name(NEW.company_name);
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
      i := i + 1;
      candidate := base || '-' || i::text;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: replace UUID-prefix slugs with company-name slugs
DO $$
DECLARE
  r record;
  base text;
  candidate text;
  i int;
BEGIN
  FOR r IN SELECT id, company_name, slug FROM public.companies ORDER BY created_at LOOP
    -- only replace if slug looks like an 8-char hex (auto-generated default)
    IF r.slug ~ '^[a-f0-9]{8}$' THEN
      base := public.slugify_company_name(r.company_name);
      candidate := base;
      i := 0;
      WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = candidate AND id <> r.id) LOOP
        i := i + 1;
        candidate := base || '-' || i::text;
      END LOOP;
      UPDATE public.companies SET slug = candidate WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
