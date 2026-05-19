# Seed & RLS Check Scripts

Use these to bring up a fresh Supabase environment with demo accounts/data
and verify that Row-Level Security policies behave correctly.

## Required env

```
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."     # only needed for seed
export SUPABASE_PUBLISHABLE_KEY="..."      # only needed for rls-check
```

In Lovable Cloud, the variables above are auto-injected. You can copy them
from the project's `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
The service role key lives in the Cloud secret store.

## 1. Seed demo data

```
bun scripts/seed.ts
```

Creates / upserts:

- Users (all with password `demo1234`):
  - `admin@demo.local`   → `super_admin`
  - `sales@demo.local`   → `sales`
  - `finance@demo.local` → `finance`
- A demo company `Demo Company 源晶測試`
- All 3 users as `company_members`, each with `current_company_id` set
- Sample categories + 1 customer

Re-runnable: existing rows are reused.

## 2. RLS smoke test

```
bun scripts/rls-check.ts
```

Signs in as each demo user and asserts which tables they can / cannot read.
Exit code is non-zero when any expectation fails — suitable for CI.

## What "good" looks like after a fresh deploy

1. Run migrations (handled automatically by Lovable Cloud).
2. Run `bun scripts/seed.ts`.
3. Visit `/login`, sign in as `admin@demo.local / demo1234`.
4. `/dashboard` loads, `CompanySwitcher` shows the demo company,
   `/admin` sidebar is visible because the `super_admin` role is attached.
5. Run `bun scripts/rls-check.ts` → expect ✅ all checks passed.
