# Operational SQL

SQL files in this directory are executed only through the DB Admin Execution Channel.

## Directories

- `staging/`: SQL that may be executed against the staging Supabase project.
- `production/`: SQL that may be executed against the production Supabase project only after review and explicit approval.

## Naming

Use timestamped, descriptive filenames:

```text
YYYYMMDDHHMM_description.sql
```

Examples:

```text
202606180930_member_storefront_seed_aqtw25f00025.sql
202606181000_bonus_retry_audit_backfill.sql
```

## Production Requirements

Production SQL must include:

- environment header
- purpose
- approval notes
- backup section
- apply section
- verify section
- rollback section

Minimum header:

```sql
-- DB_ADMIN_EXECUTION_CHANNEL
-- ENV: production
-- PURPOSE:
-- OWNER_APPROVAL:
-- CHATGPT_REVIEW:
-- EXPECTED_PROJECT_REF: wvhvjdqbrftjggwwetwf
-- BACKUP_TABLES:
-- ROLLBACK:
```

## Prohibited Content

Do not commit:

- secrets
- service role keys
- database passwords
- raw production personal data dumps
- SQL copied from an unreviewed chat without backup and rollback sections

## Execution

Use the manual GitHub Actions DB workflow. Do not run production SQL directly from local machines unless the owner explicitly approves an emergency path.
