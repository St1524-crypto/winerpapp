
-- ============ Core function: process_paid_order_upgrades ============
CREATE OR REPLACE FUNCTION public.process_paid_order_upgrades(
  p_order_id uuid,
  p_operator uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order            record;
  v_user_id          uuid;
  v_operator_note    text;
  v_now              timestamptz := now();
  v_pkg              record;
  v_rule             record;
  v_product_ids      uuid[];
  v_skus             text[];
  v_profile          record;
  v_current_order    int;
  v_target_order     int;
  v_will_upgrade     boolean;
  v_base_expiry      timestamptz;
  v_before           timestamptz;
  v_after            timestamptz;
  v_new_tier         text;
  v_gift             record;
  v_before_stock     int;
  v_after_stock      int;
  v_total_reward     bigint;
  v_pkg_created      int := 0;
  v_pkg_skipped      int := 0;
  v_annual_created   int := 0;
  v_annual_skipped   int := 0;
  v_gifts_out        jsonb := '[]'::jsonb;
BEGIN
  SELECT id, user_id, payment_status, order_no
    INTO v_order
    FROM public.sales_orders
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found: %', p_order_id;
  END IF;

  IF v_order.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_paid');
  END IF;

  v_user_id := v_order.user_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  v_operator_note := CASE WHEN p_operator IS NULL
    THEN '系統自動：訂單付款觸發'
    ELSE '管理員 ' || p_operator::text || ' 手動補跑'
  END;

  -- collect item product_ids and skus
  SELECT array_agg(DISTINCT product_id) FILTER (WHERE product_id IS NOT NULL),
         array_agg(DISTINCT sku)        FILTER (WHERE sku IS NOT NULL)
    INTO v_product_ids, v_skus
    FROM public.sales_order_items
   WHERE sales_order_id = p_order_id;

  -- ========== 1) VIP 升級套組 ==========
  IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
    FOR v_pkg IN
      SELECT * FROM public.vip_upgrade_packages
       WHERE status = 'active'
         AND id IN (
           SELECT id FROM public.vip_upgrade_packages
            WHERE package_product_id = ANY(v_product_ids)
           UNION
           SELECT id FROM public.vip_upgrade_packages
            WHERE product_id = ANY(v_product_ids)
           UNION
           SELECT package_id FROM public.vip_upgrade_package_products
            WHERE product_id = ANY(v_product_ids)
         )
    LOOP
      -- idempotent
      IF EXISTS (
        SELECT 1 FROM public.vip_package_upgrade_logs
         WHERE sales_order_id = p_order_id AND package_id = v_pkg.id
      ) THEN
        v_pkg_skipped := v_pkg_skipped + 1;
        CONTINUE;
      END IF;

      SELECT vip_tier, is_vip, vip_expires_at
        INTO v_profile FROM public.profiles WHERE id = v_user_id;

      SELECT COALESCE(sort_order, 0) INTO v_current_order
        FROM public.vip_tiers WHERE code = v_profile.vip_tier;
      v_current_order := COALESCE(v_current_order, 0);

      SELECT COALESCE(sort_order, 0) INTO v_target_order
        FROM public.vip_tiers WHERE code = v_pkg.tier_code;
      v_target_order := COALESCE(v_target_order, 0);

      v_will_upgrade := v_target_order > v_current_order;
      v_before := v_profile.vip_expires_at;
      v_base_expiry := CASE
        WHEN v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > v_now
          THEN v_profile.vip_expires_at
        ELSE v_now
      END;
      v_after := CASE
        WHEN COALESCE(v_pkg.duration_days, 0) > 0
          THEN v_base_expiry + make_interval(days => v_pkg.duration_days)
        ELSE v_before
      END;
      v_new_tier := CASE WHEN v_will_upgrade THEN v_pkg.tier_code ELSE v_profile.vip_tier END;

      UPDATE public.profiles
         SET is_vip = true,
             vip_tier = COALESCE(v_new_tier, vip_tier),
             vip_expires_at = COALESCE(v_after, vip_expires_at)
       WHERE id = v_user_id;

      -- bonus points
      IF COALESCE(v_pkg.bonus_points, 0) > 0 THEN
        INSERT INTO public.reward_wallet_logs (member_id, points, type, description)
        VALUES (v_user_id, v_pkg.bonus_points, 'earn',
                'VIP 升級套組贈點：' || v_pkg.name);

        SELECT COALESCE(SUM(points), 0) INTO v_total_reward
          FROM public.reward_wallet_logs WHERE member_id = v_user_id;

        INSERT INTO public.member_points_wallet (user_id, reward_points)
        VALUES (v_user_id, v_total_reward)
        ON CONFLICT (user_id) DO UPDATE SET reward_points = EXCLUDED.reward_points;
      END IF;

      -- gifts (exclude anchor)
      v_gifts_out := '[]'::jsonb;
      FOR v_gift IN
        SELECT product_id, COALESCE(quantity, 1) AS quantity
          FROM public.vip_upgrade_package_products
         WHERE package_id = v_pkg.id
           AND product_id IS NOT NULL
           AND product_id IS DISTINCT FROM v_pkg.package_product_id
      LOOP
        SELECT stock INTO v_before_stock FROM public.products WHERE id = v_gift.product_id;
        IF v_before_stock IS NULL THEN CONTINUE; END IF;
        v_after_stock := v_before_stock - v_gift.quantity;
        UPDATE public.products SET stock = v_after_stock WHERE id = v_gift.product_id;
        INSERT INTO public.inventory_logs
          (product_id, type, quantity, before_stock, after_stock, reason, operator_id, company_id)
        SELECT v_gift.product_id, 'out', v_gift.quantity, v_before_stock, v_after_stock,
               'VIP升級套組贈品出庫：' || v_pkg.name || ' x' || v_gift.quantity ||
               '（訂單 ' || v_order.order_no || '）',
               p_operator, company_id
          FROM public.products WHERE id = v_gift.product_id;
        v_gifts_out := v_gifts_out || jsonb_build_object(
          'product_id', v_gift.product_id,
          'quantity',   v_gift.quantity,
          'after_stock', v_after_stock
        );
      END LOOP;

      INSERT INTO public.vip_package_upgrade_logs
        (sales_order_id, package_id, user_id, tier_code, previous_tier, new_tier,
         vip_expires_before, vip_expires_after, bonus_points, upgraded, status, notes)
      VALUES
        (p_order_id, v_pkg.id, v_user_id, v_pkg.tier_code,
         v_profile.vip_tier, v_new_tier,
         v_before, v_after, COALESCE(v_pkg.bonus_points, 0),
         v_will_upgrade, 'applied', v_operator_note);

      INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
      VALUES (p_operator, 'vip_package_auto_upgrade', 'sales_orders', p_order_id,
              jsonb_build_object(
                'order_no', v_order.order_no,
                'target_user', v_user_id,
                'package_id', v_pkg.id,
                'tier_code', v_pkg.tier_code,
                'previous_tier', v_profile.vip_tier,
                'new_tier', v_new_tier,
                'upgraded', v_will_upgrade,
                'bonus_points', COALESCE(v_pkg.bonus_points, 0),
                'granted_gifts', v_gifts_out,
                'source', CASE WHEN p_operator IS NULL THEN 'db_trigger' ELSE 'admin_rerun' END
              ));

      v_pkg_created := v_pkg_created + 1;
    END LOOP;
  END IF;

  -- ========== 2) 年費 VIP 規則 ==========
  IF v_skus IS NOT NULL AND array_length(v_skus, 1) > 0 THEN
    FOR v_rule IN
      SELECT * FROM public.annual_fee_vip_rules
       WHERE is_active = true
         AND sku = ANY(v_skus)
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.annual_fee_upgrade_logs
         WHERE sales_order_id = p_order_id AND sku = v_rule.sku
      ) THEN
        v_annual_skipped := v_annual_skipped + 1;
        CONTINUE;
      END IF;

      SELECT is_vip, vip_expires_at INTO v_profile
        FROM public.profiles WHERE id = v_user_id;

      v_before := v_profile.vip_expires_at;
      v_base_expiry := CASE
        WHEN v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > v_now
          THEN v_profile.vip_expires_at
        ELSE v_now
      END;
      v_after := v_base_expiry + make_interval(days => v_rule.upgrade_days);

      UPDATE public.profiles
         SET is_vip = true,
             vip_expires_at = v_after
       WHERE id = v_user_id;

      IF COALESCE(v_rule.reward_points, 0) > 0 THEN
        INSERT INTO public.reward_wallet_logs (member_id, points, type, description)
        VALUES (v_user_id, v_rule.reward_points, 'earn',
                '年費商品自動升級 VIP 獎勵 (SKU ' || v_rule.sku || ')');
        SELECT COALESCE(SUM(points), 0) INTO v_total_reward
          FROM public.reward_wallet_logs WHERE member_id = v_user_id;
        INSERT INTO public.member_points_wallet (user_id, reward_points)
        VALUES (v_user_id, v_total_reward)
        ON CONFLICT (user_id) DO UPDATE SET reward_points = EXCLUDED.reward_points;
      END IF;

      INSERT INTO public.annual_fee_upgrade_logs
        (sales_order_id, user_id, sku, rule_id, upgrade_days,
         vip_expires_before, vip_expires_after, gift_product_id, gift_quantity, status, notes)
      VALUES
        (p_order_id, v_user_id, v_rule.sku, v_rule.id, v_rule.upgrade_days,
         v_before, v_after, v_rule.gift_product_id, COALESCE(v_rule.gift_quantity, 0),
         'applied', v_operator_note);

      INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
      VALUES (p_operator, 'annual_fee_vip_upgrade', 'sales_orders', p_order_id,
              jsonb_build_object(
                'order_no', v_order.order_no,
                'target_user', v_user_id,
                'sku', v_rule.sku,
                'upgrade_days', v_rule.upgrade_days,
                'vip_expires_before', v_before,
                'vip_expires_after', v_after,
                'reward_points', COALESCE(v_rule.reward_points, 0),
                'source', CASE WHEN p_operator IS NULL THEN 'db_trigger' ELSE 'admin_rerun' END
              ));

      v_annual_created := v_annual_created + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'user_id', v_user_id,
    'vip_package_created', v_pkg_created,
    'vip_package_skipped', v_pkg_skipped,
    'annual_fee_created', v_annual_created,
    'annual_fee_skipped', v_annual_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_paid_order_upgrades(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_paid_order_upgrades(uuid, uuid) TO service_role;
-- authenticated only calls via server fn using service role; direct rpc access blocked.

-- ============ Trigger wrapper (never rollback the paid state) ============
CREATE OR REPLACE FUNCTION public.trg_process_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.process_paid_order_upgrades(NEW.id, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, metadata)
    VALUES (NULL, 'paid_order_upgrade_failed', 'sales_orders', NEW.id,
            jsonb_build_object(
              'order_no', NEW.order_no,
              'user_id', NEW.user_id,
              'sqlstate', SQLSTATE,
              'error', SQLERRM
            ));
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_sales_order_payment_paid ON public.sales_orders;
CREATE TRIGGER on_sales_order_payment_paid
AFTER UPDATE OF payment_status ON public.sales_orders
FOR EACH ROW
WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status
      AND NEW.payment_status = 'paid'
      AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.trg_process_order_paid();

DROP TRIGGER IF EXISTS on_sales_order_payment_paid_insert ON public.sales_orders;
CREATE TRIGGER on_sales_order_payment_paid_insert
AFTER INSERT ON public.sales_orders
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.trg_process_order_paid();
