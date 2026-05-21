
-- 1. 商品增加獎勵點 / 折扣點上限
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_points_max integer NOT NULL DEFAULT 0;

-- 2. profiles 增加推薦碼 / VIP
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz;

-- 自動產生推薦碼
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  code text;
  exists_count int;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE referral_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$ SET search_path = public;

-- 回填現有會員推薦碼
UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

-- 觸發器：新會員自動產生推薦碼
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- 3. 點數錢包
CREATE TABLE IF NOT EXISTS public.member_points_wallet (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shopping_points integer NOT NULL DEFAULT 0,  -- 購物點（儲值）
  reward_points integer NOT NULL DEFAULT 0,    -- 獎勵點（推廣/購物回饋）
  discount_points integer NOT NULL DEFAULT 0,  -- 折扣點
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_points_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet" ON public.member_points_wallet
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role));

CREATE POLICY "Admin manage wallet" ON public.member_points_wallet
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

-- 4. 點數異動紀錄
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  point_type text NOT NULL CHECK (point_type IN ('shopping','reward','discount')),
  amount integer NOT NULL,  -- 正為增加、負為扣除
  balance_after integer NOT NULL,
  source text NOT NULL,     -- topup / order_earn / order_redeem / referral / vip_bonus / admin_adjust / expire
  reference_id uuid,        -- 訂單/推廣紀錄等
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_point_tx_user ON public.point_transactions(user_id, created_at DESC);

CREATE POLICY "Users view own tx" ON public.point_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "Admin manage tx" ON public.point_transactions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

-- 5. 推廣紀錄
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  referral_code text NOT NULL,
  signup_reward_points integer NOT NULL DEFAULT 100,
  signup_rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Related users view referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "Admin manage referrals" ON public.referrals
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

-- 6. VIP 方案
CREATE TABLE IF NOT EXISTS public.vip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 365,
  bonus_points integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view active vip plans" ON public.vip_plans
  FOR SELECT TO anon, authenticated USING (status = 'active'
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

CREATE POLICY "Admin manage vip plans" ON public.vip_plans
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role));

-- 7. VIP 開通紀錄
CREATE TABLE IF NOT EXISTS public.vip_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.vip_plans(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'plan',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vip_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own vip" ON public.vip_memberships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role));

CREATE POLICY "Admin manage vip memberships" ON public.vip_memberships
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'sales'::app_role)
    OR private.has_role(auth.uid(),'finance'::app_role));

-- 8. 預設 VIP 方案
INSERT INTO public.vip_plans (name, description, price, duration_days, bonus_points, sort_order)
VALUES ('年度 VIP', '繳交年費 NT$1,500 升級 VIP，享 VIP 專屬價與額外獎勵點', 1500, 365, 300, 1)
ON CONFLICT DO NOTHING;
