<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Jarvis OS — shared Codex / Claude working agreement

This is the existing Jarvis OS application. Extend its current architecture.

## Before working

1. Read `docs/collaboration/WORKING-AGREEMENT.md` and `docs/collaboration/CURRENT-STATE.md`.
2. Read the task handoff assigned to your application and `docs/handoff/CODEX-BRIEFING.md` for Home/task changes. Historical gap lists may be stale; verify current code and data.
3. Check `pwd`, `git status --short --branch`, and `git worktree list`. Confirm the assigned checkout/branch before editing. Preserve unrelated changes.
4. On this Mac, consult the active coordination ledger at `/ABSOLUTE/TEST/OWNER/MC-STUDIOS/mc-dashboard/docs/collaboration/CURRENT-STATE.md`; branch copies do not update automatically.

## Ownership

- User: product priorities, design acceptance, release approval.
- Claude: presentation, responsive layout, visual interaction polish and visual QA in its assigned worktree.
- Codex: backend, data contracts, permissions, integrations, workflow correctness, integration review and release preparation in its assigned worktree.
- Agree a change of scope through the handoff before crossing ownership boundaries. Both applications can review all source, but must not edit the other application's worktree.
- One agent owns each changed file at a time. API/model contracts, shared layout and package files require an explicit handoff when both tasks need them.

## Product and data rules

- Keep Home layering: page/shared Sidebar → controller → production adapter → presentation-only view. No data fetching, database access, business rules or secrets in the view.
- Preserve the approved Home v5 design and reference assets. Check actual rendered behavior when changing UI.
- Preserve task lifecycle semantics, pointer-first drag collision and the server reread required before task reordering.
- Never invent financial values, probabilities, rewards or client facts. Use honest unknown/not-tracked states. Real client/site/product material is factual truth; visual references establish composition only.
- Scope client operations by validated `client_id` and preserve other tenants. Worktrees do not isolate databases.
- Development defaults to offline fixtures or an isolated test database. Do not copy production secrets into another worktree, trigger paid generation, or change publishing state as part of UI verification.

## Finish and hand off

- Record changed paths, behavior, contracts, validation, known gaps and the next step using `docs/collaboration/HANDOFF-TEMPLATE.md`.
- Distinguish static checks, live reads, tested writes and deployed behavior. A successful build is not a deployment.
- Codex integrates reviewed changes and prepares one release. Commits, merges, pushes, deployment, live provider calls and production data changes require user authorization for that action; honor authorization already given in the session.
- Never reset, clean, stash, discard someone else's changes or prune historical backups as routine cleanup.
- These shared rules supplement the user's current instructions; the user's instructions take precedence.
