
-- Reaffirm: anon and authenticated cannot SELECT wholesale_price / cost_price on products.
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM anon;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM authenticated;
REVOKE SELECT (wholesale_price, cost_price) ON public.products FROM PUBLIC;

-- Add anonymous SELECT policy for product_images of active products so the
-- public storefront can render galleries on shop.product.$id.tsx.
DROP POLICY IF EXISTS "Anyone view active product images" ON public.product_images;
CREATE POLICY "Anyone view active product images"
ON public.product_images
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.status = 'active'
  )
);

GRANT SELECT ON public.product_images TO anon;
