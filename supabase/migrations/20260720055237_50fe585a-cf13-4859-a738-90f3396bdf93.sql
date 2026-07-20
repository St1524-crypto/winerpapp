-- Restrict anonymous read of participant identities on group_buys
REVOKE SELECT (initiator_id, winner_id) ON public.group_buys FROM anon;

-- Belt-and-suspenders: ensure cost_price/wholesale_price stay hidden from anon/authenticated on products
REVOKE SELECT (cost_price, wholesale_price) ON public.products FROM anon, authenticated;