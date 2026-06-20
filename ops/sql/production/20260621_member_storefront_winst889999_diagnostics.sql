-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Read-only diagnostics for /member-page/winst889999 returning not found.
-- OWNER_APPROVAL: User requested Codex to fix the production storefront lookup after Lovable publish.
-- CHATGPT_REVIEW: Read-only diagnostics only; no data mutation is performed by this SQL.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: none; read-only diagnostics.
-- ROLLBACK: not required; no data changes.

-- SECTION: backup
select 'backup_not_required_read_only_diagnostics' as section;

-- SECTION: apply
select 'apply_not_required_read_only_diagnostics' as section;

-- SECTION: verify
select 'exact_or_supported_lookup_matches' as section;

select
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  phone,
  email,
  member_status,
  frozen_code,
  brand_name,
  page_template,
  current_company_id,
  created_at,
  updated_at
from public.profiles
where lower(coalesce(member_no, '')) = lower('winst889999')
   or lower(coalesce(marketing_slug, '')) = lower('winst889999')
   or lower(coalesce(referral_code, '')) = lower('winst889999')
   or regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace('winst889999', '\D', '', 'g')
order by updated_at desc nulls last, created_at desc nulls last
limit 20;

select 'nearby_marketing_slug_matches' as section;

select
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  phone,
  email,
  member_status,
  frozen_code,
  brand_name,
  page_template,
  current_company_id,
  created_at,
  updated_at
from public.profiles
where lower(coalesce(marketing_slug, '')) like '%winst%'
   or lower(coalesce(member_no, '')) like '%winst%'
   or lower(coalesce(referral_code, '')) like '%winst%'
   or lower(coalesce(name, '')) like '%winst%'
   or lower(coalesce(email, '')) like '%winst%'
order by updated_at desc nulls last, created_at desc nulls last
limit 50;

select 'public_storefront_eligible_matches' as section;

select
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  member_status,
  frozen_code,
  brand_name,
  page_template,
  case
    when frozen_code is not null then 'blocked_frozen_code'
    when member_status is not null and member_status <> 'active' then 'blocked_member_status'
    when member_no is null and marketing_slug is null and referral_code is null then 'blocked_no_public_key'
    else 'eligible'
  end as storefront_eligibility
from public.profiles
where lower(coalesce(member_no, '')) = lower('winst889999')
   or lower(coalesce(marketing_slug, '')) = lower('winst889999')
   or lower(coalesce(referral_code, '')) = lower('winst889999')
order by updated_at desc nulls last, created_at desc nulls last
limit 20;

select 'current_public_storefront_view_matches' as section;

select
  id,
  name,
  display_name,
  member_no,
  marketing_slug,
  referral_code,
  brand_name,
  page_template
from public.public_member_profiles
where lower(coalesce(member_no, '')) = lower('winst889999')
   or lower(coalesce(marketing_slug, '')) = lower('winst889999')
   or lower(coalesce(referral_code, '')) = lower('winst889999')
limit 20;

-- SECTION: rollback
select 'rollback_not_required_read_only_diagnostics' as section;
