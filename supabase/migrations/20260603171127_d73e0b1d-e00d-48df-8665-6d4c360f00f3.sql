UPDATE public.products p
SET status = 'inactive', updated_at = now()
WHERE p.status = 'active'
  AND (p.image IS NULL OR p.image = '')
  AND NOT EXISTS (
    SELECT 1 FROM public.product_images pi
    WHERE pi.product_id = p.id
      AND pi.image_url IS NOT NULL
      AND pi.image_url <> ''
  );