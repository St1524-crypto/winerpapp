-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: End-to-end verify bonus release recipient hardening with isolated test data.
-- OWNER_APPROVAL: Required before validate_only=false execution.
-- CHATGPT_REVIEW: Required before validate_only=false execution.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: ops_backup.bonus_release_recipient_test_20260704_*
-- ROLLBACK: Execute SECTION: rollback manually if verification fails or test data must be removed.

-- This script creates isolated test auth/users/profiles and bonus_records, then invokes
-- public.release_bonus_rewards(array[...], 10). It does not use existing production members.
--
-- Expected test cases:
-- 1. valid VIP non-dealer receives own reward.
-- 2. dealer recipient is skipped; reward redirects to valid VIP upline.
-- 3. expired VIP recipient is skipped; reward redirects through dealer to valid VIP upline.
-- 4. non-VIP orphan has no valid upline; bonus_record becomes failed and no points are issued.

-- SECTION: backup
begin;

create schema if not exists ops_backup;

drop table if exists ops_backup.bonus_release_recipient_test_20260704_auth_users;
create table ops_backup.bonus_release_recipient_test_20260704_auth_users as
select u.*, now() as backed_up_at
from auth.users u
where u.id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_profiles;
create table ops_backup.bonus_release_recipient_test_20260704_profiles as
select p.*, now() as backed_up_at
from public.profiles p
where p.id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_bonus_records;
create table ops_backup.bonus_release_recipient_test_20260704_bonus_records as
select br.*, now() as backed_up_at
from public.bonus_records br
where br.id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_wallets;
create table ops_backup.bonus_release_recipient_test_20260704_wallets as
select w.*, now() as backed_up_at
from public.member_points_wallet w
where w.user_id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_point_transactions;
create table ops_backup.bonus_release_recipient_test_20260704_point_transactions as
select pt.*, now() as backed_up_at
from public.point_transactions pt
where pt.reference_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_reward_wallet_logs;
create table ops_backup.bonus_release_recipient_test_20260704_reward_wallet_logs as
select rwl.*, now() as backed_up_at
from public.reward_wallet_logs rwl
where rwl.bonus_record_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

drop table if exists ops_backup.bonus_release_recipient_test_20260704_audit_logs;
create table ops_backup.bonus_release_recipient_test_20260704_audit_logs as
select al.*, now() as backed_up_at
from public.audit_logs al
where al.entity = 'bonus_records'
  and al.entity_id in (
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000204'::uuid
  );

-- SECTION: apply

do $$
begin
  if exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_auth_users)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_profiles)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_bonus_records)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_wallets)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_point_transactions)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_reward_wallet_logs)
     or exists (select 1 from ops_backup.bonus_release_recipient_test_20260704_audit_logs)
  then
    raise exception 'Test UUID collision detected. Stop before mutating production data.';
  end if;
end $$;

-- Create isolated auth users. These are not intended for login.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops-bonus-valid-vip-20260704@winerp.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"ops_test":"bonus_release_recipient"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops-bonus-dealer-20260704@winerp.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"ops_test":"bonus_release_recipient"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops-bonus-expired-vip-20260704@winerp.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"ops_test":"bonus_release_recipient"}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops-bonus-orphan-non-vip-20260704@winerp.test', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"ops_test":"bonus_release_recipient"}'::jsonb, now(), now());

-- Upsert isolated profiles in a referral chain:
-- expired VIP -> dealer -> valid VIP; orphan has no upline.
insert into public.profiles (
  id, name, email, member_no, is_vip, vip_expires_at, is_dealer, referred_by
) values
  ('00000000-0000-4000-8000-000000000101', 'OPS Test Valid VIP', 'ops-bonus-valid-vip-20260704@winerp.test', 'OPS-BONUS-VIP-20260704', true, now() + interval '30 days', false, null),
  ('00000000-0000-4000-8000-000000000102', 'OPS Test Dealer', 'ops-bonus-dealer-20260704@winerp.test', 'OPS-BONUS-DEALER-20260704', true, now() + interval '30 days', true, '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000103', 'OPS Test Expired VIP', 'ops-bonus-expired-vip-20260704@winerp.test', 'OPS-BONUS-EXPIRED-20260704', true, now() - interval '1 day', false, '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000000104', 'OPS Test Orphan Non VIP', 'ops-bonus-orphan-non-vip-20260704@winerp.test', 'OPS-BONUS-ORPHAN-20260704', false, null, false, null)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  member_no = excluded.member_no,
  is_vip = excluded.is_vip,
  vip_expires_at = excluded.vip_expires_at,
  is_dealer = excluded.is_dealer,
  referred_by = excluded.referred_by;

