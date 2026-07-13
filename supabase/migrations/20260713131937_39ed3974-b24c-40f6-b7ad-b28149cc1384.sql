
-- Harden branding-pending storage policy: require storage.objects.owner = auth.uid()
DROP POLICY IF EXISTS "branding_pending_owner_all" ON storage.objects;
CREATE POLICY "branding_pending_owner_all"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'branding-pending'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] = 'pending'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'branding-pending'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1] = 'pending'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Enforce replied_by = auth.uid() on shop_content_questions when set by admins
CREATE OR REPLACE FUNCTION public.enforce_shop_content_questions_replied_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.replied_by IS DISTINCT FROM COALESCE(OLD.replied_by, NULL) THEN
    IF NEW.replied_by IS NOT NULL AND NEW.replied_by <> auth.uid() THEN
      NEW.replied_by := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_content_questions_replied_by ON public.shop_content_questions;
CREATE TRIGGER trg_shop_content_questions_replied_by
BEFORE INSERT OR UPDATE ON public.shop_content_questions
FOR EACH ROW EXECUTE FUNCTION public.enforce_shop_content_questions_replied_by();
