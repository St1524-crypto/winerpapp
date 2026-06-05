
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salesperson_name text,
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text;

CREATE OR REPLACE FUNCTION public.sales_orders_set_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
BEGIN
  IF NEW.created_by_id IS NULL AND _uid IS NOT NULL THEN
    NEW.created_by_id := _uid;
  END IF;
  IF NEW.created_by_name IS NULL AND NEW.created_by_id IS NOT NULL THEN
    SELECT COALESCE(p.name, p.email) INTO _name FROM public.profiles p WHERE p.id = NEW.created_by_id;
    NEW.created_by_name := _name;
  END IF;
  IF NEW.salesperson_id IS NOT NULL AND (NEW.salesperson_name IS NULL OR NEW.salesperson_name = '') THEN
    SELECT COALESCE(p.name, p.email) INTO _name FROM public.profiles p WHERE p.id = NEW.salesperson_id;
    NEW.salesperson_name := _name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_orders_set_creator ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_set_creator
BEFORE INSERT OR UPDATE OF salesperson_id ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.sales_orders_set_creator();
