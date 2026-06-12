-- Add idempotency guards for monthly bonus settlement.
-- Keep one active monthly batch per settlement period. Failed batches are left retryable.
WITH ranked_monthly_batches AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY settlement_period_start, settlement_period_end
      ORDER BY
        CASE status WHEN 'completed' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
        created_at,
        id
    ) AS keep_rank
  FROM public.bonus_settlement_batches
  WHERE settlement_type = 'monthly'
    AND status IN ('processing', 'completed')
)
UPDATE public.bonus_settlement_batches b
SET
  status = 'failed',
  completed_at = COALESCE(b.completed_at, now()),
  notes = concat_ws(E'\n', b.notes, 'Marked failed by monthly bonus idempotency migration because another active batch exists for the same period.')
FROM ranked_monthly_batches r
WHERE b.id = r.id
  AND r.keep_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bonus_settlement_batches_monthly_active_period
  ON public.bonus_settlement_batches (settlement_period_start, settlement_period_end)
  WHERE settlement_type = 'monthly'
    AND status IN ('processing', 'completed');

WITH ranked_monthly_records AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY settlement_batch_id, member_id, bonus_type
      ORDER BY created_at, id
    ) AS keep_rank
  FROM public.bonus_records
  WHERE settlement_batch_id IS NOT NULL
    AND bonus_type IN ('monthly_vip', 'rank_rebate')
    AND status <> 'failed'
)
UPDATE public.bonus_records r
SET
  status = 'failed',
  fail_reason = concat_ws(E'\n', r.fail_reason, 'Marked failed by monthly bonus idempotency migration because another record exists in the same batch.')
FROM ranked_monthly_records ranked
WHERE r.id = ranked.id
  AND ranked.keep_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bonus_records_monthly_batch_member_type
  ON public.bonus_records (settlement_batch_id, member_id, bonus_type)
  WHERE settlement_batch_id IS NOT NULL
    AND bonus_type IN ('monthly_vip', 'rank_rebate')
    AND status <> 'failed';
