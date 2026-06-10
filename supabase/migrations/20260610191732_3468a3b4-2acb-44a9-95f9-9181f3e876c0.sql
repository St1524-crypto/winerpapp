-- 1) Revoke sensitive pricing columns from anon
REVOKE SELECT (cost_price, wholesale_price) ON public.products FROM anon;

-- 2) Allow members to read their own reward wallet logs
CREATE POLICY "Members read own reward logs"
ON public.reward_wallet_logs
FOR SELECT
TO authenticated
USING (auth.uid() = member_id);