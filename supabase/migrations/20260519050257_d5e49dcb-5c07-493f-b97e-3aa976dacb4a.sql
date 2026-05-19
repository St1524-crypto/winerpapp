-- Dealers
CREATE TABLE public.dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'bronze',
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales view dealers" ON public.dealers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'sales') OR has_role(auth.uid(),'finance'));

CREATE POLICY "Sales manage dealers" ON public.dealers FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'sales'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'sales'));

CREATE TRIGGER trg_dealers_updated BEFORE UPDATE ON public.dealers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vendors
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  tax_id TEXT,
  bank_account TEXT,
  payment_terms TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors view" ON public.vendors FOR SELECT TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'finance'));

CREATE POLICY "Vendors manage" ON public.vendors FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'warehouse'));

CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed demo
INSERT INTO public.dealers (code,name,tier,contact,phone,email,credit_limit,status) VALUES
('D-0001','北區精品經銷','gold','王經理','0911-000-001','north@example.com',500000,'active'),
('D-0002','中區商行','silver','林先生','0922-000-002','middle@example.com',200000,'active'),
('D-0003','南區批發','bronze','陳小姐','0933-000-003','south@example.com',80000,'inactive');

INSERT INTO public.vendors (code,name,contact,phone,email,tax_id,payment_terms,status) VALUES
('V-0001','源晶原料供應商','張採購','02-1234-5678','supply@example.com','12345678','月結30天','active'),
('V-0002','晶華包裝','李業務','02-8765-4321','pack@example.com','87654321','月結60天','active');