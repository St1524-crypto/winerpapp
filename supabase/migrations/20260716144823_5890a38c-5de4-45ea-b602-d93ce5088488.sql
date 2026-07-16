
BEGIN;

DO $$
DECLARE
  v_helper_len int;
BEGIN
  SELECT length(private.get_cron_secret_bonus_daily_tick()) INTO v_helper_len;
  IF v_helper_len IS NULL OR v_helper_len < 16 THEN
    RAISE EXCEPTION 'Vault helper invalid length: %', v_helper_len;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS ops_backup;
CREATE TABLE IF NOT EXISTS ops_backup.bonus_daily_tick_cron_20260716_headers_fix (
  jobid bigint PRIMARY KEY,
  jobname text, schedule text, command text, active boolean,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ops_backup.bonus_daily_tick_cron_20260716_headers_fix
  (jobid, jobname, schedule, command, active)
SELECT jobid, jobname, schedule, command, active
FROM cron.job WHERE jobid = 137
ON CONFLICT (jobid) DO UPDATE
SET jobname = EXCLUDED.jobname,
    schedule = EXCLUDED.schedule,
    command = EXCLUDED.command,
    active = EXCLUDED.active,
    backed_up_at = now();

DO $$
DECLARE
  v_old_command text;
  v_url text;
  v_apikey text;
  v_new_command text;
BEGIN
  SELECT command INTO v_old_command FROM cron.job WHERE jobid = 137;

  v_url := (regexp_match(v_old_command, 'url[[:space:]]*:=[[:space:]]*''([^'']+)'''))[1];
  IF v_url IS NULL THEN
    v_url := (regexp_match(v_old_command, '(https?://[^'']+/api/public/hooks/bonus-daily-tick)'))[1];
  END IF;
  IF v_url IS NULL OR v_url NOT LIKE '%/api/public/hooks/bonus-daily-tick%' THEN
    RAISE EXCEPTION 'Could not extract endpoint URL from jobid 137 command';
  END IF;

  -- Try lowercase 'apikey' first, then 'Apikey'
  v_apikey := (regexp_match(v_old_command, '''apikey''[[:space:]]*,[[:space:]]*''([^'']+)'''))[1];
  IF v_apikey IS NULL THEN
    v_apikey := (regexp_match(v_old_command, '''Apikey''[[:space:]]*,[[:space:]]*''([^'']+)'''))[1];
  END IF;
  IF v_apikey IS NULL THEN
    v_apikey := (regexp_match(v_old_command, '''apiKey''[[:space:]]*,[[:space:]]*''([^'']+)'''))[1];
  END IF;
  IF v_apikey IS NULL OR length(v_apikey) < 16 THEN
    RAISE EXCEPTION 'Could not extract apikey from jobid 137 command';
  END IF;

  v_new_command := format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', %L,
        'authorization', format('Bearer %%s', private.get_cron_secret_bonus_daily_tick())
      ),
      body := '{}'::jsonb
    );
    $cmd$,
    v_url,
    v_apikey
  );

  PERFORM cron.alter_job(job_id := 137, command := v_new_command);
END $$;

COMMIT;

SELECT
  'verify_jobid_137' AS check_name,
  jobid, jobname, schedule, active,
  command LIKE '%authorization%' AS has_lowercase_authorization,
  command LIKE '%format(''Bearer %%s''%' AS uses_format_bearer,
  command LIKE '%private.get_cron_secret_bonus_daily_tick()%' AS uses_vault_helper,
  command LIKE '%/api/public/hooks/bonus-daily-tick%' AS targets_endpoint,
  (command LIKE '%' || private.get_cron_secret_bonus_daily_tick() || '%') AS leaks_plaintext_token
FROM cron.job WHERE jobid = 137;

SELECT 'verify_jobid_130' AS check_name, jobid, jobname, active
FROM cron.job WHERE jobid = 130;

SELECT 'verify_bonus_settings' AS check_name,
  reward_release_mode, daily_bonus_auto_enabled, monthly_bonus_mode, daily_next_settlement_at
FROM public.bonus_settings LIMIT 1;

SELECT 'verify_helper' AS check_name,
  private.get_cron_secret_bonus_daily_tick() IS NOT NULL AS helper_returns_non_null,
  length(private.get_cron_secret_bonus_daily_tick()) AS helper_secret_length;
