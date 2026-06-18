# DB Admin Execution Channel

This channel standardizes how winerpapp database changes are prepared, reviewed, executed, verified, and rolled back.

## Scope

Use this process for SQL that changes data outside normal application flows, including operational seeds, one-off repairs, audit corrections, and production-safe backfills.

Do not use this process to bypass application logic for orders, wallets, bonuses, payments, cron jobs, or member permissions unless the change has been explicitly reviewed.

## Environments

- Staging may be executed through the automated DB workflow after the SQL is committed under `ops/sql/staging/`.
- Production requires ChatGPT discussion, explicit owner authorization, SQL review, backup, verification, and rollback instructions before execution.

Project refs:

- Staging: `phqnldqejtaisjsecesv`
- Production: `wvhvjdqbrftjggwwetwf`

## Production Gate

Production execution is allowed only when all of the following are true:

- ChatGPT has reviewed the change intent and risks.
- The owner has explicitly authorized production execution.
- The SQL file lives under `ops/sql/production/`.
- The SQL file includes an `ENV: production` header.
- The SQL file includes backup, apply, verify, and rollback sections.
- The expected production project ref is `wvhvjdqbrftjggwwetwf`.
- The workflow input confirmation exactly matches the required production confirmation phrase.

## Required SQL File Structure

Every production SQL file must include these sections:

```sql
-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE:
-- OWNER_APPROVAL:
-- CHATGPT_REVIEW:
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES:
-- ROLLBACK:

-- SECTION: backup

-- SECTION: apply

-- SECTION: verify

-- SECTION: rollback
```

Rollback SQL should be copy-pasteable and should restore the affected rows to the backup values created by the backup section.

## Safety Rules

- Never store secrets in SQL files, docs, commits, or frontend bundles.
- Never commit `.env`, `.env.local`, `.env.staging`, or copied database keys.
- Never force push DB workflow changes.
- Never execute production SQL from `ops/sql/staging/`.
- Never execute SQL that has not been committed and reviewed.
- Never run broad destructive SQL in production.

Blocked production patterns include:

- `drop database`
- `truncate`
- `delete from` without a `where`
- `update` without a `where`, unless the SQL file documents why it is safe
- changing `auth.users` directly unless explicitly approved

## Operational Flow

1. Draft SQL under `ops/sql/staging/` or `ops/sql/production/`.
2. Include backup, apply, verify, and rollback sections for production.
3. Commit the SQL file.
4. Run staging first when the change can be staged.
5. For production, ask ChatGPT to review the exact SQL and risk.
6. Owner explicitly approves production.
7. Run the manual GitHub Actions workflow.
8. Review workflow logs for backup and verification output.
9. If verification fails, execute rollback or stop and investigate.

## GitHub Secrets

The workflow should use GitHub Actions secrets, not local files:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_STAGING_PROJECT_REF`
- `SUPABASE_PRODUCTION_PROJECT_REF`
- `SUPABASE_STAGING_DATABASE_URL`
- `SUPABASE_PRODUCTION_DATABASE_URL`

The production project ref secret must resolve to `wvhvjdqbrftjggwwetwf`.

Use Supabase pooler database URLs for `SUPABASE_STAGING_DATABASE_URL` and
`SUPABASE_PRODUCTION_DATABASE_URL`. Do not use the direct database host format
`db.<project-ref>.supabase.co:5432`; GitHub-hosted runners may fail to reach it
and the workflow blocks that host for execution.

Expected pooler URL shape:

```text
postgresql://postgres.<project-ref>:<db-password>@<pooler-host>:6543/postgres?sslmode=require
```

Use the session pooler URL if Supabase provides both session and transaction
pooler options for the project. Some Supabase pooler URLs may not include the
project ref in the URL text; the workflow validates that the URL is a PostgreSQL
URL, does not use the direct `db.<project-ref>.supabase.co:5432` host, and uses a
`pooler.supabase.com` host.

## Rollback Expectations

Production SQL should create a timestamped backup table or backup rows in a namespaced operational table before applying changes. The rollback section must refer to that backup and be executable without guessing.

For one-row or small operational changes, a temporary backup table named with the SQL task id is acceptable, for example:

```sql
create table if not exists public.ops_backup_20260618_member_storefront as
select *
from public.profiles
where member_no = 'AQTW25F00025';
```

For larger changes, prefer a dedicated audit or backup table with a task id, created_at, table_name, primary_key, and row_data JSONB.
