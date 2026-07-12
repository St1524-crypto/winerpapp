
-- Fix 1: Tighten storage.branding_pending_admin_read policy.
-- Drop the cross-company admin read path (owner already has full access
-- via branding_pending_owner_all; super_admin retains global access for
-- support). Prevents any scenario where an admin of a company that
-- shares a member could read that member's pending branding files.
DROP POLICY IF EXISTS "branding_pending_admin_read" ON storage.objects;

CREATE POLICY "branding_pending_admin_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'branding-pending'
  AND (storage.foldername(name))[1] = 'pending'
  AND (storage.foldername(name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Fix 2: Defense-in-depth trigger for vip_upgrade_orders self-insert.
-- The RLS WITH CHECK already forces payment_status='pending', paid_at/
-- applied_at/new_tier/sales_order_id to NULL, but if a future policy
-- change loosens those checks, this trigger still strips any privileged
-- fields a self-inserting member could try to smuggle in.
CREATE OR REPLACE FUNCTION public.vip_upgrade_orders_self_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_staff boolean := false;
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role')
  THEN
    RETURN NEW;
  END IF;

  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  _is_staff :=
    private.has_role(_uid, 'super_admin'::app_role)
    OR private.has_role(_uid, 'admin'::app_role)
    OR private.has_role(_uid, 'finance'::app_role);

  IF _is_staff THEN
    RETURN NEW;
  END IF;

  -- Self-insert path: overwrite any client-supplied privileged fields
  -- with safe defaults regardless of what was submitted.
  IF NEW.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'vip_upgrade_orders_self_insert_user_mismatch'
      USING HINT = 'Members can only create upgrade orders for themselves.';
  END IF;

  NEW.payment_status := 'pending';
  NEW.paid_at        := NULL;
  NEW.applied_at     := NULL;
  NEW.new_tier       := NULL;
  NEW.sales_order_id := NULL;
  NEW.previous_tier  := NULL;
  NEW.bonus_points   := COALESCE(NEW.bonus_points, 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vip_upgrade_orders_self_insert_guard ON public.vip_upgrade_orders;

CREATE TRIGGER vip_upgrade_orders_self_insert_guard
BEFORE INSERT ON public.vip_upgrade_orders
FOR EACH ROW
EXECUTE FUNCTION public.vip_upgrade_orders_self_insert_guard();
