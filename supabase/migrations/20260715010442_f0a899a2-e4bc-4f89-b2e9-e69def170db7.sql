CREATE OR REPLACE FUNCTION public.release_bonus_rewards(_record_ids uuid[] DEFAULT NULL::uuid[], _limit integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_record record;
  v_resolution jsonb;
  v_recipient uuid;
  v_reason text;
  v_after integer;
  v_released integer := 0;
  v_failed integer := 0;
  v_redirected integer := 0;
  v_points integer := 0;
  v_base integer;
  v_payable integer;
  v_biz public.vip_business_bonus_ledger;
  v_upg public.vip_upgrade_bonus_ledger;
  v_biz_payable integer;
  v_upg_payable integer;
  v_cap_reasons text[];
  v_tier_code text;
  v_cap_snapshot jsonb;
  v_note text;
BEGIN
  FOR v_record IN
    SELECT id, member_id, bonus_points, bonus_type, source_order_id, source_member_id
    FROM public.bonus_records
    WHERE status = 'waiting_release'
      AND (
        (_record_ids IS NULL AND release_date <= CURRENT_DATE)
        OR (_record_ids IS NOT NULL AND id = ANY(_record_ids))
      )
    ORDER BY release_date NULLS LAST, created_at
    LIMIT COALESCE(_limit, 2000)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_resolution := public.resolve_bonus_reward_recipient(v_record.member_id);
    v_recipient := NULLIF(v_resolution->>'recipient_id', '')::uuid;
    v_reason := COALESCE(v_resolution->>'reason', 'unknown');

    IF v_recipient IS NULL THEN
      UPDATE public.bonus_records
      SET status = 'failed',
          fail_reason = concat_ws(E'\n', fail_reason, 'No valid active VIP referrer for bonus release'),
          failed_at = now(),
          original_member_id = COALESCE(original_member_id, v_record.member_id),
          release_redirect_reason = v_reason,
          updated_at = now()
      WHERE id = v_record.id;

      INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
      VALUES (
        auth.uid(),
        'bonus_release_failed_no_valid_recipient',
        'bonus_records',
        v_record.id,
        jsonb_build_object(
          'original_member_id', v_record.member_id,
          'bonus_type', v_record.bonus_type,
          'points', v_record.bonus_points,
          'resolution', v_resolution
        )
      );

      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    v_base := GREATEST(COALESCE(v_record.bonus_points, 0), 0);
    v_payable := v_base;
    v_cap_reasons := ARRAY[]::text[];
    v_cap_snapshot := NULL;

    -- 升級訂單推薦獎金：發放時記入兩個上限帳（消費回饋 + 營業分紅）
    IF v_record.bonus_type = 'referral' AND v_base > 0 THEN
      v_tier_code := public.get_member_vip_tier_code(v_recipient);

      SELECT * INTO v_biz FROM public.record_business_bonus_release(
        v_recipient,
        v_base::numeric,
        v_record.source_member_id,
        v_record.source_order_id,
        v_tier_code,
        'bonus_record:' || v_record.id::text || ':biz',
        v_record.id,
        '升級訂單日結推薦獎金 — 消費回饋上限帳'
      );

      SELECT * INTO v_upg FROM public.record_upgrade_bonus_release(
        v_recipient,
        v_base::numeric,
        v_record.source_member_id,
        v_record.source_order_id,
        v_tier_code,
        'bonus_record:' || v_record.id::text || ':upg',
        v_record.id,
        '升級訂單日結推薦獎金 — 營業分紅上限帳'
      );

      v_biz_payable := GREATEST(FLOOR(COALESCE(v_biz.payable_amount, 0))::integer, 0);
      v_upg_payable := GREATEST(FLOOR(COALESCE(v_upg.payable_amount, 0))::integer, 0);
      v_payable := LEAST(v_base, v_biz_payable, v_upg_payable);

      IF v_biz_payable < v_base THEN
        v_cap_reasons := array_append(v_cap_reasons, '消費回饋上限');
      END IF;
      IF v_upg_payable < v_base THEN
        v_cap_reasons := array_append(v_cap_reasons, '營業分紅上限');
      END IF;

      v_cap_snapshot := jsonb_build_object(
        'base_points', v_base,
        'business_bonus', jsonb_build_object(
          'payable', v_biz_payable,
          'status', v_biz.status,
          'cap_amount', v_biz.cap_amount,
          'total_after', v_biz.total_after,
          'ledger_id', v_biz.id
        ),
        'upgrade_bonus', jsonb_build_object(
          'payable', v_upg_payable,
          'status', v_upg.status,
          'cap_amount', v_upg.cap_amount,
          'total_after', v_upg.total_after,
          'ledger_id', v_upg.id
        ),
        'final_payable', v_payable,
        'cap_reasons', to_jsonb(v_cap_reasons),
        'tier_code', v_tier_code
      );
    END IF;

    IF v_payable > 0 THEN
      INSERT INTO public.member_points_wallet (user_id)
      VALUES (v_recipient)
      ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.member_points_wallet
      SET reward_points = reward_points + v_payable,
          updated_at = now()
      WHERE user_id = v_recipient
      RETURNING reward_points INTO v_after;

      v_note := CASE
        WHEN v_recipient = v_record.member_id THEN 'bonus reward release'
        ELSE 'bonus reward release redirected to valid VIP referrer'
      END;
      IF array_length(v_cap_reasons, 1) > 0 THEN
        v_note := v_note || '（' || array_to_string(v_cap_reasons, '、') || '部分達上限：' || v_payable || '/' || v_base || '）';
      END IF;

      INSERT INTO public.point_transactions (
        user_id, point_type, amount, balance_after, source, reference_id, note
      ) VALUES (
        v_recipient,
        'reward',
        v_payable,
        v_after,
        'bonus_' || v_record.bonus_type,
        v_record.id,
        v_note
      );

      INSERT INTO public.reward_wallet_logs (
        member_id, bonus_record_id, points, type, status, description
      ) VALUES (
        v_recipient,
        v_record.id,
        v_payable,
        'earn',
        'success',
        v_note
      );

      v_points := v_points + v_payable;
    END IF;

    UPDATE public.bonus_records
    SET status = 'released',
        released_at = now(),
        original_member_id = COALESCE(original_member_id, v_record.member_id),
        released_member_id = v_recipient,
        release_redirect_reason = CASE WHEN v_recipient = v_record.member_id THEN NULL ELSE v_reason END,
        bonus_points = v_payable,
        calculation_detail = CASE
          WHEN v_cap_snapshot IS NOT NULL
            THEN COALESCE(calculation_detail, '{}'::jsonb) || jsonb_build_object(
              'release_cap_snapshot', v_cap_snapshot,
              'release_payable', v_payable,
              'release_base_before_cap', v_base
            )
          ELSE calculation_detail
        END,
        fail_reason = NULL,
        failed_at = NULL,
        updated_at = now()
    WHERE id = v_record.id;

    IF v_recipient <> v_record.member_id THEN
      v_redirected := v_redirected + 1;
      INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
      VALUES (
        auth.uid(),
        'bonus_release_redirected',
        'bonus_records',
        v_record.id,
        jsonb_build_object(
          'original_member_id', v_record.member_id,
          'released_member_id', v_recipient,
          'bonus_type', v_record.bonus_type,
          'points', v_payable,
          'resolution', v_resolution
        )
      );
    END IF;

    v_released := v_released + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'released', v_released,
    'failed', v_failed,
    'redirected', v_redirected,
    'points', v_points
  );
END;
$function$;