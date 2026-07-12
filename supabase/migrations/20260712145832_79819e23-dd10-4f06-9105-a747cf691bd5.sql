
-- 補發已付款訂單 SO-20260712-58841 與 SO-20260712-09025 的獎勵點（冪等，僅在尚未發放時執行）
DO $$
DECLARE
  r RECORD;
  earn_pts NUMERIC;
  new_balance NUMERIC;
BEGIN
  FOR r IN
    SELECT so.id AS order_id, so.user_id
    FROM public.sales_orders so
    WHERE so.order_no IN ('SO-20260712-58841','SO-20260712-09025')
      AND so.payment_status = 'paid'
  LOOP
    -- 已存在 order_earn 或 order_earn_referrer 記錄 → 跳過
    IF EXISTS (
      SELECT 1 FROM public.point_transactions
      WHERE reference_id = r.order_id
        AND point_type = 'reward'
        AND source IN ('order_earn','order_earn_referrer')
    ) THEN
      CONTINUE;
    END IF;

    -- 計算獎勵點 = sum(products.reward_points * qty)
    SELECT COALESCE(SUM(COALESCE(p.reward_points,0) * i.quantity), 0)
      INTO earn_pts
      FROM public.sales_order_items i
      JOIN public.products p ON p.id = i.product_id
     WHERE i.sales_order_id = r.order_id;

    IF earn_pts <= 0 THEN CONTINUE; END IF;

    -- 買家為有效 VIP：入自己帳戶（本次兩筆訂單經確認皆為有效 VIP）
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = r.user_id
        AND pr.is_vip = true
        AND (pr.vip_expires_at IS NULL OR pr.vip_expires_at > now())
    ) THEN
      -- 確保錢包存在
      INSERT INTO public.member_points_wallet (user_id)
        VALUES (r.user_id)
        ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.member_points_wallet
         SET reward_points = COALESCE(reward_points,0) + earn_pts,
             updated_at = now()
       WHERE user_id = r.user_id
      RETURNING reward_points INTO new_balance;

      INSERT INTO public.point_transactions
        (user_id, point_type, amount, balance_after, source, reference_id, note, created_by)
      VALUES
        (r.user_id, 'reward', earn_pts, new_balance, 'order_earn', r.order_id,
         '補發：訂單付款完成獎勵點', r.user_id);
    END IF;
  END LOOP;
END $$;
