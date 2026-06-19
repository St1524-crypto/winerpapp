-- Target backend: wvhvjdqbrftjggwwetwf (production)
-- Keep member marketing slugs unique against both marketing_slug and member_no.
-- Also default an empty marketing_slug to the member's member_no.

create or replace function public.ensure_profile_marketing_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  _slug text;
  _member_no text;
begin
  _member_no := nullif(btrim(new.member_no), '');
  _slug := nullif(btrim(new.marketing_slug), '');

  if _slug is null and _member_no is not null then
    _slug := _member_no;
  end if;

  if _slug is not null then
    if _slug !~ '^[A-Za-z0-9_-]{3,32}$' then
      raise exception 'marketing_slug_format_invalid'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.profiles p
      where p.id <> new.id
        and (
          lower(p.marketing_slug) = lower(_slug)
          or lower(p.member_no) = lower(_slug)
        )
      limit 1
    ) then
      raise exception 'marketing_slug_conflict'
        using errcode = '23505';
    end if;
  end if;

  if _member_no is not null and exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and p.marketing_slug is not null
      and lower(p.marketing_slug) = lower(_member_no)
    limit 1
  ) then
    raise exception 'member_no_marketing_slug_conflict'
      using errcode = '23505';
  end if;

  new.marketing_slug := _slug;
  return new;
end;
$$;

drop trigger if exists ensure_profile_marketing_slug_trigger on public.profiles;
create trigger ensure_profile_marketing_slug_trigger
before insert or update of marketing_slug, member_no on public.profiles
for each row
execute function public.ensure_profile_marketing_slug();

update public.profiles p
set marketing_slug = p.member_no
where (p.marketing_slug is null or btrim(p.marketing_slug) = '')
  and p.member_no is not null
  and p.member_no ~ '^[A-Za-z0-9_-]{3,32}$'
  and not exists (
    select 1
    from public.profiles other
    where other.id <> p.id
      and other.marketing_slug is not null
      and lower(other.marketing_slug) = lower(p.member_no)
  );