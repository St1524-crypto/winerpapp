-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE: Safely switch pg_cron jobid 137 (bonus-daily-tick) from Authorization
--          Bearer to x-cron-secret. This avoids edge/header stripping while keeping
--          the token in Supabase Vault at runtime.
-- OWNER_APPROVAL: Required before validate_only=false execution.
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- PREREQUISITE: private.get_cron_secret_bonus_daily_tick() exists and returns a non-empty token.
-- BACKUP_TABLES: ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret
-- ROLLBACK: See SECTION: rollback. Restores jobid 137 command/schedule/active from backup.

-- SECTION: backup
CREATE SCHEMA IF NOT EXISTS ops_backup;

CREATE TABLE IF NOT EXISTS ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret (
  jobid bigint PRIMARY KEY,
  jobname text,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  backed_up_by text NOT NULL DEFAULT current_user
);

INSERT INTO ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret (
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
ON CONFLICT (jobid) DO NOTHING;

SELECT
  'backup_jobid_137' AS check_name,
  jobid,
  jobname,
  schedule,
  active,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick,
  command LIKE '%private.get_cron_secret_bonus_daily_tick()%' AS used_vault_helper_before,
  backed_up_at
FROM ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret
WHERE jobid = 137;

-- SECTION: apply
BEGIN;

DO $$
DECLARE
  v_old_command text;
  v_url text;
  v_apikey text;
  v_token_length integer;
  v_new_command text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 137
      AND jobname = 'bonus-daily-tick'
      AND command LIKE '%/api/public/hooks/bonus-daily-tick%'
  ) THEN
    RAISE EXCEPTION 'cron jobid 137 bonus-daily-tick was not found or does not target the bonus endpoint.';
  END IF;

  SELECT length(private.get_cron_secret_bonus_daily_tick())
  INTO v_token_length;

  IF v_token_length IS NULL OR v_token_length < 16 THEN
    RAISE EXCEPTION 'private.get_cron_secret_bonus_daily_tick() returned NULL or a too-short token. Stop before modifying cron.';
  END IF;

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
        'x-cron-secret', private.get_cron_secret_bonus_daily_tick()
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
  'verify_jobid_137_x_cron_secret' AS check_name,
  jobid,
  jobname,
  schedule,
  active,
  command LIKE '%''x-cron-secret''%' AS has_x_cron_secret_header,
  command LIKE '%private.get_cron_secret_bonus_daily_tick()%' AS uses_vault_helper,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick,
  command NOT LIKE '%''authorization''%' AND command NOT LIKE '%''Authorization''%' AS no_authorization_header_key,
  command NOT LIKE '%Bearer %' AS no_bearer_literal
FROM cron.job
WHERE jobid = 137;

SELECT
  'verify_helper_non_null_without_showing_token' AS check_name,
  private.get_cron_secret_bonus_daily_tick() IS NOT NULL AS helper_returns_non_null,
  length(private.get_cron_secret_bonus_daily_tick()) AS helper_secret_length;

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
  'This SQL only backs up cron metadata and alters cron jobid 137 command. It does not call the endpoint or run settlement.' AS note;

-- SECTION: rollback
-- Manual rollback: restore jobid 137 from ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret.
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
--   FROM ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret
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
--   command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_bonus_daily_tick
-- FROM cron.job
-- WHERE jobid = 137;

SELECT
  'rollback_definition_only_no_action_taken' AS rollback_status,
  jobid,
  jobname,
  schedule,
  active,
  backed_up_at
FROM ops_backup.bonus_daily_tick_cron_20260716_x_cron_secret
WHERE jobid = 137;
