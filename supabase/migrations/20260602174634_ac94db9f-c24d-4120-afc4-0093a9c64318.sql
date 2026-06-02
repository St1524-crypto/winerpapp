ALTER TABLE public.products ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.products.specs IS '規格選項陣列: [{label, price_delta, stock, sku_suffix}]';