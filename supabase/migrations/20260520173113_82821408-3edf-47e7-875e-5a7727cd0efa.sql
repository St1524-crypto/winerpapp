
-- 1) Tighten companies SELECT: non-admins only see their own companies
DROP POLICY IF EXISTS "Auth view active companies" ON public.companies;

-- (Existing "Admin manage companies" + "Members view own companies" already cover admin & member access.)

-- 2) Replace branding storage write policies with company-scoped checks
DROP POLICY IF EXISTS "Admins upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Admins update branding" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete branding" ON storage.objects;

CREATE POLICY "Branding write scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'branding'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND (
        (
          (storage.foldername(name))[1] = 'companies'
          AND private.is_company_member(
            NULLIF((storage.foldername(name))[2], '')::uuid,
            auth.uid()
          )
        )
        OR (
          (storage.foldername(name))[1] = 'pending'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    )
  )
);

CREATE POLICY "Branding update scoped"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'branding'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND (
        (
          (storage.foldername(name))[1] = 'companies'
          AND private.is_company_member(
            NULLIF((storage.foldername(name))[2], '')::uuid,
            auth.uid()
          )
        )
        OR (
          (storage.foldername(name))[1] = 'pending'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    )
  )
);

CREATE POLICY "Branding delete scoped"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'branding'
  AND (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND (
        (
          (storage.foldername(name))[1] = 'companies'
          AND private.is_company_member(
            NULLIF((storage.foldername(name))[2], '')::uuid,
            auth.uid()
          )
        )
        OR (
          (storage.foldername(name))[1] = 'pending'
          AND (storage.foldername(name))[2] = auth.uid()::text
        )
      )
    )
  )
);
