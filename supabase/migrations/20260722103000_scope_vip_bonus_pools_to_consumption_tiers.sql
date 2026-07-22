-- fix(bonus): scope VIP bonus pools to consumption tiers
--
-- Purpose:
--   The daily business bonus already pays STAR1~STAR7/DIRECTOR through
--   public.distribute_daily_revenue_bonus. Active vip_bonus_pools must only
--   represent the consumption bonus pool for V/S/T/E/A, otherwise STAR
--   members can be included in both daily shared-pool paths.
--
-- Safety:
--   - Does not modify bonus_records, wallets, point_transactions, or ledgers.
--   - Does not execute settlement/distribution RPCs.
--   - Creates a snapshot of the current pool settings before applying changes.
--   - Verifies no active vip_bonus_pools include STAR/DIRECTOR tier markers.

CREATE SCHEMA IF NOT EXISTS ops_backup;

CREATE TABLE IF NOT EXISTS ops_backup.vip_bonus_pools_before_consumption_scope_20260722 AS
SELECT now() AS backed_up_at, p.*
FROM public.vip_bonus_pools p;

UPDATE public.vip_bonus_pools
SET
  status = 'inactive',
  description = concat_ws(
    E'\n',
    nullif(description, ''),
    'Deactivated by 20260722103000_scope_vip_bonus_pools_to_consumption_tiers: STAR/DIRECTOR tiers are handled by distribute_daily_revenue_bonus.'
  ),
  updated_at = now()
WHERE status = 'active'
  AND (
    code IN ('POOL_123', 'POOL_345_A', 'POOL_345_B', 'POOL_67D')
    OR tier_codes && ARRAY[
      '1','2','3','4','5','6','7','D',
      'STAR1','STAR2','STAR3','STAR4','STAR5','STAR6','STAR7','DIRECTOR'
    ]::text[]
  );

INSERT INTO public.vip_bonus_pools (
  name,
  code,
  tier_codes,
  bonus_rate,
  distribution_method,
  apply_total_income_cap,
  total_income_cap_amount,
  sort_order,
  status,
  description
)
VALUES (
  'V/S/T/E/A consumption bonus pool',
  'POOL_VSTEA',
  ARRAY['V','S','T','E','A']::text[],
  0.05,
  'equal',
  false,
  NULL,
  1,
  'active',
  'Daily consumption bonus pool. The pool amount is daily total reward points multiplied by the configured rate, then distributed equally to eligible V/S/T/E/A VIP members.'
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  tier_codes = EXCLUDED.tier_codes,
  bonus_rate = EXCLUDED.bonus_rate,
  distribution_method = EXCLUDED.distribution_method,
  apply_total_income_cap = EXCLUDED.apply_total_income_cap,
  total_income_cap_amount = EXCLUDED.total_income_cap_amount,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  updated_at = now();

DO $$
DECLARE
  _bad_active integer;
  _vstea_active integer;
BEGIN
  SELECT count(*) INTO _bad_active
  FROM public.vip_bonus_pools p
  WHERE p.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM unnest(p.tier_codes) AS c(code)
      WHERE c.code NOT IN ('V','S','T','E','A')
    );

  IF _bad_active > 0 THEN
    RAISE EXCEPTION 'Active vip_bonus_pools still contain non V/S/T/E/A tier codes: %', _bad_active;
  END IF;

  SELECT count(*) INTO _vstea_active
  FROM public.vip_bonus_pools p
  WHERE p.code = 'POOL_VSTEA'
    AND p.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT unnest(ARRAY['V','S','T','E','A']::text[]) AS code
        EXCEPT
        SELECT unnest(p.tier_codes)
      ) missing
    )
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT unnest(p.tier_codes) AS code
        EXCEPT
        SELECT unnest(ARRAY['V','S','T','E','A']::text[])
      ) extra
    );

  IF _vstea_active <> 1 THEN
    RAISE EXCEPTION 'POOL_VSTEA active V/S/T/E/A pool verification failed';
  END IF;
END $$;

-- Rollback guide:
--   UPDATE public.vip_bonus_pools live
--   SET name=b.name, code=b.code, tier_codes=b.tier_codes, bonus_rate=b.bonus_rate,
--       distribution_method=b.distribution_method,
--       apply_total_income_cap=b.apply_total_income_cap,
--       total_income_cap_amount=b.total_income_cap_amount,
--       sort_order=b.sort_order, status=b.status, description=b.description,
--       updated_at=now()
--   FROM ops_backup.vip_bonus_pools_before_consumption_scope_20260722 b
--   WHERE live.id=b.id;
--   UPDATE public.vip_bonus_pools SET status='inactive', updated_at=now()
--   WHERE code='POOL_VSTEA'
--     AND id NOT IN (SELECT id FROM ops_backup.vip_bonus_pools_before_consumption_scope_20260722);
