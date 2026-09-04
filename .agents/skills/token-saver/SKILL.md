---
name: token-saver
description: Minimize AI credits/tokens for every Lovable development task in the Win ERP/GooD-go repository without sacrificing code quality. Use by default for Lovable coding, debugging and UI tasks to constrain context, prevent regeneration, avoid unrelated scans/refactors and enforce minimal diffs and reuse.
---

# Token Saver

Read `/PROJECT.md` first. Keep context and output as small as correctness allows.

DO:
- Handle one clear feature or bug at a time.
- Analyze only directly relevant files.
- Keep analysis concise.
- Use the smallest sufficient context.
- Reuse existing code, components, hooks, services, schema and types.
- Prefer edit over rewrite and local repair over page/system rebuild.
- Produce minimal diffs.

DON'T:
- Reintroduce the whole project in every task.
- Output long tutorials unless explicitly requested.
- Regenerate working code.
- Scan unrelated repository areas.
- Modify unrelated UI or business logic.
- Perform unsolicited refactors.
- Build several large features in one task.
- Rewrite a system to solve one bug.

Use the fixed Analyze -> Implement -> Verify -> Report workflow from `/docs/AI_DEVELOPMENT_WORKFLOW.md`. Stop after the requested task; never automatically start the recommended next task.