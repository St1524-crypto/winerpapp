-- Make slug nullable so inserts without slug succeed, then trigger fills it
ALTER TABLE public.companies ALTER COLUMN slug DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_company_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(substr(COALESCE(NEW.id::text, gen_random_uuid()::text), 1, 8), '[^a-z0-9]', '', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_slug ON public.companies;
CREATE TRIGGER trg_set_company_slug
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.set_company_slug();