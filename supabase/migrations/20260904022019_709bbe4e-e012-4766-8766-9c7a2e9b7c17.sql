ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pickup_store text;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS pickup_store text;