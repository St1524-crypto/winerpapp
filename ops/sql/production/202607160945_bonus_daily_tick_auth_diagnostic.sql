-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Read-only diagnostics for bonus-daily-tick cron Authorization header and Vault helper.
--          This does not modify cron, secrets, bonus_settings, bonus_records, wallet,
--          reward_wallet_logs, point_transactions, or any settlement state.
-- OWNER_APPROVAL: Required before validate_only=false execution.
-- CHATGPT_REVIEW: Required before validate_only=false execution.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES: none required; read-only diagnostics.
-- ROLLBACK: See SECTION: rollback. No rollback action required.

-- SECTION: backup
SELECT
  'backup_not_required_read_only_diagnostic' AS backup_status,
  now() AS checked_at;

-- SECTION: apply
-- Read-only by design. No BEGIN/COMMIT block and no DDL/DML statements in this section.
SELECT
  'apply_read_only_no_changes' AS apply_status,
  now() AS checked_at;

-- SECTION: verify
SELECT
  'verify_current_role' AS check_name,
  current_user AS current_user,
  session_user AS session_user;

SELECT
  'verify_helper_exists' AS check_name,
  n.nspname AS schema_name,
  p.proname AS function_name,
  r.rolname AS owner,
  p.prosecdef AS security_definer,
  p.proacl::text AS acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'private'
  AND p.proname = 'get_cron_secret_bonus_daily_tick';

SELECT
  'verify_helper_result_shape' AS check_name,
  private.get_cron_secret_bonus_daily_tick() IS NOT NULL AS helper_returns_non_null,
  length(private.get_cron_secret_bonus_daily_tick()) AS helper_secret_length,
  left(private.get_cron_secret_bonus_daily_tick(), 0) AS no_secret_value_returned;

SELECT
  'verify_vault_secret_shape' AS check_name,
  EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'bonus_daily_tick_cron_token'
  ) AS vault_row_exists,
  EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'bonus_daily_tick_cron_token'
      AND decrypted_secret IS NOT NULL
  ) AS vault_decrypted_secret_non_null,
  (
    SELECT length(decrypted_secret)
    FROM vault.decrypted_secrets
    WHERE name = 'bonus_daily_tick_cron_token'
    LIMIT 1
  ) AS vault_decrypted_secret_length;

SELECT
  'verify_jobid_137' AS check_name,
  jobid,
  jobname,
  schedule,
  active,
  command LIKE '%Authorization%' AS has_authorization_header,
  command LIKE '%private.get_cron_secret_bonus_daily_tick()%' AS uses_vault_helper,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick,
  command LIKE '%Bearer '' || private.get_cron_secret_bonus_daily_tick()%' AS bearer_expression_shape,
  command LIKE '%Bearer %' AS contains_bearer_literal_text
FROM cron.job
WHERE jobid = 137;

SELECT
  'verify_jobid_130' AS check_name,
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobid = 130;

SELECT
  'verify_last_jobid_137_runs' AS check_name,
  jobid,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
WHERE jobid = 137
ORDER BY start_time DESC
LIMIT 5;

SELECT
  'verify_bonus_settings' AS check_name,
  daily_bonus_auto_enabled,
  reward_release_mode,
  monthly_bonus_mode,
  daily_next_settlement_at,
  now() AS now_utc,
  (now() AT TIME ZONE 'Asia/Taipei') AS now_taipei,
  daily_next_settlement_at <= now() AS next_settlement_due_now
FROM public.bonus_settings
LIMIT 1;

SELECT
  'verify_recent_bonus_records_20260715' AS check_name,
  bonus_type,
  status,
  COUNT(*) AS rows_count,
  SUM(bonus_points) AS total_bonus_points
FROM public.bonus_records
WHERE settlement_date = DATE '2026-07-15'
GROUP BY bonus_type, status
ORDER BY bonus_type, status;

-- SECTION: rollback
SELECT
  'rollback_not_required_read_only_diagnostic' AS rollback_status,
  now() AS checked_at;