insert into public.member_points_wallet (user_id, reward_points)
values
  ('00000000-0000-4000-8000-000000000101', 0),
  ('00000000-0000-4000-8000-000000000102', 0),
  ('00000000-0000-4000-8000-000000000103', 0),
  ('00000000-0000-4000-8000-000000000104', 0)
on conflict (user_id) do update set reward_points = 0, updated_at = now();

insert into public.bonus_records (
  id, member_id, source_member_id, bonus_type, generation_level,
  base_amount, bonus_rate, bonus_points, status, release_date
) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000104', 'referral', 1, 1000, 10, 101, 'waiting_release', current_date - 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000104', 'referral', 2, 1000, 10, 202, 'waiting_release', current_date - 1),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000104', 'repurchase', 1, 1000, 10, 303, 'waiting_release', current_date - 1),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000104', 'rank_rebate', 1, 1000, 10, 404, 'waiting_release', current_date - 1);

select public.release_bonus_rewards(
  array[
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000204'::uuid
  ],
  10
) as release_result;

commit;

-- SECTION: verify

select
  'bonus_records_release_result' as check_name,
  br.id,
  br.member_id as original_member_id,
  br.original_member_id as stored_original_member_id,
  br.released_member_id,
  br.release_redirect_reason,
  br.status,
  br.fail_reason,
  br.bonus_points
from public.bonus_records br
where br.id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
)
order by br.id;

select
  'wallet_balances' as check_name,
  p.member_no,
  p.is_vip,
  p.is_dealer,
  p.vip_expires_at,
  w.reward_points
from public.profiles p
left join public.member_points_wallet w on w.user_id = p.id
where p.id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
)
order by p.member_no;

select
  'point_transactions' as check_name,
  pt.user_id,
  pt.amount,
  pt.balance_after,
  pt.source,
  pt.reference_id,
  pt.note
from public.point_transactions pt
where pt.reference_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
)
order by pt.reference_id;

select
  'reward_wallet_logs' as check_name,
  rwl.member_id,
  rwl.bonus_record_id,
  rwl.points,
  rwl.status,
  rwl.description
from public.reward_wallet_logs rwl
where rwl.bonus_record_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
)
order by rwl.bonus_record_id;

select
  'audit_logs' as check_name,
  al.action,
  al.entity_id,
  al.metadata
from public.audit_logs al
where al.entity = 'bonus_records'
  and al.entity_id in (
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000204'::uuid
  )
order by al.created_at, al.entity_id;

-- Expected summary:
-- 201: released to 101, no redirect.
-- 202: released to 101, reason dealer_redirected_to_valid_referrer.
-- 203: released to 101, reason dealer_redirected_to_valid_referrer or expired_vip_redirected_to_valid_referrer.
-- 204: failed, reason no valid active VIP referrer.
-- Wallet 101 reward_points should equal 606 (= 101 + 202 + 303).
-- Wallets 102/103/104 reward_points should remain 0.

-- SECTION: rollback
-- Manual rollback. Run only after review if verification fails or cleanup is required.
begin;

delete from public.audit_logs
where entity = 'bonus_records'
  and entity_id in (
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid,
    '00000000-0000-4000-8000-000000000203'::uuid,
    '00000000-0000-4000-8000-000000000204'::uuid
  );

delete from public.reward_wallet_logs
where bonus_record_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

delete from public.point_transactions
where reference_id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

delete from public.bonus_records
where id in (
  '00000000-0000-4000-8000-000000000201'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000203'::uuid,
  '00000000-0000-4000-8000-000000000204'::uuid
);

delete from public.member_points_wallet
where user_id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

delete from public.profiles
where id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000000101'::uuid,
  '00000000-0000-4000-8000-000000000102'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid,
  '00000000-0000-4000-8000-000000000104'::uuid
);

commit;
