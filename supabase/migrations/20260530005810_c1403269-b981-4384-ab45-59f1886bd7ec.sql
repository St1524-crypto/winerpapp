DO $$
DECLARE
  v_referrer uuid := '3c7a2acc-729c-40fc-82b3-27f7923ec1d9';
  v_buyer    uuid := '27d076ed-28e6-4cb0-ad71-53d7462742d4';
  v_company  uuid := 'ded70bbc-f96a-48f7-aaa5-f0b0bfb88f85';
  v_plan     uuid := '779af171-5626-4073-834e-bdecf3a53c51';
  v_order_id uuid;
  v_order_no text := 'E2E-' || to_char(now(),'YYYYMMDDHH24MISS');
  v_subtotal numeric := 1000;
  v_rate     numeric;
  v_points   integer;
  v_balance_before integer := 0;
  v_balance_after  integer;
  v_old_rate numeric;
BEGIN
  SELECT referral_rate_percent INTO v_old_rate FROM vip_plans WHERE id = v_plan;
  UPDATE vip_plans SET referral_rate_percent = 10 WHERE id = v_plan;
  RAISE NOTICE '[0] 原 plan rate=%, 暫調為 10', v_old_rate;

  UPDATE profiles SET referred_by = v_referrer WHERE id = v_buyer AND referred_by IS NULL;
  RAISE NOTICE '[1] 綁定買家 -> 推薦人 OK';

  INSERT INTO sales_orders(
    order_no, user_id, customer_name, receiver_name, receiver_phone,
    shipping_address, subtotal, total_amount, payment_status, order_status,
    company_id, referrer_id
  ) VALUES (
    v_order_no, v_buyer, '鼎宸', '鼎宸', '0900000000',
    'E2E 測試地址', v_subtotal, v_subtotal, 'paid', 'confirmed',
    v_company, v_referrer
  ) RETURNING id INTO v_order_id;
  RAISE NOTICE '[2] 訂單建立 % id=%', v_order_no, v_order_id;

  SELECT vp.referral_rate_percent INTO v_rate
  FROM vip_memberships m JOIN vip_plans vp ON vp.id = m.plan_id
  WHERE m.user_id = v_referrer ORDER BY m.expires_at DESC LIMIT 1;
  v_points := floor(v_subtotal * v_rate / 100);
  RAISE NOTICE '[3] rate=%, points=%', v_rate, v_points;

  INSERT INTO referral_logs(order_id, referrer_id, buyer_id, base_amount, rate_percent, points, status, note)
  VALUES (v_order_id, v_referrer, v_buyer, v_subtotal, v_rate, v_points,
          CASE WHEN v_points > 0 THEN 'granted' ELSE 'skipped' END,
          '訂單 ' || v_order_no || ' 佣金結算');

  INSERT INTO member_points_wallet(user_id) VALUES (v_referrer) ON CONFLICT (user_id) DO NOTHING;
  SELECT reward_points INTO v_balance_before FROM member_points_wallet WHERE user_id = v_referrer;
  v_balance_after := v_balance_before + v_points;
  UPDATE member_points_wallet SET reward_points = v_balance_after, updated_at = now() WHERE user_id = v_referrer;

  IF v_points > 0 THEN
    INSERT INTO point_transactions(user_id, point_type, amount, balance_after, source, reference_id, note)
    VALUES (v_referrer, 'reward', v_points, v_balance_after, 'referral_commission', v_order_id,
            '訂單 ' || v_order_no || ' 推薦佣金');
  END IF;
  RAISE NOTICE '[4] wallet reward_points: % -> %', v_balance_before, v_balance_after;

  BEGIN
    INSERT INTO referral_logs(order_id, referrer_id, buyer_id, base_amount, rate_percent, points, status, note)
    VALUES (v_order_id, v_referrer, v_buyer, v_subtotal, v_rate, v_points, 'granted', 'DUP');
    RAISE EXCEPTION '[5] FAIL 重複結算未被擋下';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '[5] OK 去重生效';
  END;

  UPDATE vip_plans SET referral_rate_percent = v_old_rate WHERE id = v_plan;
  RAISE NOTICE '[6] 還原 plan rate=%', v_old_rate;
END $$;