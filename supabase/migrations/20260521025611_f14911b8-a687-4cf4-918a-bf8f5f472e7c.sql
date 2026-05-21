-- 1. companies.slug
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;

-- backfill slug from id短碼
UPDATE public.companies
SET slug = lower(regexp_replace(substr(id::text, 1, 8), '[^a-z0-9]', '', 'g'))
WHERE slug IS NULL OR slug = '';

ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_uidx ON public.companies(slug);

-- 2. public list / lookup functions (SECURITY DEFINER, only exposes safe fields)
CREATE OR REPLACE FUNCTION public.get_public_companies()
RETURNS TABLE(id uuid, slug text, company_name text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.company_name, c.logo_url
  FROM public.companies c
  WHERE c.status = 'active'
  ORDER BY c.company_name
$$;

CREATE OR REPLACE FUNCTION public.get_company_by_slug(_slug text)
RETURNS TABLE(id uuid, slug text, company_name text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.slug, c.company_name, c.logo_url
  FROM public.companies c
  WHERE c.status = 'active' AND c.slug = _slug
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_public_companies() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_by_slug(text) TO anon, authenticated;

-- 3. 更新 handle_new_user：依 user_metadata.company_slug 綁定公司
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _phone text;
  _name text;
  _email text;
  _company_slug text;
  _company_id uuid;
BEGIN
  _email := NEW.email;
  _phone := COALESCE(NEW.phone, NULLIF(NEW.raw_user_meta_data->>'phone',''));
  _name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name',''),
    CASE WHEN _email IS NOT NULL AND _email <> '' THEN split_part(_email,'@',1)
         ELSE COALESCE(_phone, 'user') END
  );
  _company_slug := NULLIF(NEW.raw_user_meta_data->>'company_slug','');

  IF _company_slug IS NOT NULL THEN
    SELECT id INTO _company_id FROM public.companies
      WHERE slug = _company_slug AND status = 'active' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, name, email, phone, member_no, current_company_id)
  VALUES (NEW.id, _name, _email, _phone, public.generate_member_no(), _company_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  IF _company_id IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (_company_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;