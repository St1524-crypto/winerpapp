CREATE UNIQUE INDEX IF NOT EXISTS companies_tax_id_unique
ON public.companies (tax_id)
WHERE tax_id IS NOT NULL AND tax_id <> '';