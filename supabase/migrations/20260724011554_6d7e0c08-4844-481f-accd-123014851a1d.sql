ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS supervisor_name text;