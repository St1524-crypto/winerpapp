-- Harden bonus release recipient resolution.
-- All bonus types must release reward points only to an active VIP recipient.
-- If the original recipient is expired / not VIP / dealer, walk up referred_by
-- until a valid active VIP non-dealer referrer is found.

ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS original_member_id uuid,
  ADD COLUMN IF NOT EXISTS released_member_id uuid,
  ADD COLUMN IF NOT EXISTS release_redirect_reason text;

CREATE INDEX IF NOT EXISTS idx_bonus_records_released_member
  ON public.bonus_records (released_member_id, released_at DESC);

CREATE OR REPLACE FUNCTION public.resolve_bonus_reward_recipient(_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid := _member_id;
  v_profile record;
  v_path uuid[] := ARRAY[]::uuid[];
  v_reason text := 'original_valid_vip';
  v_redirected boolean := false;
  v_step integer := 0;
BEGIN
  IF _member_id IS NULL THEN
    RETURN jsonb_build_object(
      'recipient_id', null,
      'original_member_id', _member_id,
      'redirected', false,
      'reason', 'missing_member_id',
      'path', to_jsonb(v_path)
    );
  END IF;

  WHILE v_current IS NOT NULL AND v_step < 20 LOOP
    IF v_current = ANY(v_path) THEN
      RETURN jsonb_build_object(
        'recipient_id', null,
        'original_member_id', _member_id,
        'redirected', v_redirected,
        'reason', 'referral_cycle_detected',
        'path', to_jsonb(v_path)
      );
    END IF;

    v_path := array_append(v_path, v_current);

    SELECT id, referred_by, is_vip, vip_expires_at, is_dealer
      INTO v_profile
    FROM public.profiles
    WHERE id = v_current;

    IF NOT FOUND THEN
      v_reason := 'profile_missing';
      v_current := NULL;
      EXIT;
    END IF;

    IF COALESCE(v_profile.is_dealer, false) THEN
      v_reason := 'dealer_redirected_to_valid_referrer';
    ELSIF COALESCE(v_profile.is_vip, false)
       AND (
         v_profile.vip_expires_at IS NULL
         OR v_profile.vip_expires_at::date >= CURRENT_DATE
       ) THEN
      RETURN jsonb_build_object(
        'recipient_id', v_profile.id,
        'original_member_id', _member_id,
        'redirected', v_redirected,
        'reason', CASE WHEN v_redirected THEN v_reason ELSE 'original_valid_vip' END,
        'path', to_jsonb(v_path)
      );
    ELSIF COALESCE(v_profile.is_vip, false)
       AND v_profile.vip_expires_at IS NOT NULL
       AND v_profile.vip_expires_at::date < CURRENT_DATE THEN
      v_reason := 'expired_vip_redirected_to_valid_referrer';
    ELSE
      v_reason := 'non_vip_redirected_to_valid_referrer';
    END IF;

    v_redirected := true;
    v_current := v_profile.referred_by;
    v_step := v_step + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'recipient_id', null,
    'original_member_id', _member_id,
    'redirected', v_redirected,
    'reason', COALESCE(v_reason, 'no_valid_vip_referrer'),
    'path', to_jsonb(v_path)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_bonus_reward_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_bonus_reward_recipient(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_bonus_rewards(
  _record_ids uuid[] DEFAULT NULL,
  _limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  FOR v_record IN
    SELECT id, member_id, bonus_points, bonus_type
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

    IF COALESCE(v_record.bonus_points, 0) > 0 THEN
      INSERT INTO public.member_points_wallet (user_id)
      VALUES (v_recipient)
      ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.member_points_wallet
      SET reward_points = reward_points + v_record.bonus_points,
          updated_at = now()
      WHERE user_id = v_recipient
      RETURNING reward_points INTO v_after;

      INSERT INTO public.point_transactions (
        user_id, point_type, amount, balance_after, source, reference_id, note
      ) VALUES (
        v_recipient,
        'reward',
        v_record.bonus_points,
        v_after,
        'bonus_' || v_record.bonus_type,
        v_record.id,
        CASE
          WHEN v_recipient = v_record.member_id THEN 'bonus reward release'
          ELSE 'bonus reward release redirected to valid VIP referrer'
        END
      );

      INSERT INTO public.reward_wallet_logs (
        member_id, bonus_record_id, points, type, status, description
      ) VALUES (
        v_recipient,
        v_record.id,
        v_record.bonus_points,
        'earn',
        'success',
        CASE
          WHEN v_recipient = v_record.member_id THEN 'rpc release'
          ELSE 'rpc release redirected to valid VIP referrer'
        END
      );

      v_points := v_points + v_record.bonus_points;
    END IF;

    UPDATE public.bonus_records
    SET status = 'released',
        released_at = now(),
        original_member_id = COALESCE(original_member_id, v_record.member_id),
        released_member_id = v_recipient,
        release_redirect_reason = CASE WHEN v_recipient = v_record.member_id THEN NULL ELSE v_reason END,
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
          'points', v_record.bonus_points,
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
$$;

REVOKE EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) TO service_role;
