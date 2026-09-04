---
name: bug-fixer
description: Diagnose and fix bugs in the Win ERP/GooD-go codebase with evidence-based minimal changes. Use for runtime errors, broken flows, regressions, TypeScript errors or incorrect behavior where rewriting whole components or systems would waste tokens and increase regression risk.
---

# Bug Fixer

Read `/PROJECT.md` and inspect only the failing flow and its direct dependencies.

Follow exactly:
1. Reproduce or establish reliable evidence of the failure.
2. Identify the root cause.
3. Locate the smallest affected scope.
4. Apply the smallest safe fix.
5. Test the fix.
6. Verify directly related flows for regression.

Do not rewrite an entire component because one error appears. Reuse existing code/contracts. Do not perform unrelated refactors.

Attempt at most two evidence-based local fixes. If still unresolved, stop guessing and report only:
- Root cause hypothesis
- Evidence
- Files involved
- Recommended deeper investigation