DO $$
DECLARE
  v_secret text;
  v_non_null boolean;
  v_len integer;
BEGIN
  v_secret := private.get_cron_secret_bonus_daily_tick();
  v_non_null := v_secret IS NOT NULL;
  v_len := length(v_secret);
  RAISE NOTICE 'DIAG helper_returns_non_null=% helper_secret_length=%', v_non_null, COALESCE(v_len::text, 'NULL');
END $$;