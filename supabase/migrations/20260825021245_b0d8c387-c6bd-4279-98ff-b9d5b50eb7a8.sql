ALTER TABLE public.operation_tasks ADD COLUMN IF NOT EXISTS task_no text;

CREATE OR REPLACE FUNCTION public.generate_operation_task_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text;
  seq int;
BEGIN
  IF NEW.task_no IS NOT NULL AND NEW.task_no <> '' THEN
    RETURN NEW;
  END IF;
  d := to_char((now() AT TIME ZONE 'Asia/Taipei')::date, 'YYYYMMDD');
  SELECT COALESCE(MAX(substring(task_no from 9)::int), 0) + 1
    INTO seq
    FROM public.operation_tasks
   WHERE task_no LIKE d || '%';
  NEW.task_no := d || lpad(seq::text, 2, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_tasks_task_no ON public.operation_tasks;
CREATE TRIGGER trg_ops_tasks_task_no
BEFORE INSERT ON public.operation_tasks
FOR EACH ROW EXECUTE FUNCTION public.generate_operation_task_no();

WITH numbered AS (
  SELECT id,
         to_char((created_at AT TIME ZONE 'Asia/Taipei')::date, 'YYYYMMDD') AS d,
         row_number() OVER (
           PARTITION BY (created_at AT TIME ZONE 'Asia/Taipei')::date
           ORDER BY created_at, id
         ) AS rn
    FROM public.operation_tasks
   WHERE task_no IS NULL
)
UPDATE public.operation_tasks t
   SET task_no = n.d || lpad(n.rn::text, 2, '0')
  FROM numbered n
 WHERE t.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS operation_tasks_task_no_key ON public.operation_tasks (task_no);