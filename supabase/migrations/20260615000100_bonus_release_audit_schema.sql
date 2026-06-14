-- Add audit fields for bonus reward release tracking.
-- Idempotent and non-destructive: existing records/status values are left untouched.

ALTER TABLE public.bonus_records
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid,
  ADD COLUMN IF NOT EXISTS release_source text,
  ADD COLUMN IF NOT EXISTS release_attempts integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bonus_records_release_source_check'
      AND conrelid = 'public.bonus_records'::regclass
  ) THEN
    ALTER TABLE public.bonus_records
      ADD CONSTRAINT bonus_records_release_source_check
      CHECK (
        release_source IS NULL
        OR release_source IN ('cron', 'manual', 'retry', 'system')
      );
  END IF;
END $$;
