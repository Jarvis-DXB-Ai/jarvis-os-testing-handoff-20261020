# Working together on Jarvis OS

Both applications contribute to the GitHub repository `Jarvis-DXB-Ai/mc-dashboard`. The canonical checkout is `/ABSOLUTE/TEST/OWNER/MC-STUDIOS/mc-dashboard`. The older `Jarvis-OS-Claude` remote is historical, not a second product source.

## Workspaces

| Role | Directory | Branch |
| --- | --- | --- |
| Integration / shared ledger | `/ABSOLUTE/TEST/OWNER/MC-STUDIOS/mc-dashboard` | `main` |
| Codex backend | `/ABSOLUTE/TEST/OWNER/MC-STUDIOS/mc-dashboard-codex` | `codex/access-control` |
| Claude UI review | `/ABSOLUTE/TEST/OWNER/MC-STUDIOS/mc-dashboard-claude` | `codex/ui-review` |

The two worktrees start at the same reviewed commit and share Git history. Each has its own files and index. Changes are not automatically exchanged. A branch name prefix is a naming convention; task ownership is the table above.

Do not switch branches, edit files or start a build in the other application's checkout. Use separate local ports when running servers: Codex 3101, Claude 3102. A preview should bind to loopback unless broader exposure is explicitly intended.

## Feature flow

1. User defines the outcome and acceptance criteria.
2. Codex records the data and action contract, including validation, permissions and failure states.
3. Claude implements the approved interface using the existing model/actions. Visual-only changes do not alter server behavior.
4. Each application completes its scoped handoff with evidence. A dependency on another owner's file becomes a handoff request.
5. Codex reviews and combines the changes when authorized, tests the complete workflow and verifies that the approved design remains intact.
6. User reviews the concrete result and authorizes the release. Codex handles the release and verifies the active version and behavior.

## Shared context

`AGENTS.md` is the shared rule entrypoint. `CLAUDE.md` imports it. The canonical `docs/collaboration/CURRENT-STATE.md` is the active ledger on this Mac; copies in worktrees are snapshots. Read the canonical ledger at the beginning of a session. Each application writes its own assigned handoff, and Codex updates the shared ledger after reconciliation. Do not maintain contradictory project instructions in separate repositories.

Use the handoff template for each new feature. Include the base commit, exact working folder, branch, file ownership and evidence. Chat histories are useful background but are not automatically shared between applications.

## Data and credentials

Separate worktrees do not create separate Supabase projects, provider accounts or Cloudflare Workers. No production `.env` or `.dev.vars` is copied during this setup. Read-only production inspection is distinct from mutation testing. UI reviews can use the approved offline visual reference; actual mutation tests need isolated fixtures/data. If environment setup is missing, report it rather than silently borrowing production credentials.

## Integration and recovery

Keep implementation off `main`. Initial shared documentation is uncommitted in the canonical checkout and mirrored into both worktrees so both apps can read it immediately. This is a one-time bootstrap copy, not a synchronization service. Once the user authorizes committing it, commit the shared documents once, then integrate that commit into both branches after preserving/reconciling their work. Do not overwrite edited branch documents with a fresh copy.

Before integration, inspect both diffs and current Git status. Retain the existing pre-v5 backup. Do not reset, clean, stash, overwrite, commit, merge, push or deploy beyond the user's authorization. After each approved integration, update the baseline, deployment proof and next task in CURRENT-STATE.
