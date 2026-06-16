---
name: ChatGPT / Codex / Lovable collaboration task
about: Use this for feature, fix, deploy, and verification tasks
title: "[Collab] "
labels: ["collaboration", "needs-diagnosis"]
assignees: ""
---

## Goal

Describe the feature, bug, deployment, or verification target.

## Scope

- [ ] Diagnosis only
- [ ] Implementation
- [ ] Staging deploy
- [ ] Staging verification
- [ ] Production approval
- [ ] Production publish
- [ ] Production verification

## Context

- Production URL: https://winerp.app
- Lovable project: https://lovable.dev/projects/8759c219-ed53-49ec-b52a-60a002da48ec
- Production Supabase ref: wvhvjdqbrftjggwwetwf
- Staging Supabase ref: phqnldqejtaisjsecesv

## Restrictions

- Do not display secrets.
- Do not put service role keys or server secrets in frontend bundles.
- Do not force push.
- Do not directly operate on production DB.
- Do not stage `.env` or `.env.staging`.
- Verify staging before production.

## Codex Diagnosis

Paste Codex diagnosis here:

- Current state:
- Gaps:
- Risks:
- Minimal safe plan:
- Files to change:
- Migration needed:
- Suggested commits:

## ChatGPT Decision

Paste ChatGPT discussion result here:

- Decision:
- Risks accepted:
- Risks rejected:
- Implementation instructions for Codex:

## Implementation Checklist

- [ ] Codex implemented approved scope only.
- [ ] `npm run build` passed.
- [ ] `dist/client` secret scan passed.
- [ ] Git diff contains only relevant files.
- [ ] Commit created.
- [ ] Commit pushed to GitHub.

## Lovable / Deployment Checklist

- [ ] Staging deployed.
- [ ] Staging deployment id recorded.
- [ ] Staging commit sha verified.
- [ ] Production approval granted.
- [ ] Production published.
- [ ] Production deployment id recorded.
- [ ] Production commit sha verified.

## Verification Result

- Passed:
- Failed:
- Follow-up issues:

