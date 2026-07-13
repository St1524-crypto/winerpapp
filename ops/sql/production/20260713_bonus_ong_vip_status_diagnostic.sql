-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- Purpose: Read-only diagnostic for TW23H00005 / 翁子晴 VIP eligibility and related bonus records.
-- Safety: SELECT only. No data mutation.

-- SECTION: backup
select
  'read_only_diagnostic_no_backup_required' as backup_status,
  now() as checked_at;

-- SECTION: apply
select
  'read_only_diagnostic_no_apply_performed' as apply_status,
  now() as checked_at;

-- SECTION: verify
select
  p.id,
  p.name,
  p.member_no,
  p.email,
  p.phone,
  p.is_vip,
  p.vip_expires_at,
  p.vip_tier,
  p.current_tier,
  p.legacy_rank,
  p.member_status,
  p.frozen_code,
  case
    when coalesce(p.is_vip, false) is not true then false
    when p.vip_expires_at is null then false
    when p.vip_expires_at::date < date '2026-07-14' then false
    when nullif(upper(coalesce(p.frozen_code, '')), '') is not null
     and upper(coalesce(p.frozen_code, '')) <> 'N' then false
    else true
  end as eligible_for_2026_07_14_by_current_recalc_rule,
  case
    when coalesce(p.is_vip, false) is not true then 'is_vip is not true'
    when p.vip_expires_at is null then 'vip_expires_at is null'
    when p.vip_expires_at::date < date '2026-07-14' then 'vip_expires_at before 2026-07-14'
    when nullif(upper(coalesce(p.frozen_code, '')), '') is not null
     and upper(coalesce(p.frozen_code, '')) <> 'N' then 'frozen_code blocks reward'
    else 'eligible'
  end as current_recalc_rule_reason
from public.profiles p
where p.member_no = 'TW23H00005'
   or p.name ilike '%翁子晴%'
order by p.created_at desc nulls last
limit 20;

select
  b.id,
  b.member_id,
  p.name as member_name,
  p.member_no,
  p.is_vip,
  p.vip_expires_at,
  p.member_status,
  p.frozen_code,
  b.bonus_type,
  b.status,
  b.bonus_points,
  b.base_amount,
  b.bonus_rate,
  b.layer_level,
  b.settlement_date,
  b.release_date,
  b.fail_reason,
  b.order_id,
  so.order_no,
  so.total_amount,
  b.created_at,
  b.updated_at
from public.bonus_records b
join public.profiles p on p.id = b.member_id
left join public.sales_orders so on so.id = b.order_id
where p.member_no = 'TW23H00005'
   or p.name ilike '%翁子晴%'
order by b.created_at desc
limit 50;

-- SECTION: rollback
select
  'read_only_diagnostic_no_rollback_required' as rollback_status,
  now() as checked_at;
