---
name: project-architect
description: Plan architecture and scoped features in the existing Win ERP/GooD-go repository. Use for system design, feature planning, module boundaries, or task decomposition where existing components, hooks, services, types, APIs and database structures should be reused and large rewrites avoided.
---

# Project Architect

Read `/PROJECT.md` first, then inspect only files directly relevant to the request.

- Preserve the existing architecture unless evidence requires a change.
- Search for reusable components, hooks, services, types, APIs and schema before proposing new modules.
- Prefer extension over duplication and editing over rewriting.
- Split large features into independently implementable, testable and committable tasks.
- Keep UI, API/service and database responsibilities separated.
- Do not redesign unrelated areas or perform unsolicited refactors.
- Never modify working functionality merely to make architecture look cleaner.

Before implementation output only: Goal / Affected files / Existing reusable code / Potential risk / Plan.