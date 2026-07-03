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
  v_after integer;
  v_released integer := 0;
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
    IF COALESCE(v_record.bonus_points, 0) > 0 THEN
      INSERT INTO public.member_points_wallet (user_id)
      VALUES (v_record.member_id)
      ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.member_points_wallet
      SET reward_points = reward_points + v_record.bonus_points,
          updated_at = now()
      WHERE user_id = v_record.member_id
      RETURNING reward_points INTO v_after;

      INSERT INTO public.point_transactions (
        user_id, point_type, amount, balance_after, source, reference_id, note
      ) VALUES (
        v_record.member_id, 'reward', v_record.bonus_points, v_after,
        'bonus_' || v_record.bonus_type, v_record.id, 'bonus reward release'
      );

      INSERT INTO public.reward_wallet_logs (
        member_id, bonus_record_id, points, type, status, description
      ) VALUES (
        v_record.member_id, v_record.id, v_record.bonus_points, 'earn', 'success', 'rpc release'
      );

      v_points := v_points + v_record.bonus_points;
    END IF;

    UPDATE public.bonus_records
    SET status = 'released', released_at = now()
    WHERE id = v_record.id;

    v_released := v_released + 1;
  END LOOP;

  RETURN jsonb_build_object('released', v_released, 'points', v_points);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bonus_rewards(uuid[], integer) TO service_role;