ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS display_priority integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_priority_active
  ON public.products (status, display_priority DESC, created_at DESC);