-- 1) Server-side revalidation for member-submitted cash transactions
CREATE OR REPLACE FUNCTION public.validate_cash_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'finance'::app_role)
     OR private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cash_transactions: cannot create requests for other users';
  END IF;

  IF NEW.tx_type NOT IN ('topup', 'withdraw') THEN
    RAISE EXCEPTION 'cash_transactions: invalid tx_type';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.amount > 1000000 THEN
    RAISE EXCEPTION 'cash_transactions: amount out of allowed range';
  END IF;

  -- Force workflow-controlled fields regardless of client payload
  NEW.status := 'pending';
  NEW.balance_after := NULL;
  NEW.processed_by := NULL;
  NEW.processed_at := NULL;
  NEW.reference_id := NULL;
  NEW.related_point_amount := NULL;
  NEW.created_by := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cash_transaction_insert ON public.cash_transactions;
CREATE TRIGGER trg_validate_cash_transaction_insert
BEFORE INSERT ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_cash_transaction_insert();

-- 2) Tighten anonymous read of member featured products
DROP POLICY IF EXISTS "Public read featured for published storefronts" ON public.member_featured_products;
CREATE POLICY "Public read featured for published storefronts"
ON public.member_featured_products
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.member_storefront_pages sp
    JOIN public.profiles p ON p.id = member_featured_products.member_id
    WHERE sp.member_id = member_featured_products.member_id
      AND sp.published_at IS NOT NULL
      AND sp.published_at <= now()
      AND (p.frozen_code IS NULL OR p.frozen_code = 'N')
      AND (p.member_status IS NULL OR p.member_status IN ('active', '正式會員'))
  )
);