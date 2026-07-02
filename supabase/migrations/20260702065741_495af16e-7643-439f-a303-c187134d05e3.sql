CREATE TABLE IF NOT EXISTS public._annual_fee_import (
  member_no text PRIMARY KEY,
  expires_at date NOT NULL
);
GRANT ALL ON public._annual_fee_import TO service_role;
ALTER TABLE public._annual_fee_import ENABLE ROW LEVEL SECURITY;
TRUNCATE public._annual_fee_import;