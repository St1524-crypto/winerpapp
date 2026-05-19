
-- ============ 1. 銀行帳戶 ============
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  bank_name text NOT NULL,
  account_no text NOT NULL,
  currency text NOT NULL DEFAULT 'TWD',
  balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manage bank_accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Staff view bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 2. 財務交易 ============
CREATE TABLE public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income','expense','transfer')),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference_no text,
  reference_type text,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_finance_tx_occurred ON public.finance_transactions(occurred_at DESC);
CREATE INDEX idx_finance_tx_type ON public.finance_transactions(type);
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manage transactions" ON public.finance_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Staff view transactions" ON public.finance_transactions FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_finance_tx_updated BEFORE UPDATE ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 3. 應收帳款 ============
CREATE TABLE public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid REFERENCES public.business_accounts(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  invoice_no text NOT NULL,
  reference_order_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX idx_ar_due ON public.accounts_receivable(due_date);
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manage ar" ON public.accounts_receivable FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Staff view ar" ON public.accounts_receivable FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales'));
CREATE TRIGGER trg_ar_updated BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 4. 應付帳款 ============
CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL,
  bill_no text NOT NULL,
  reference_po_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ap_status ON public.accounts_payable(status);
CREATE INDEX idx_ap_due ON public.accounts_payable(due_date);
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manage ap" ON public.accounts_payable FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Staff view ap" ON public.accounts_payable FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'warehouse'));
CREATE TRIGGER trg_ap_updated BEFORE UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 5. 發票 ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'personal',
  tax_id text,
  buyer_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  issued_at timestamptz,
  void_at timestamptz,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_status ON public.invoices(status);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Staff and owner view invoices" ON public.invoices FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales')
    OR EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = invoices.sales_order_id AND so.user_id = auth.uid())
  );
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 6. 多公司 ============
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  address text,
  logo_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage companies" ON public.companies FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'super_admin'));
CREATE POLICY "Auth view companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage company_members" ON public.company_members FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'super_admin'));
CREATE POLICY "Users view own company_members" ON public.company_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'super_admin'));

-- ============ 7. 自動化 ============
CREATE TABLE public.automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  run_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage workflows" ON public.automation_workflows FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.automation_workflows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'success',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_runs_workflow ON public.automation_runs(workflow_id, ran_at DESC);
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin view runs" ON public.automation_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE POLICY "Admin insert runs" ON public.automation_runs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));

-- ============ 8. API Keys ============
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  status text NOT NULL DEFAULT 'active',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage api_keys" ON public.api_keys FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'))
  WITH CHECK (has_role(auth.uid(),'super_admin'));

-- ============ 9. AI Logs ============
CREATE TABLE public.ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  prompt text,
  analysis_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  tokens_used integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_logs_module ON public.ai_logs(module, created_at DESC);
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin view ai_logs" ON public.ai_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance') OR has_role(auth.uid(),'sales'));
CREATE POLICY "Authenticated insert ai_logs" ON public.ai_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============ 10. 通知規則 ============
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rule_type text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manage notification_rules" ON public.notification_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance'));
CREATE TRIGGER trg_notification_rules_updated BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
