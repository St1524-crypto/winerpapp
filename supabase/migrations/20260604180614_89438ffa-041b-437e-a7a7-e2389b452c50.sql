-- Fix 1: Remove broad public listing on product-images bucket.
-- Public buckets serve files via direct CDN URLs without needing a SELECT policy on storage.objects.
-- Removing this prevents anonymous clients from listing all objects in the bucket.
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;

-- Fix 2: Lock down login_attempts inserts. All inserts go through the serverFn
-- using supabaseAdmin (service role bypasses RLS), so the "anyone can insert" policy is unnecessary.
DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;
