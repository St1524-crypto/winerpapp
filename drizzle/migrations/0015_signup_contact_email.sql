CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _phone text;
  _name text;
  _email text;
  _company_slug text;
  _company_id uuid;
BEGIN
  _email := COALESCE(NULLIF(lower(trim(NEW.raw_user_meta_data->>'contact_email')),''), NEW.email);
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