-- Backfill historical bonus_records.calculation_detail with derived display snapshots.
-- No recalculation. No changes to status, wallet, reward_wallet_logs, point_transactions, releases, or batches.

CREATE SCHEMA IF NOT EXISTS ops_backup;

CREATE TABLE IF NOT EXISTS ops_backup.bonus_records_calculation_detail_backfill_20260713 (
  id uuid PRIMARY KEY,
  old_calculation_detail jsonb,
  old_status text,
  old_bonus_type text,
  old_bonus_points integer,
  old_updated_at timestamptz,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ops_backup.bonus_records_calculation_detail_backfill_20260713 (
  id, old_calculation_detail, old_status, old_bonus_type, old_bonus_points, old_updated_at
)
SELECT br.id, br.calculation_detail, br.status, br.bonus_type, br.bonus_points, br.updated_at
FROM public.bonus_records br
WHERE br.calculation_detail IS NULL
ON CONFLICT (id) DO NOTHING;

WITH targets AS (
  SELECT
    br.id, br.bonus_type, br.status, br.member_id, br.source_member_id, br.source_order_id,
    br.generation_level, br.base_amount, br.bonus_rate, br.bonus_points,
    br.required_points_checked, br.required_points_passed, br.fail_reason,
    br.settlement_batch_id, br.settlement_date, br.release_date, br.released_at,
    br.created_at, br.updated_at, br.failed_at, br.release_source, br.release_attempts,
    br.original_member_id, br.released_member_id, br.release_redirect_reason,
    recipient.name AS recipient_name, recipient.member_no AS recipient_member_no,
    recipient.is_vip AS recipient_is_vip, recipient.vip_expires_at AS recipient_vip_expires_at,
    recipient.is_dealer AS recipient_is_dealer,
    source_profile.name AS source_member_name, source_profile.member_no AS source_member_no,
    source_order.order_no AS source_order_no, source_order.order_type AS source_order_type,
    source_order.total_amount AS source_order_total_amount,
    source_order.payment_status AS source_order_payment_status,
    source_order.created_at AS source_order_created_at,
    batch.settlement_type AS batch_settlement_type,
    batch.settlement_period_start AS batch_period_start,
    batch.settlement_period_end AS batch_period_end,
    batch.status AS batch_status,
    tier.current_tier AS recipient_current_tier,
    tier.maintenance_expires_at AS recipient_tier_maintenance_expires_at,
    mrp.ym AS responsibility_ym, mrp.points AS responsibility_points,
    mrp.source_order_ids AS responsibility_source_order_ids,
    CASE
      WHEN br.bonus_type IN ('referral','repurchase') THEN 'daily_bonus'
      WHEN br.bonus_type IN ('monthly_vip','rank_rebate','rank_diff_rebate') THEN 'monthly_bonus'
      ELSE 'other_bonus'
    END AS calculation_scope,
    CASE
      WHEN br.status = 'released' THEN 'released_historical_record'
      WHEN br.status = 'waiting_release' THEN 'waiting_release_historical_record'
      WHEN br.status = 'cancelled' THEN 'cancelled_historical_record'
      WHEN br.status = 'failed' THEN 'failed_historical_record'
      ELSE 'other_historical_record'
    END AS status_classification
  FROM public.bonus_records br
  LEFT JOIN public.profiles recipient ON recipient.id = br.member_id
  LEFT JOIN public.profiles source_profile ON source_profile.id = br.source_member_id
  LEFT JOIN public.sales_orders source_order ON source_order.id = br.source_order_id
  LEFT JOIN public.bonus_settlement_batches batch ON batch.id = br.settlement_batch_id
  LEFT JOIN public.dealer_tier_status tier ON tier.user_id = br.member_id
  LEFT JOIN public.monthly_responsibility_points mrp
    ON mrp.member_id = br.member_id
   AND mrp.ym = to_char(COALESCE(br.settlement_date, br.created_at::date), 'YYYYMM')
  WHERE br.calculation_detail IS NULL
),
snapshots AS (
  SELECT t.id,
    jsonb_strip_nulls(jsonb_build_object(
      'schema_version', 1,
      'backfill_mode', 'derived_from_existing_bonus_records',
      'exact_original_rule_snapshot', false,
      'backfill_warning', 'Historical calculation_detail was missing. This snapshot is derived from existing persisted records only; it does not recalculate bonus formulas.',
      'backfilled_at', now(),
      'calculation_scope', t.calculation_scope,
      'calculation_kind', CASE t.bonus_type
        WHEN 'referral' THEN 'daily_referral_upgrade'
        WHEN 'repurchase' THEN 'daily_repurchase'
        WHEN 'monthly_vip' THEN 'monthly_responsibility_bonus'
        WHEN 'rank_rebate' THEN 'monthly_rank_rebate'
        WHEN 'rank_diff_rebate' THEN 'monthly_rank_diff_rebate'
        ELSE t.bonus_type END,
      'status_classification', t.status_classification,
      'bonus_record_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'id', t.id, 'bonus_type', t.bonus_type, 'status', t.status,
        'generation_level', t.generation_level, 'base_amount', t.base_amount,
        'bonus_rate', t.bonus_rate, 'bonus_points', t.bonus_points,
        'required_points_checked', t.required_points_checked,
        'required_points_passed', t.required_points_passed, 'fail_reason', t.fail_reason,
        'settlement_date', t.settlement_date, 'release_date', t.release_date,
        'released_at', t.released_at, 'failed_at', t.failed_at,
        'release_source', t.release_source, 'release_attempts', t.release_attempts,
        'release_redirect_reason', t.release_redirect_reason,
        'created_at', t.created_at, 'updated_at', t.updated_at
      )),
      'recipient_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'member_id', t.member_id, 'member_name', t.recipient_name,
        'member_no', t.recipient_member_no, 'is_vip', t.recipient_is_vip,
        'vip_expires_at', t.recipient_vip_expires_at, 'is_dealer', t.recipient_is_dealer,
        'current_tier', t.recipient_current_tier,
        'tier_maintenance_expires_at', t.recipient_tier_maintenance_expires_at
      )),
      'source_member_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'member_id', t.source_member_id, 'member_name', t.source_member_name,
        'member_no', t.source_member_no
      )),
      'source_order_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'order_id', t.source_order_id, 'order_no', t.source_order_no,
        'order_type', t.source_order_type, 'total_amount', t.source_order_total_amount,
        'payment_status', t.source_order_payment_status, 'created_at', t.source_order_created_at
      )),
      'settlement_batch_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'batch_id', t.settlement_batch_id, 'settlement_type', t.batch_settlement_type,
        'period_start', t.batch_period_start, 'period_end', t.batch_period_end,
        'status', t.batch_status
      )),
      'responsibility_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'ym', t.responsibility_ym, 'points', t.responsibility_points,
        'source_order_ids', t.responsibility_source_order_ids,
        'required_points_checked', t.required_points_checked,
        'required_points_passed', t.required_points_passed
      )),
      'release_recipient_snapshot', jsonb_strip_nulls(jsonb_build_object(
        'original_member_id', t.original_member_id,
        'released_member_id', t.released_member_id,
        'release_redirect_reason', t.release_redirect_reason
      )),
      'display_math', jsonb_strip_nulls(jsonb_build_object(
        'persisted_base_amount', t.base_amount,
        'persisted_bonus_rate_percent', t.bonus_rate,
        'persisted_bonus_points', t.bonus_points,
        'formula_note', 'Display only: persisted bonus_points = existing bonus_records.bonus_points; no recalculation was performed.',
        'amount_basis_note', 'For historical rows, base_amount semantics depend on the original bonus_type and historical settlement function.'
      ))
    )) AS calculation_detail
  FROM targets t
)
UPDATE public.bonus_records br
SET calculation_detail = s.calculation_detail
FROM snapshots s
WHERE br.id = s.id
  AND br.calculation_detail IS NULL;