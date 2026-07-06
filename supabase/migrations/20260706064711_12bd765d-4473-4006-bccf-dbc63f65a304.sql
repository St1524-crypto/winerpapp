DROP POLICY IF EXISTS "Users insert own cash request" ON public.cash_transactions;
DROP POLICY IF EXISTS "Users insert pending cash request" ON public.cash_transactions;

CREATE POLICY "Users insert pending cash request"
ON public.cash_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  (
    auth.uid() = user_id
    AND tx_type IN ('topup', 'withdraw')
    AND amount > 0
    AND status = 'pending'
    AND balance_after IS NULL
    AND processed_by IS NULL
    AND processed_at IS NULL
    AND reference_id IS NULL
    AND related_point_amount IS NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  )
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'finance'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

CREATE OR REPLACE FUNCTION public.operation_tasks_restrict_assignee_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','private'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_manager boolean := false;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF current_setting('role', true) = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    RETURN NEW;
  END IF;

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required to update operation tasks';
  END IF;

  _is_manager :=
    private.has_role(_uid, 'super_admin'::app_role)
    OR private.has_role(_uid, 'admin'::app_role)
    OR public.get_operation_role(_uid) = 'manager'::public.operation_role;

  IF _is_manager THEN
    RETURN NEW;
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'only the assigned staff member may update this task';
  END IF;

  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.priority IS DISTINCT FROM NEW.priority
     OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.department IS DISTINCT FROM NEW.department
     OR OLD.due_at IS DISTINCT FROM NEW.due_at
     OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
     OR OLD.metadata IS DISTINCT FROM NEW.metadata
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'assigned staff may only update task status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_tasks_restrict_assignee_write ON public.operation_tasks;
CREATE TRIGGER trg_ops_tasks_restrict_assignee_write
  BEFORE UPDATE ON public.operation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.operation_tasks_restrict_assignee_write();

DROP POLICY IF EXISTS "ops_tasks_assignee_update" ON public.operation_tasks;
CREATE POLICY "ops_tasks_assignee_update"
ON public.operation_tasks
FOR UPDATE
TO authenticated
USING (
  assignee_id IS NOT NULL
  AND assignee_id = auth.uid()
  AND public.is_operation_participant(auth.uid())
)
WITH CHECK (
  assignee_id IS NOT NULL
  AND assignee_id = auth.uid()
  AND public.is_operation_participant(auth.uid())
);