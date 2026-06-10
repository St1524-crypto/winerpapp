ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON public.cart_items(product_id);
NOTIFY pgrst, 'reload schema';