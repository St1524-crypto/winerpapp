-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Safely repair member quick-login data where the correct value can be derived without guessing.
-- OWNER_APPROVAL: User requested safe automatic repair after diagnostics, with backup, verify, and rollback.
-- CHATGPT_REVIEW: Review required before validate_only=false execution.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: ops_backup.member_login_data_safe_repair_20260620_profiles, ops_backup.member_login_data_safe_repair_20260620_companies
-- ROLLBACK: Execute the SECTION: rollback statements manually if verification fails.

-- SECTION: backup
begin;

create schema if not exists ops_backup;

drop table if exists ops_backup.member_login_data_safe_repair_20260620_profiles;
create table ops_backup.member_login_data_safe_repair_20260620_profiles as
select
  p.*,
  now() as backed_up_at
from public.profiles p
where p.member_no is not null
  and (
    p.marketing_slug is null
    or btrim(p.marketing_slug) = ''
    or p.member_no in ('TW17H00032', 'M000005')
  );

drop table if exists ops_backup.member_login_data_safe_repair_20260620_companies;
create table ops_backup.member_login_data_safe_repair_20260620_companies as
select
  c.*,
  now() as backed_up_at
from public.companies c
where c.tax_id ~ '^[0-9]{8}$'
  and c.slug is distinct from ('ST' || right(c.tax_id, 4))
  and not exists (
    select 1
    from public.companies other
    where other.id <> c.id
      and lower(other.slug) = lower('ST' || right(c.tax_id, 4))
  )
  and not exists (
    select 1
    from public.companies same_code
    where same_code.id <> c.id
      and same_code.tax_id ~ '^[0-9]{8}$'
      and lower('ST' || right(same_code.tax_id, 4)) = lower('ST' || right(c.tax_id, 4))
  );

-- SECTION: apply

-- 1. Safe default: empty marketing_slug becomes the member's own member_no only when no conflict exists.
update public.profiles p
set marketing_slug = p.member_no
where p.member_no is not null
  and (p.marketing_slug is null or btrim(p.marketing_slug) = '')
  and p.member_no ~ '^[A-Za-z0-9_-]{3,32}$'
  and not exists (
    select 1
    from public.profiles other
    where other.id <> p.id
      and (
        lower(other.marketing_slug) = lower(p.member_no)
        or lower(other.member_no) = lower(p.member_no)
      )
  );

-- 2. Known reviewed move: return stsunnice8899 from legacy no-company member to the active M000005 account.
-- This runs only when the exact source/target state matches the diagnosed issue.
update public.profiles p
set marketing_slug = p.member_no
where p.member_no = 'TW17H00032'
  and lower(p.marketing_slug) = lower('stsunnice8899')
  and p.current_company_id is null
  and exists (
    select 1
    from public.profiles target
    where target.member_no = 'M000005'
      and target.current_company_id is not null
  );

update public.profiles p
set marketing_slug = 'stsunnice8899'
where p.member_no = 'M000005'
  and p.current_company_id is not null
  and not exists (
    select 1
    from public.profiles other
    where other.id <> p.id
      and (
        lower(other.marketing_slug) = lower('stsunnice8899')
        or lower(other.member_no) = lower('stsunnice8899')
      )
  );

-- 3. Safe company website ID: set slug to ST + tax_id last four only when unique and collision-free.
update public.companies c
set slug = 'ST' || right(c.tax_id, 4)
where c.tax_id ~ '^[0-9]{8}$'
  and c.slug is distinct from ('ST' || right(c.tax_id, 4))
  and not exists (
    select 1
    from public.companies other
    where other.id <> c.id
      and lower(other.slug) = lower('ST' || right(c.tax_id, 4))
  )
  and not exists (
    select 1
    from public.companies same_code
    where same_code.id <> c.id
      and same_code.tax_id ~ '^[0-9]{8}$'
      and lower('ST' || right(same_code.tax_id, 4)) = lower('ST' || right(c.tax_id, 4))
  );

-- SECTION: verify

select
  'verify_missing_marketing_slug' as check_name,
  count(*) as remaining_count
from public.profiles p
where p.member_no is not null
  and (p.marketing_slug is null or btrim(p.marketing_slug) = '');

select
  'verify_duplicate_marketing_slug_keys' as check_name,
  count(*) as duplicate_key_count
from (
  select lower(marketing_slug)
  from public.profiles
  where marketing_slug is not null
    and btrim(marketing_slug) <> ''
  group by lower(marketing_slug)
  having count(*) > 1
) d;

select
  'verify_marketing_slug_collides_member_no' as check_name,
  count(*) as collision_count
from public.profiles p
join public.profiles other
  on other.id <> p.id
 and other.member_no is not null
 and lower(other.member_no) = lower(p.marketing_slug)
where p.marketing_slug is not null
  and btrim(p.marketing_slug) <> '';

select
  'verify_stsunnice' as check_name,
  p.member_no,
  p.name,
  p.marketing_slug,
  p.current_company_id,
  c.company_name,
  c.slug as company_slug
from public.profiles p
left join public.companies c on c.id = p.current_company_id
where p.member_no in ('TW17H00032', 'M000005')
order by p.member_no;

select
  'verify_company_website_ids' as check_name,
  c.id,
  c.company_name,
  c.tax_id,
  c.slug,
  case
    when c.tax_id ~ '^[0-9]{8}$' then 'ST' || right(c.tax_id, 4)
    else null
  end as recommended_website_id,
  c.status
from public.companies c
order by c.company_name;

commit;

-- SECTION: rollback
-- Manual rollback, run only if needed:
-- begin;
-- update public.profiles p
-- set
--   name = b.name,
--   email = b.email,
--   phone = b.phone,
--   member_no = b.member_no,
--   marketing_slug = b.marketing_slug,
--   current_company_id = b.current_company_id
-- from ops_backup.member_login_data_safe_repair_20260620_profiles b
-- where p.id = b.id;
--
-- update public.companies c
-- set
--   company_name = b.company_name,
--   tax_id = b.tax_id,
--   slug = b.slug,
--   status = b.status
-- from ops_backup.member_login_data_safe_repair_20260620_companies b
-- where c.id = b.id;
-- commit;
