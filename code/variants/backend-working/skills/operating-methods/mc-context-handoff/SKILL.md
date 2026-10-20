---
name: mc-context-handoff
description: Prepare durable context for resuming a long task or moving between Codex and Claude. Use at a session boundary, explicit handoff, meaningful checkpoint or demonstrated context conflict; not routine short replies.
---

# Durable context handoff

Use only accessible conversation, files and saved receipts. Missing history stays missing. Save a compact task-scoped checkpoint through an available, authorised route; otherwise return it for the coordinator to persist. Office workers use their current grant and output schema rather than writing arbitrary files or creating chats.

Include the minimum needed to resume:
- Exact goal, client/entity, deliverables, success conditions and current scope.
- Completed artifacts and evidence versus drafts, planned steps, failed work and unresolved execution. Include exact paths, IDs, versions/hashes where needed; an approved decision is distinct from an agent recommendation.
- Latest owner decisions and necessary exact wording, quantities, units, dates and brand/source locks. Preserve rejected approaches and reasons that affect the next choice.
- Relevant role skills and approved lessons; outstanding questions; known external-action permissions and tool limitations.
- One concrete next action and dependencies. For code include checkout, branch, changed files, verification actually run and unfinished work. For media include source roles, editable masters, exports and review state.

Before resuming, compare the handoff to current canonical files and actual task/run state. Resolve contradictions explicitly; do not repeat completed work or an uncertain external action. A summary does not transfer attachments, create access, restore unavailable history or carry another provider’s conversation automatically.

Use observable milestones and context contradictions as cues to checkpoint. A missing marker word is only an instruction-following clue; never present a canary as a context/quota meter. Do not add response suffixes, global instructions, profile changes, automatic chat switching or model settings unless the owner asks. Omit credentials, unrelated client material and unnecessary personal data.

[Source review and adaptation](references/source-review.md) records the public guidance and its limits.
