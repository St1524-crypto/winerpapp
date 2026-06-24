
-- =========================================
-- Quotes Phase 1: settings + bank accounts + quotes + items
-- =========================================

-- 1) quote_company_settings (per company, single row)
CREATE TABLE public.quote_company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_name_en text,
  tax_id text,
  representative text,
  phone text,
  fax text,
  email text,
  address text,
  logo_url text,
  website text,
  line_id text,
  header_note text,
  footer_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_company_settings TO authenticated;
GRANT ALL ON public.quote_company_settings TO service_role;
ALTER TABLE public.quote_company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qcs admin manage" ON public.quote_company_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "qcs sales staff read" ON public.quote_company_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'finance')
    OR EXISTS (SELECT 1 FROM public.operation_participants op
               WHERE op.user_id = auth.uid() AND op.is_active = true)
  );

CREATE TRIGGER trg_qcs_updated BEFORE UPDATE ON public.quote_company_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 2) quote_bank_accounts
CREATE TABLE public.quote_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  branch_name text,
  bank_code text,
  account_name text NOT NULL,
  account_number text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_bank_accounts TO authenticated;
GRANT ALL ON public.quote_bank_accounts TO service_role;
ALTER TABLE public.quote_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qba admin manage" ON public.quote_bank_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "qba sales finance read" ON public.quote_bank_accounts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'finance')
  );

CREATE TRIGGER trg_qba_updated BEFORE UPDATE ON public.quote_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 3) quotes
CREATE SEQUENCE IF NOT EXISTS public.quote_no_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_quote_no()
RETURNS text LANGUAGE sql SET search_path='public' AS $$
  SELECT 'Q' || to_char(now() AT TIME ZONE 'Asia/Taipei','YYYYMMDD') || lpad(nextval('public.quote_no_seq')::text, 4, '0')
$$;

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_no text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  customer_address text,
  quote_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  valid_until date,
  salesperson_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  salesperson_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','converted','cancelled')),
  bank_account_id uuid REFERENCES public.quote_bank_accounts(id) ON DELETE SET NULL,
  company_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  bank_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  payment_terms text,
  public_token text UNIQUE,
  converted_order_id uuid,
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
GRANT SELECT ON public.quotes TO anon; -- needed for public_token preview via RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes admin manage" ON public.quotes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "quotes sales create" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'sales') AND created_by = auth.uid());

CREATE POLICY "quotes sales read own" ON public.quotes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'sales') AND (created_by = auth.uid() OR salesperson_id = auth.uid()));

CREATE POLICY "quotes sales update own non-converted" ON public.quotes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'sales') AND created_by = auth.uid() AND status <> 'converted')
  WITH CHECK (public.has_role(auth.uid(),'sales') AND status <> 'converted');

-- public read by token (token must be supplied via filter; null token rows are not exposed)
CREATE POLICY "quotes public read by token" ON public.quotes
  FOR SELECT TO anon
  USING (public_token IS NOT NULL);

CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- block edits when converted (defense in depth)
CREATE OR REPLACE FUNCTION public.quotes_block_when_converted()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
BEGIN
  IF OLD.status = 'converted' AND TG_OP = 'UPDATE' THEN
    -- allow status change only by admins (e.g. cancel) via separate path; block here
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'quote already converted; cannot modify';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.bank_snapshot IS DISTINCT FROM OLD.bank_snapshot
       OR NEW.company_snapshot IS DISTINCT FROM OLD.company_snapshot THEN
      RAISE EXCEPTION 'quote already converted; immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_quotes_block_converted BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_block_when_converted();


-- 4) quote_items
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  spec text,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
GRANT SELECT ON public.quote_items TO anon;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qi admin manage" ON public.quote_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
      AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
      AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')))
  );

CREATE POLICY "qi sales manage own non-converted" ON public.quote_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
      AND public.has_role(auth.uid(),'sales') AND q.created_by = auth.uid() AND q.status <> 'converted')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
      AND public.has_role(auth.uid(),'sales') AND q.created_by = auth.uid() AND q.status <> 'converted')
  );

CREATE POLICY "qi public read by token" ON public.quote_items
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND q.public_token IS NOT NULL));

CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);
CREATE INDEX idx_quotes_company ON public.quotes(company_id);
CREATE INDEX idx_quotes_status ON public.quotes(status);
CREATE INDEX idx_qba_company ON public.quote_bank_accounts(company_id);
