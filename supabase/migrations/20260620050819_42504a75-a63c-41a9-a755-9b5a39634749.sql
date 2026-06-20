alter table public.profiles
  add column if not exists display_name text;

update public.profiles
set display_name = left(name, 2)
where (display_name is null or btrim(display_name) = '')
  and name is not null
  and btrim(name) <> '';