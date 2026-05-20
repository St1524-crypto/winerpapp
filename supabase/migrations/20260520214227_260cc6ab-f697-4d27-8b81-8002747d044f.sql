ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS invoice_title text,
  ADD COLUMN IF NOT EXISTS invoice_title_mode text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS invoice_tax_id_format text NOT NULL DEFAULT 'prefixed',
  ADD COLUMN IF NOT EXISTS invoice_show_tax_id boolean NOT NULL DEFAULT true;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_invoice_title_mode_chk;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_invoice_title_mode_chk
  CHECK (invoice_title_mode IN ('company','custom','buyer'));

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_invoice_tax_id_format_chk;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_invoice_tax_id_format_chk
  CHECK (invoice_tax_id_format IN ('plain','prefixed','bracketed','hidden'));