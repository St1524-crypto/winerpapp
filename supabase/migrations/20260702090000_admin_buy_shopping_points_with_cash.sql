-- Atomic admin/finance action: buy shopping points for a member using cash wallet balance.
-- Keeps cash deduction, cash ledger, shopping point credit, and point ledger in one transaction.

CREATE OR REPLACE FUNCTION public.admin_buy_shopping_points_with_cash(
  _member_id uuid,
  _amount numeric,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_cash_before numeric(14,2);
  v_cash_after numeric(14,2);
  v_points_before integer;
  v_points_after integer;
  v_points integer;
  v_cash_tx_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '需要登入後才能執行';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'super_admin'::app_role)
    OR public.has_role(v_actor, 'admin'::app_role)
    OR public.has_role(v_actor, 'finance'::app_role)
  ) THEN
    RAISE EXCEPTION '沒有權限，僅 admin / finance 可代會員購買購物點';
  END IF;

  IF _member_id IS NULL THEN
    RAISE EXCEPTION '缺少會員 ID';
  END IF;

  IF COALESCE(_amount, 0) <= 0 THEN
    RAISE EXCEPTION '購買金額必須大於 0';
  END IF;

  IF _amount > 10000000 THEN
    RAISE EXCEPTION '單次購買金額不可超過 10,000,000';
  END IF;

  v_points := floor(_amount)::integer;
  IF v_points <= 0 THEN
    RAISE EXCEPTION '購買金額不足以轉換為購物點';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _member_id) THEN
    RAISE EXCEPTION '找不到會員帳號';
  END IF;

  INSERT INTO public.member_points_wallet (user_id)
  VALUES (_member_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT cash_balance, shopping_points
    INTO v_cash_before, v_points_before
  FROM public.member_points_wallet
  WHERE user_id = _member_id
  FOR UPDATE;

  v_cash_before := COALESCE(v_cash_before, 0);
  v_points_before := COALESCE(v_points_before, 0);

  IF v_cash_before < _amount THEN
    RAISE EXCEPTION '會員現金餘額不足，目前餘額 %', v_cash_before;
  END IF;

  v_cash_after := round((v_cash_before - _amount)::numeric, 2);
  v_points_after := v_points_before + v_points;

  UPDATE public.member_points_wallet
  SET cash_balance = v_cash_after,
      shopping_points = v_points_after,
      updated_at = now()
  WHERE user_id = _member_id;

  INSERT INTO public.cash_transactions (
    user_id,
    tx_type,
    amount,
    balance_after,
    status,
    related_point_amount,
    note,
    created_by,
    processed_by,
    processed_at
  )
  VALUES (
    _member_id,
    'buy_points',
    -_amount,
    v_cash_after,
    'completed',
    v_points,
    COALESCE(NULLIF(trim(_note), ''), '管理員代會員使用現金錢包購買購物點'),
    v_actor,
    v_actor,
    now()
  )
  RETURNING id INTO v_cash_tx_id;

  INSERT INTO public.point_transactions (
    user_id,
    point_type,
    amount,
    balance_after,
    source,
    reference_id,
    note,
    created_by
  )
  VALUES (
    _member_id,
    'shopping',
    v_points,
    v_points_after,
    'cash_buy',
    v_cash_tx_id,
    '現金錢包購買購物點 NT$' || trim(to_char(_amount, 'FM999999999999990.00')),
    v_actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'member_id', _member_id,
    'cash_before', v_cash_before,
    'cash_after', v_cash_after,
    'shopping_points_before', v_points_before,
    'shopping_points_after', v_points_after,
    'points_added', v_points,
    'cash_transaction_id', v_cash_tx_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_buy_shopping_points_with_cash(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_buy_shopping_points_with_cash(uuid, numeric, text) TO authenticated, service_role;
