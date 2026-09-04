# PROJECT

## Project purpose
ERP + B2B/B2C commerce + member/VIP + rewards/bonus + group-buy platform for GooD-go / Win ERP.

## Tech stack
- React 19 + TypeScript
- TanStack Start / Router
- Vite
- Tailwind CSS + Radix UI
- TanStack Query
- Supabase PostgreSQL/Auth/RLS/RPC
- Playwright E2E

## Folder structure
- `src/routes`: file-based pages and API routes
- `src/components`: shared UI and layout components
- `src/hooks`: reusable state/data hooks
- `src/services`: reusable domain services
- `src/types`: shared TypeScript types
- `src/integrations`: external service integrations
- `supabase/migrations`: schema/RLS/RPC migrations
- `e2e`: Playwright tests
- `.agents/skills`: reusable AI development rules

## Routes
Representative route groups:
- public/index/login
- authenticated application routes
- admin login/admin routes
- cooperation application
- group buys
- member/company slug routes
- API routes

Always inspect the exact relevant route before changing behavior. Do not infer route ownership from filename alone.

## User roles
Known role families include member/user, admin/super_admin and business/vendor/dealer-related access. Treat database/RLS definitions as authority before changing permissions.

## Authentication
Supabase Auth is used. Auth-aware UI should reuse existing auth hooks and route guards. Never bypass auth/RLS in frontend code.

## Database overview
Supabase migrations are the schema source of truth. Before any database change inspect current migrations/schema, foreign keys, RLS, auth assumptions, RPCs and permissions. All schema changes must use new migrations. Never expose service-role credentials to frontend code.

## Important business rules
- Preserve working VIP/member/reward/group-buy logic unless the task explicitly targets it.
- UI-only tasks must not modify business logic or schema.
- Frontend-only tasks must not trigger database redesign.
- Prefer existing RPC/service/hook/type contracts.

## Reusable components
Start by checking `src/components`, including existing navigation/layout, admin UI, error/forbidden screens, copy/contact utilities and shared UI primitives before creating a new component.

## Reusable hooks
Start by checking `src/hooks`, especially existing auth, current-company, cart, product, finance, wallet, address, dealer/business and responsive hooks before adding new data/state logic.

## Services
`src/services/finance.service.ts` is an existing service layer. Prefer extending/reusing services instead of placing duplicate domain logic in pages.

## Environment variables
Use `.env.example` as documentation. Never commit new secrets. Production secrets remain outside source control. Validate Supabase URL/key separation and never use service-role keys in browser bundles.

## Integrations
Supabase is core. The project also contains email/webhook/AI-related packages and integration folders; inspect existing integration code before adding another client.

## Deployment
GitHub is the code single source of truth. Keep changes branch-based and independently testable. Existing Vite/TanStack deployment configuration must be reused unless deployment itself is the task.

## Known issues / risks
- Repository currently contains a tracked `.env`; review for secret exposure separately before changing it.
- Large generated `src/routeTree.gen.ts` must not be manually edited.
- Domain logic is split between hooks/services/routes; duplicate logic risk should be checked before adding new helpers.
- Supabase migration history must remain append-only and migration-safe.

## Required AI task flow
1. ANALYZE only directly relevant files. Output: Goal / Affected files / Existing reusable code / Potential risk / Plan.
2. IMPLEMENT minimal diff only; reuse components/hooks/services/types/schema.
3. VERIFY TypeScript/build/lint if configured, routes/imports/console; for Supabase also schema/FK/RLS/Auth/permissions/migration safety.
4. REPORT only Completed / Files changed / Tests / Remaining issues / Recommended next task.

Update this file only when architecture, core routes, roles, integrations, schema boundaries or reusable primitives materially change.