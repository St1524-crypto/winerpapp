-- The 'branding' bucket is intentionally public: it hosts approved company logos
-- displayed via getPublicUrl across the app. Pending/draft branding uploads live
-- in the private 'branding-pending' bucket (see src/lib/branding.functions.ts).
-- The prior policies on 'branding' referenced a 'pending/*' path that is never
-- actually written to this bucket, creating a misleading impression of privacy.
-- Drop those dead branches and scope 'branding' policies strictly to
-- 'companies/*' (public-read approved assets, write/delete gated by company
-- membership).

DROP POLICY IF EXISTS "Branding read scoped" ON storage.objects;
DROP POLICY IF EXISTS "Branding update scoped" ON storage.objects;
DROP POLICY IF EXISTS "Branding delete scoped" ON storage.objects;
DROP POLICY IF EXISTS "Branding write scoped" ON storage.objects;

-- Public read is provided by the bucket's public flag; no SELECT policy needed
-- for anon reads. Keep a permissive SELECT for authenticated tooling parity.
CREATE POLICY "Branding read companies"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = 'companies'
);

CREATE POLICY "Branding write companies"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = 'companies'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND private.is_company_member(
        (NULLIF((storage.foldername(name))[2], ''))::uuid,
        auth.uid()
      )
    )
  )
);

CREATE POLICY "Branding update companies"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = 'companies'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND private.is_company_member(
        (NULLIF((storage.foldername(name))[2], ''))::uuid,
        auth.uid()
      )
    )
  )
);

CREATE POLICY "Branding delete companies"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'branding'
  AND (storage.foldername(name))[1] = 'companies'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND private.is_company_member(
        (NULLIF((storage.foldername(name))[2], ''))::uuid,
        auth.uid()
      )
    )
  )
);