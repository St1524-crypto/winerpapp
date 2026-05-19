-- =========================================
-- user_2fa: TOTP-based two-factor settings
-- =========================================
CREATE TABLE public.user_2fa (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  backup_codes text[] NOT NULL DEFAULT '{}',
  enrolled_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own 2fa"
  ON public.user_2fa FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_user_2fa_updated
  BEFORE UPDATE ON public.user_2fa
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- user_sessions: tracked active sessions
-- =========================================
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_token_hash text NOT NULL,
  ip_address text,
  user_agent text,
  device_label text,
  mfa_verified_at timestamptz,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON public.user_sessions(session_token_hash);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(user_id, revoked_at);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users update own sessions"
  ON public.user_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admin delete sessions"
  ON public.user_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

-- INSERT only via server (service role) — no INSERT policy

-- =========================================
-- login_attempts: audit trail for sign-ins
-- =========================================
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  user_id uuid,
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT false,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_user ON public.login_attempts(user_id);
CREATE INDEX idx_login_attempts_email ON public.login_attempts(email);
CREATE INDEX idx_login_attempts_created ON public.login_attempts(created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own login attempts"
  ON public.login_attempts FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- INSERT only via server (service role) — no INSERT policy