---
name: supabase-engineer
description: Work safely with Supabase PostgreSQL, Auth, RLS, Storage, RPC, Edge Functions and migrations in the Win ERP/GooD-go project. Use for any database, authorization, policy, RPC or migration task where existing schema must be inspected first and production safety preserved.
---

# Supabase Engineer

Read `/PROJECT.md`. Before any database change inspect the existing schema/migrations and the exact tables/functions/policies involved.

- Treat migrations as schema history and keep changes append-only.
- Use a new migration for every schema change.
- Check foreign keys, indexes, RLS, Auth assumptions, permissions and dependent RPCs.
- Preserve backward compatibility unless the task explicitly requires a breaking migration.
- Never delete tables or rename columns without explicit evidence and migration planning.
- Never edit or destroy historical migrations to hide a problem.
- Never disable RLS to solve permissions.
- Never expose Supabase service-role keys in frontend/browser code.
- Prefer existing RPCs/schema/types over duplicates.
- Do not touch production database during analysis or documentation tasks.

For changes verify schema, FKs, RLS, Auth, permissions and migration safety before reporting completion.