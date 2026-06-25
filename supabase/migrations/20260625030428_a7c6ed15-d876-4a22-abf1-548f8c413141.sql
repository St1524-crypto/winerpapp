-- Remove insecure anon SELECT policies that exposed all tokenized quotes/items.
-- Public access by token will be implemented via a server function using a service-role
-- client that validates the supplied token against the row, never via anon RLS.
DROP POLICY IF EXISTS "quotes public read by token" ON public.quotes;
DROP POLICY IF EXISTS "qi public read by token" ON public.quote_items;