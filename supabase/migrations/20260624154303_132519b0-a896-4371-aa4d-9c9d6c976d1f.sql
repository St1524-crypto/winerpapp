-- Operations & AI Admin Assistant Center - Phase 1
-- Enums
DO $$ BEGIN
  CREATE TYPE public.operation_role AS ENUM ('manager','staff','assistant','collaborator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.operation_task_status AS ENUM ('pending','in_progress','submitted','completed','cancelled','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.operation_task_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.operation_attendance_type AS ENUM ('check_in','check_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. operation_participants
CREATE TABLE IF NOT EXISTS public.operation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  op_role public.operation_role NOT NULL DEFAULT 'staff',
  department text,
  is_active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_participants TO authenticated;
GRANT ALL ON public.operation_participants TO service_role;
ALTER TABLE public.operation_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_operation_participant(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.operation_participants WHERE user_id=_user_id AND is_active=true)
$$;

CREATE OR REPLACE FUNCTION public.get_operation_role(_user_id uuid)
RETURNS public.operation_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT op_role FROM public.operation_participants WHERE user_id=_user_id AND is_active=true LIMIT 1
$$;

CREATE POLICY "ops_participants_admin_all" ON public.operation_participants FOR ALL
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ops_participants_self_read" ON public.operation_participants FOR SELECT
  USING (user_id = auth.uid());

-- 2. operation_tasks
CREATE TABLE IF NOT EXISTS public.operation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  title text NOT NULL,
  description text,
  status public.operation_task_status NOT NULL DEFAULT 'pending',
  priority public.operation_task_priority NOT NULL DEFAULT 'normal',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  department text,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_tasks TO authenticated;
GRANT ALL ON public.operation_tasks TO service_role;
ALTER TABLE public.operation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_tasks_admin_all" ON public.operation_tasks FOR ALL
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ops_tasks_manager_all" ON public.operation_tasks FOR ALL
  USING (public.get_operation_role(auth.uid()) = 'manager')
  WITH CHECK (public.get_operation_role(auth.uid()) = 'manager');
CREATE POLICY "ops_tasks_assignee_read" ON public.operation_tasks FOR SELECT
  USING (assignee_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "ops_tasks_assignee_update" ON public.operation_tasks FOR UPDATE
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- 3. operation_task_reports
CREATE TABLE IF NOT EXISTS public.operation_task_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.operation_tasks(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  status_snapshot public.operation_task_status,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_task_reports TO authenticated;
GRANT ALL ON public.operation_task_reports TO service_role;
ALTER TABLE public.operation_task_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_reports_admin_all" ON public.operation_task_reports FOR ALL
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.get_operation_role(auth.uid())='manager')
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.get_operation_role(auth.uid())='manager');
CREATE POLICY "ops_reports_self_read" ON public.operation_task_reports FOR SELECT
  USING (reporter_id = auth.uid());
CREATE POLICY "ops_reports_self_insert" ON public.operation_task_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- 4. operation_attendance_logs
CREATE TABLE IF NOT EXISTS public.operation_attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_type public.operation_attendance_type NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  note text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_attendance_logs TO authenticated;
GRANT ALL ON public.operation_attendance_logs TO service_role;
ALTER TABLE public.operation_attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_att_admin_all" ON public.operation_attendance_logs FOR ALL
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.get_operation_role(auth.uid())='manager')
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ops_att_self_read" ON public.operation_attendance_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "ops_att_self_insert" ON public.operation_attendance_logs FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_operation_participant(auth.uid()));

-- 5. operation_ai_summaries
CREATE TABLE IF NOT EXISTS public.operation_ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  summary_type text NOT NULL DEFAULT 'daily',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_ai_summaries TO authenticated;
GRANT ALL ON public.operation_ai_summaries TO service_role;
ALTER TABLE public.operation_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_ai_admin_all" ON public.operation_ai_summaries FOR ALL
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.get_operation_role(auth.uid())='manager')
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.get_operation_role(auth.uid())='manager');

-- updated_at triggers
CREATE TRIGGER trg_ops_participants_updated BEFORE UPDATE ON public.operation_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ops_tasks_updated BEFORE UPDATE ON public.operation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ops_tasks_assignee ON public.operation_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_status ON public.operation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ops_tasks_due ON public.operation_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_ops_reports_task ON public.operation_task_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_ops_att_user_date ON public.operation_attendance_logs(user_id, work_date);
