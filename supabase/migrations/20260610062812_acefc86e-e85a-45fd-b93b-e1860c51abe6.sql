
-- ============== 拼團系統 ==============
CREATE TABLE public.group_buy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  winner_reward_pct numeric NOT NULL DEFAULT 80,
  initiator_reward_pct numeric NOT NULL DEFAULT 10,
  default_duration_days int NOT NULL DEFAULT 7,
  target_count int NOT NULL DEFAULT 6,
  max_orders_per_user int NOT NULL DEFAULT 2,
  auto_refund_hours int DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.group_buy_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.group_buy_settings TO authenticated;
GRANT ALL ON public.group_buy_settings TO service_role;
ALTER TABLE public.group_buy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbs read" ON public.group_buy_settings FOR SELECT USING (true);
CREATE POLICY "gbs admin write" ON public.group_buy_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_gbs_updated BEFORE UPDATE ON public.group_buy_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.group_buys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL REFERENCES auth.users(id),
  unit_price numeric(12,2) NOT NULL,
  target_count int NOT NULL DEFAULT 6,
  current_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired','refunded','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  winner_id uuid REFERENCES auth.users(id),
  winner_picked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gb_company_status ON public.group_buys(company_id, status);
CREATE INDEX idx_gb_product_open ON public.group_buys(product_id) WHERE status='open';
GRANT SELECT ON public.group_buys TO anon, authenticated;
GRANT INSERT, UPDATE ON public.group_buys TO authenticated;
GRANT ALL ON public.group_buys TO service_role;
ALTER TABLE public.group_buys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gb public read" ON public.group_buys FOR SELECT USING (true);
CREATE POLICY "gb initiator insert" ON public.group_buys FOR INSERT TO authenticated WITH CHECK (initiator_id = auth.uid());
CREATE POLICY "gb admin update" ON public.group_buys FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_gb_updated BEFORE UPDATE ON public.group_buys FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.group_buy_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_buy_id uuid NOT NULL REFERENCES public.group_buys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 2),
  unit_price numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id),
  payment_method text NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('points','bank_transfer','mixed')),
  points_used int NOT NULL DEFAULT 0,
  cash_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('pending_payment','paid','refunded','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX idx_gbo_gb ON public.group_buy_orders(group_buy_id);
CREATE INDEX idx_gbo_user ON public.group_buy_orders(user_id);
GRANT SELECT, INSERT ON public.group_buy_orders TO authenticated;
GRANT UPDATE ON public.group_buy_orders TO authenticated;
GRANT ALL ON public.group_buy_orders TO service_role;
ALTER TABLE public.group_buy_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gbo owner read" ON public.group_buy_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'sales'::app_role));
CREATE POLICY "gbo public count read" ON public.group_buy_orders FOR SELECT USING (true);
CREATE POLICY "gbo self insert" ON public.group_buy_orders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "gbo admin update" ON public.group_buy_orders FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));

