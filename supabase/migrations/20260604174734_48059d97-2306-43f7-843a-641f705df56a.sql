
-- Add customer_no, shipping_address, source columns and auto-generate customer_no
CREATE SEQUENCE IF NOT EXISTS public.customer_no_seq START 1;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_no text UNIQUE,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS source text;

CREATE OR REPLACE FUNCTION public.generate_customer_no()
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'C' || lpad(nextval('public.customer_no_seq')::text, 6, '0')
$$;

CREATE OR REPLACE FUNCTION public.set_customer_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_no IS NULL OR NEW.customer_no = '' THEN
    NEW.customer_no := public.generate_customer_no();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_no ON public.customers;
CREATE TRIGGER trg_set_customer_no
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_no();

-- Backfill existing rows
UPDATE public.customers
SET customer_no = public.generate_customer_no()
WHERE customer_no IS NULL;
