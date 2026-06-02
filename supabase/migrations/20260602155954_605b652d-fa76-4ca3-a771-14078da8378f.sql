
-- Extend profiles with legacy member-management fields and 安置人 placement
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id_no text,
  ADD COLUMN IF NOT EXISTS placement_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_rank text,
  ADD COLUMN IF NOT EXISTS nation text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS zip_mail text,
  ADD COLUMN IF NOT EXISTS addr_mail text,
  ADD COLUMN IF NOT EXISTS zip_home text,
  ADD COLUMN IF NOT EXISTS addr_home text,
  ADD COLUMN IF NOT EXISTS tel text,
  ADD COLUMN IF NOT EXISTS apply_date date,
  ADD COLUMN IF NOT EXISTS frozen_code text,
  ADD COLUMN IF NOT EXISTS member_status text;

CREATE INDEX IF NOT EXISTS idx_profiles_placement_id ON public.profiles(placement_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);
