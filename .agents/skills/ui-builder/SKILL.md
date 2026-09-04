---
name: ui-builder
description: Build or modify React UI, pages, components and responsive layouts in the existing Win ERP/GooD-go project. Use for frontend visual work that should reuse current components and remain isolated from unrelated business logic and Supabase schema.
---

# UI Builder

Read `/PROJECT.md` and inspect the target route/component plus directly reused UI only.

- Reuse existing components and UI primitives before creating new ones.
- Work mobile-first and preserve responsive behavior.
- Make local component-level edits; do not rebuild an entire page unless explicitly requested.
- Do not modify unrelated business logic.
- Do not modify Supabase schema for a UI task.
- Reuse existing hooks, types and service/API contracts.
- Avoid duplicate components, helpers and styles.
- Use minimal diff; preserve working behavior outside the requested UI scope.

Verify TypeScript/build/lint when available, imports, route rendering and console errors.