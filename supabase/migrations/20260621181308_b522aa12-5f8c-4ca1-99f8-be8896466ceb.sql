
CREATE OR REPLACE FUNCTION public.ensure_profile_marketing_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _slug text;
  _member_no text;
  _phone text;
  _user_provided boolean;
begin
  _member_no := nullif(btrim(new.member_no), '');
  _phone := nullif(btrim(new.phone), '');
  _slug := nullif(btrim(new.marketing_slug), '');
  _user_provided := _slug is not null
    and (TG_OP = 'INSERT' or _slug is distinct from nullif(btrim(old.marketing_slug), ''));

  if _slug is null then
    if _phone is not null and _phone ~ '^[A-Za-z0-9_-]{3,32}$'
       and not exists (
         select 1 from public.profiles p
         where p.id <> new.id
           and (lower(p.marketing_slug) = lower(_phone)
                or lower(p.member_no) = lower(_phone))
       )
    then
      _slug := _phone;
    elsif _member_no is not null then
      _slug := _member_no;
    end if;
  end if;

  if _slug is not null then
    if _slug !~ '^[A-Za-z0-9_-]{3,32}$' then
      if _user_provided then
        raise exception 'marketing_slug_format_invalid' using errcode = '23514';
      else
        _slug := _member_no;
      end if;
    end if;

    if _slug is not null and exists (
      select 1 from public.profiles p
      where p.id <> new.id
        and (lower(p.marketing_slug) = lower(_slug)
             or lower(p.member_no) = lower(_slug))
      limit 1
    ) then
      if _user_provided then
        raise exception 'marketing_slug_conflict' using errcode = '23505';
      else
        _slug := _member_no;
      end if;
    end if;
  end if;

  if _member_no is not null and exists (
    select 1 from public.profiles p
    where p.id <> new.id
      and p.marketing_slug is not null
      and lower(p.marketing_slug) = lower(_member_no)
    limit 1
  ) then
    raise exception 'member_no_marketing_slug_conflict' using errcode = '23505';
  end if;

  new.marketing_slug := _slug;
  return new;
end;
$function$;
