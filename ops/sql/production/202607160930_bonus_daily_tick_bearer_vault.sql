-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Safely add Authorization Bearer support to pg_cron jobid 137 (bonus-daily-tick)
--          by reading the bearer token from Supabase Vault at runtime. This does not execute
--          the endpoint, does not run daily settlement, and does not mutate bonus, wallet,
--          reward_wallet_logs, or point_transactions data.
-- OWNER_APPROVAL: Required before validate_only=false execution.
-- CHATGPT_REVIEW: Required before validate_only=false execution.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- PREREQUISITE: Supabase Vault must contain a secret named bonus_daily_tick_cron_token.
-- BACKUP_TABLES: ops_backup.bonus_daily_tick_cron_20260716
-- ROLLBACK: See SECTION: rollback. Restores jobid 137 command/schedule/active from backup.

-- SECTION: backup
CREATE SCHEMA IF NOT EXISTS ops_backup;

CREATE TABLE IF NOT EXISTS ops_backup.bonus_daily_tick_cron_20260716 (
  jobid bigint PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ops_backup.bonus_daily_tick_cron_20260716 (
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
)
SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobid = 137
  AND jobname = 'bonus-daily-tick'
ON CONFLICT (jobid) DO UPDATE
SET
  jobname = EXCLUDED.jobname,
  schedule = EXCLUDED.schedule,
  command = EXCLUDED.command,
  nodename = EXCLUDED.nodename,
  nodeport = EXCLUDED.nodeport,
  database = EXCLUDED.database,
  username = EXCLUDED.username,
  active = EXCLUDED.active,
  backed_up_at = now();

SELECT
  'backup_jobid_137' AS check_name,
  jobid,
  jobname,
  schedule,
  active,
  command LIKE '%Authorization%' AS had_authorization_header,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick,
  backed_up_at
FROM ops_backup.bonus_daily_tick_cron_20260716
WHERE jobid = 137;

-- SECTION: apply
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'supabase_vault'
       OR extname = 'vault'
  ) THEN
    RAISE EXCEPTION 'Supabase Vault extension is not enabled. Stop before modifying cron.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'bonus_daily_tick_cron_token'
      AND decrypted_secret IS NOT NULL
      AND length(decrypted_secret) >= 16
  ) THEN
    RAISE EXCEPTION 'Missing Vault secret: bonus_daily_tick_cron_token. Stop before modifying cron.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 137
      AND jobname = 'bonus-daily-tick'
      AND command LIKE '%/api/public/hooks/bonus-daily-tick%'
  ) THEN
    RAISE EXCEPTION 'cron jobid 137 bonus-daily-tick was not found or does not target the bonus endpoint.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.get_cron_secret_bonus_daily_tick()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'bonus_daily_tick_cron_token'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.get_cron_secret_bonus_daily_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_cron_secret_bonus_daily_tick() FROM anon;
REVOKE ALL ON FUNCTION private.get_cron_secret_bonus_daily_tick() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.get_cron_secret_bonus_daily_tick() TO service_role;
GRANT EXECUTE ON FUNCTION private.get_cron_secret_bonus_daily_tick() TO postgres;

DO $$
DECLARE
  v_old_command text;
  v_url text;
  v_apikey text;
  v_new_command text;
BEGIN
  SELECT command
  INTO v_old_command
  FROM cron.job
  WHERE jobid = 137
    AND jobname = 'bonus-daily-tick';

  SELECT (regexp_match(v_old_command, 'url[[:space:]]*:=[[:space:]]*''([^'']+)'''))[1]
  INTO v_url;

  IF v_url IS NULL THEN
    SELECT (regexp_match(v_old_command, '(https?://[^'']+/api/public/hooks/bonus-daily-tick)'))[1]
    INTO v_url;
  END IF;

  SELECT (regexp_match(v_old_command, '''apikey''[[:space:]]*,[[:space:]]*''([^'']+)'''))[1]
  INTO v_apikey;

  IF v_url IS NULL OR v_url NOT LIKE '%/api/public/hooks/bonus-daily-tick%' THEN
    RAISE EXCEPTION 'Could not extract bonus-daily-tick endpoint URL from existing jobid 137 command.';
  END IF;

  IF v_apikey IS NULL OR length(v_apikey) < 16 THEN
    RAISE EXCEPTION 'Could not extract existing apikey from jobid 137 command.';
  END IF;

  v_new_command := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', %L,
        'Authorization', 'Bearer ' || private.get_cron_secret_bonus_daily_tick()
      ),
      body := '{}'::jsonb
    );
    $cmd$,
    v_url,
    v_apikey
  );

  PERFORM cron.alter_job(
    job_id := 137,
    command := v_new_command
  );
END $$;

COMMIT;

-- SECTION: verify
SELECT
  'verify_vault_secret_exists' AS check_name,
  EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'bonus_daily_tick_cron_token'
      AND decrypted_secret IS NOT NULL
      AND length(decrypted_secret) >= 16
  ) AS passed;

SELECT
  'verify_jobid_137_authorization' AS check_name,
  jobid,
  jobname,
  schedule,
  active,
  command LIKE '%Authorization%' AS has_authorization_header,
  command LIKE '%private.get_cron_secret_bonus_daily_tick()%' AS uses_vault_helper,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick,
  command LIKE '%bonus_daily_tick_cron_token%' AS leaks_vault_secret_name_in_command
FROM cron.job
WHERE jobid = 137;

SELECT
  'verify_jobid_130_inactive' AS check_name,
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobid = 130;

SELECT
  'verify_bonus_settings_manual_release' AS check_name,
  daily_bonus_auto_enabled,
  reward_release_mode,
  monthly_bonus_mode,
  daily_next_settlement_at
FROM public.bonus_settings
LIMIT 1;

SELECT
  'verify_no_bonus_data_mutation_in_this_sql' AS check_name,
  'This SQL only backs up cron metadata, creates a private helper, and alters cron jobid 137 command.' AS note;

-- SECTION: rollback
-- Manual rollback: restore jobid 137 from ops_backup.bonus_daily_tick_cron_20260716.
-- Uncomment and execute only if verify fails and the owner approves rollback.
--
-- BEGIN;
--
-- DO $$
-- DECLARE
--   b record;
-- BEGIN
--   SELECT *
--   INTO b
--   FROM ops_backup.bonus_daily_tick_cron_20260716
--   WHERE jobid = 137;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Missing rollback backup for jobid 137.';
--   END IF;
--
--   PERFORM cron.alter_job(
--     job_id := 137,
--     schedule := b.schedule,
--     command := b.command,
--     database := b.database,
--     username := b.username,
--     active := b.active
--   );
-- END $$;
--
-- COMMIT;
--
-- SELECT
--   'rollback_verify_jobid_137' AS check_name,
--   jobid,
--   jobname,
--   schedule,
--   active,
--   command LIKE '%Authorization%' AS has_authorization_header
-- FROM cron.job
-- WHERE jobid = 137;

SELECT
  'rollback_definition_only_no_action_taken' AS rollback_status,
  jobid,
  jobname,
  schedule,
  active,
  backed_up_at
FROM ops_backup.bonus_daily_tick_cron_20260716
WHERE jobid = 137;
