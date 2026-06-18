DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;

CREATE POLICY "Anon can insert anonymous login attempts"
ON public.login_attempts
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

CREATE POLICY "Users can insert own login attempts"
ON public.login_attempts
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());