CREATE OR REPLACE FUNCTION public.validate_cash_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 後端/系統流程（服務金鑰、資料庫維運角色、SECURITY DEFINER 內部流程）直接放行，
  -- 例如 public.release_bonus_rewards 的獎金 80/20 入帳。
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'finance'::app_role)
     OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cash_transactions: cannot create requests for other users';
  END IF;

  IF NEW.tx_type NOT IN ('topup', 'withdraw') THEN
    RAISE EXCEPTION 'cash_transactions: invalid tx_type';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.amount > 1000000 THEN
    RAISE EXCEPTION 'cash_transactions: amount out of allowed range';
  END IF;

  NEW.status := 'pending';
  NEW.balance_after := NULL;
  NEW.processed_by := NULL;
  NEW.processed_at := NULL;
  NEW.reference_id := NULL;
  NEW.related_point_amount := NULL;
  NEW.created_by := auth.uid();

  RETURN NEW;
END;
$$;