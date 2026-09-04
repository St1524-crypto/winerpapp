# AI Development Workflow

## Default rule
Read `PROJECT.md` first. Use the smallest relevant context. Reuse before generating.

## Fixed task flow
### STEP 1 - ANALYZE
Only inspect files directly related to the task. Do not modify code.
Output only:
- Goal
- Affected files
- Existing reusable code
- Potential risk
- Plan

### STEP 2 - IMPLEMENT
- minimal diff
- reuse existing components/hooks/types/services/APIs/schema
- no unrelated refactor
- do not rewrite working code
- UI work must not change unrelated business logic
- frontend work must not redesign database schema

### STEP 3 - VERIFY
Run applicable checks:
- TypeScript check
- build
- lint when configured
- route/import check
- console/runtime errors

Supabase changes additionally require schema, FK, RLS, Auth, permissions and migration-safety review.

### STEP 4 - REPORT
Only report:
- Completed
- Files changed
- Tests
- Remaining issues
- Recommended next task

## Git workflow
GitHub is the single source of truth.
- Feature: `feature/<name>`
- Bug: `fix/<name>`
- One stable independently testable task per commit.
- Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Never mix unrelated modifications in one commit.

## Large-request decomposition
Every large request must become independently implementable/testable/committable tasks.
Example CRM:
1. database schema
2. customer list
3. customer detail
4. lead status
5. notes
6. LINE integration
7. automation

## Lovable responsibilities
Prefer Lovable for scoped UI/page/component/RWD work and small feature wiring that reuses existing contracts. `token-saver` rules are default for every Lovable task.

Do not prioritize Lovable for repository-wide refactors, 10+ file changes, dependency conflicts, complex TypeScript failures, CI/CD, Git history, security audits, complex SQL, migration repair or performance profiling.

## Codex responsibilities
Escalate the above complex/repository-wide work to Codex with:

Codex Task:
Goal:
Relevant files:
Current error:
Expected result:
Constraints:

Codex must still use minimal scope, inspect before edit, preserve working behavior and follow PROJECT.md.

## Stop rules
- Bug fixes: try at most two evidence-based local fixes.
- If unresolved, stop guessing and report Root cause hypothesis / Evidence / Files involved / Recommended deeper investigation.
- Never start the next task automatically.