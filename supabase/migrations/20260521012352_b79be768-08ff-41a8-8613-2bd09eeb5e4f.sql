
-- threads
CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '新對話',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_threads_user ON public.support_threads(user_id, updated_at DESC);
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manage own threads" ON public.support_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins view all threads" ON public.support_threads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  );

-- messages
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_thread ON public.support_messages(thread_id, created_at);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manage own messages" ON public.support_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins view all messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  );

-- checkins
CREATE TABLE public.support_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, checkin_date)
);
ALTER TABLE public.support_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manage own checkins" ON public.support_checkins
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins view checkins" ON public.support_checkins
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
  );

-- announcements
CREATE TABLE public.support_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_announcements_active ON public.support_announcements(is_active, created_at DESC);
ALTER TABLE public.support_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read active announcements" ON public.support_announcements
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins manage announcements" ON public.support_announcements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_support_threads_touch BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_support_announcements_touch BEFORE UPDATE ON public.support_announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
