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