-- Trigger: 一個商品同時只能有一個 open 拼團
CREATE OR REPLACE FUNCTION public.gb_validate_open_uniqueness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'open' AND EXISTS (
    SELECT 1 FROM public.group_buys
    WHERE product_id = NEW.product_id AND status = 'open' AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION '此商品已有進行中的拼團';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_gb_unique_open BEFORE INSERT OR UPDATE ON public.group_buys
  FOR EACH ROW EXECUTE FUNCTION public.gb_validate_open_uniqueness();

-- Trigger: 加入拼團檢查（同人 ≤2 單、團未滿、未過期），並維護 current_count
CREATE OR REPLACE FUNCTION public.gb_validate_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _gb public.group_buys;
  _existing int;
  _settings public.group_buy_settings;
BEGIN
  SELECT * INTO _gb FROM public.group_buys WHERE id = NEW.group_buy_id FOR UPDATE;
  IF _gb.status <> 'open' THEN RAISE EXCEPTION '拼團已結束'; END IF;
  IF _gb.expires_at < now() THEN RAISE EXCEPTION '拼團已過期'; END IF;

  SELECT * INTO _settings FROM public.group_buy_settings WHERE company_id = _gb.company_id;
  SELECT COALESCE(SUM(quantity),0) INTO _existing
    FROM public.group_buy_orders
    WHERE group_buy_id = NEW.group_buy_id AND user_id = NEW.user_id AND status IN ('paid','pending_payment');
  IF _existing + NEW.quantity > COALESCE(_settings.max_orders_per_user, 2) THEN
    RAISE EXCEPTION '超過每人限購數量';
  END IF;
  IF _gb.current_count + NEW.quantity > _gb.target_count THEN
    RAISE EXCEPTION '拼團名額不足';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_gbo_validate BEFORE INSERT ON public.group_buy_orders
  FOR EACH ROW EXECUTE FUNCTION public.gb_validate_join();

-- 加入後更新 current_count，滿員後結算
CREATE OR REPLACE FUNCTION public.gb_after_join()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _gb public.group_buys;
  _settings public.group_buy_settings;
  _total_revenue numeric;
  _winner uuid;
  _winner_pts int;
  _initiator_pts int;
BEGIN
  IF NEW.status NOT IN ('paid') THEN RETURN NEW; END IF;
  UPDATE public.group_buys
    SET current_count = current_count + NEW.quantity
    WHERE id = NEW.group_buy_id
    RETURNING * INTO _gb;
  IF _gb.current_count >= _gb.target_count AND _gb.status = 'open' THEN
    SELECT * INTO _settings FROM public.group_buy_settings WHERE company_id = _gb.company_id;
    -- 隨機抽中獎者
    SELECT user_id INTO _winner FROM public.group_buy_orders
      WHERE group_buy_id = _gb.id AND status = 'paid'
      ORDER BY random() LIMIT 1;
    SELECT SUM(cash_amount + points_used) INTO _total_revenue
      FROM public.group_buy_orders WHERE group_buy_id = _gb.id AND status = 'paid';
    _winner_pts := floor(_total_revenue * COALESCE(_settings.winner_reward_pct, 80) / 100);
    _initiator_pts := floor(_total_revenue * COALESCE(_settings.initiator_reward_pct, 10) / 100);
    UPDATE public.group_buys SET status='completed', completed_at=now(),
      winner_id=_winner, winner_picked_at=now() WHERE id=_gb.id;
    -- 發購物點給中獎者
    INSERT INTO public.member_points_wallet (user_id, shopping_points)
      VALUES (_winner, _winner_pts)
      ON CONFLICT (user_id) DO UPDATE SET shopping_points = member_points_wallet.shopping_points + EXCLUDED.shopping_points, updated_at=now();
    INSERT INTO public.reward_wallet_logs (member_id, points, type, description)
      VALUES (_winner, _winner_pts, 'earn', '拼團中獎獎勵 #'||_gb.id);
    -- 發獎勵點給發起人
    INSERT INTO public.member_points_wallet (user_id, reward_points)
      VALUES (_gb.initiator_id, _initiator_pts)
      ON CONFLICT (user_id) DO UPDATE SET reward_points = member_points_wallet.reward_points + EXCLUDED.reward_points, updated_at=now();
    INSERT INTO public.reward_wallet_logs (member_id, points, type, description)
      VALUES (_gb.initiator_id, _initiator_pts, 'earn', '拼團發起人獎勵 #'||_gb.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_gbo_after_join AFTER INSERT ON public.group_buy_orders
  FOR EACH ROW EXECUTE FUNCTION public.gb_after_join();

-- ============== Webhook 系統 ==============
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  bearer_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  events text[] NOT NULL DEFAULT ARRAY['member.created','order.created','group_buy.created','vip.upgraded']::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wh admin manage" ON public.webhook_endpoints FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_we_updated BEFORE UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status_code int,
  response_body text,
  attempts int NOT NULL DEFAULT 1,
  error text,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wd_endpoint ON public.webhook_deliveries(endpoint_id, delivered_at DESC);
GRANT SELECT, INSERT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wd admin read" ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "wd service insert" ON public.webhook_deliveries FOR INSERT TO authenticated WITH CHECK (true);
