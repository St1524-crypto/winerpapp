DROP POLICY IF EXISTS "Product images public read" ON storage.objects;

CREATE POLICY "Product images staff list"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'sales'::app_role)
    OR private.has_role(auth.uid(), 'warehouse'::app_role)
  )
);