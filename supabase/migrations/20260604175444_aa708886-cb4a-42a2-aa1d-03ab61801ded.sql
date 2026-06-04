
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS order_source text;
