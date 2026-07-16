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
  jobid, jobname, schedule, command, nodename, nodeport, database, username, active
)
SELECT jobid, jobname, schedule, command, nodename, nodeport, database, username, active
FROM cron.job
WHERE jobid = 137 AND jobname = 'bonus-daily-tick'
ON CONFLICT (jobid) DO NOTHING;

-- SECTION: apply
DO $$
DECLARE
  v_old_command text;
  v_url text;
  v_apikey text;
  v_token_length integer;
  v_new_command text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobid = 137 AND jobname = 'bonus-daily-tick'
      AND command LIKE '%/api/public/hooks/bonus-daily-tick%'
  ) THEN
    RAISE EXCEPTION 'cron jobid 137 bonus-daily-tick was not found or does not target the bonus endpoint.';
  END IF;

  SELECT length(private.get_cron_secret_bonus_daily_tick()) INTO v_token_length;
  IF v_token_length IS NULL OR v_token_length < 16 THEN
    RAISE EXCEPTION 'private.get_cron_secret_bonus_daily_tick() returned NULL or a too-short token.';
  END IF;

  SELECT command INTO v_old_command FROM cron.job WHERE jobid = 137 AND jobname = 'bonus-daily-tick';

  SELECT (regexp_match(v_old_command, 'url[[:space:]]*:=[[:space:]]*''([^'']+)'''))[1] INTO v_url;
  IF v_url IS NULL THEN
    SELECT (regexp_match(v_old_command, '(https?://[^'']+/api/public/hooks/bonus-daily-tick)'))[1] INTO v_url;
  END IF;

  SELECT (regexp_match(v_old_command, '''apikey''[[:space:]]*,[[:space:]]*''([^'']+)'''))[1] INTO v_apikey;

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
    v_url, v_apikey
  );

  PERFORM cron.alter_job(job_id := 137, command := v_new_command);
END $$;