-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Diagnose member quick-login blockers for marketing_slug, company binding, and website ID slug.
-- OWNER_APPROVAL: User requested A-E diagnostics before production repair.
-- CHATGPT_REVIEW: Required before executing any follow-up repair SQL.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: none; read-only diagnostics.
-- ROLLBACK: none; read-only diagnostics.

-- SECTION: backup
select 'backup_not_required_read_only_diagnostics' as backup_status;

-- SECTION: apply
select 'apply_not_required_read_only_diagnostics' as apply_status;

-- SECTION: verify

-- A. Members with missing marketing_slug. These cannot use a marketing alias until fixed.
select
  'A_missing_marketing_slug' as check_name,
  p.id,
  p.member_no,
  p.name,
  p.email,
  p.marketing_slug,
  p.current_company_id
from public.profiles p
where p.member_no is not null
  and (p.marketing_slug is null or btrim(p.marketing_slug) = '')
order by p.created_at desc nulls last;

-- B. Duplicate marketing_slug values, case-insensitive.
select
  'B_duplicate_marketing_slug' as check_name,
  lower(p.marketing_slug) as marketing_slug_key,
  count(*) as profile_count,
  array_agg(p.member_no order by p.member_no) as member_nos,
  array_agg(p.name order by p.member_no) as names
from public.profiles p
where p.marketing_slug is not null
  and btrim(p.marketing_slug) <> ''
group by lower(p.marketing_slug)
having count(*) > 1
order by lower(p.marketing_slug);

-- C. A member marketing_slug collides with another member_no.
select
  'C_marketing_slug_collides_member_no' as check_name,
  p.id,
  p.member_no,
  p.name,
  p.marketing_slug,
  other.id as conflict_profile_id,
  other.member_no as conflict_member_no,
  other.name as conflict_name
from public.profiles p
join public.profiles other
  on other.id <> p.id
 and other.member_no is not null
 and lower(other.member_no) = lower(p.marketing_slug)
where p.marketing_slug is not null
  and btrim(p.marketing_slug) <> ''
order by p.member_no;

-- D. Members without current_company_id. Company-scoped login cannot resolve these safely.
select
  'D_missing_company_binding' as check_name,
  p.id,
  p.member_no,
  p.name,
  p.email,
  p.phone,
  p.marketing_slug,
  p.current_company_id
from public.profiles p
where p.member_no is not null
  and p.current_company_id is null
order by p.created_at desc nulls last;

-- E1. Company website IDs and recommended ST + tax_id last four code.
select
  'E_company_slug_review' as check_name,
  c.id,
  c.company_name,
  c.slug,
  c.tax_id,
  case
    when c.tax_id ~ '^[0-9]{8}$' then 'ST' || right(c.tax_id, 4)
    else null
  end as recommended_website_id,
  c.status
from public.companies c
order by c.company_name;

-- E2. Recommended website ID collisions. These require manual decision before changing company slugs.
select
  'E_recommended_website_id_collision' as check_name,
  recommended_website_id,
  count(*) as company_count,
  array_agg(company_name order by company_name) as company_names,
  array_agg(id order by company_name) as company_ids
from (
  select
    c.id,
    c.company_name,
    case
      when c.tax_id ~ '^[0-9]{8}$' then 'ST' || right(c.tax_id, 4)
      else null
    end as recommended_website_id
  from public.companies c
) x
where recommended_website_id is not null
group by recommended_website_id
having count(*) > 1
order by recommended_website_id;

-- F. Login blocker summary by category.
select
  'F_summary' as check_name,
  (select count(*) from public.profiles p where p.member_no is not null and (p.marketing_slug is null or btrim(p.marketing_slug) = '')) as missing_marketing_slug_count,
  (select count(*) from (
    select lower(marketing_slug)
    from public.profiles
    where marketing_slug is not null and btrim(marketing_slug) <> ''
    group by lower(marketing_slug)
    having count(*) > 1
  ) d) as duplicate_marketing_slug_keys,
  (select count(*) from public.profiles p where p.member_no is not null and p.current_company_id is null) as missing_company_binding_count,
  (select count(*) from public.companies c where c.tax_id !~ '^[0-9]{8}$' or c.tax_id is null) as companies_without_valid_tax_id_count;

-- SECTION: rollback
select 'rollback_not_required_read_only_diagnostics' as rollback_status;
