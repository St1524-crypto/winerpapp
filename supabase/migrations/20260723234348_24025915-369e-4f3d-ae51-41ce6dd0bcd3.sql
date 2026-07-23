-- Fix group_buys anon exposure of initiator_id/winner_id via column-level grants
REVOKE SELECT ON public.group_buys FROM anon;
GRANT SELECT (id, company_id, product_id, unit_price, target_count, current_count, status, started_at, expires_at, completed_at, winner_picked_at, created_at, updated_at) ON public.group_buys TO anon;