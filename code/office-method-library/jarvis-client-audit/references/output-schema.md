# Audit output contract

This is the business deliverable schema, not a replacement for Office's native transport or review verdict schemas. Markdown may express the same fields; use JSON only when the task requests structured output. No second machine wrapper inside an artifact unless requested.

| Field | Type / meaning |
| --- | --- |
| auditIdentity | clientId, taskId if supplied, goal/question, evidenceAsOf and scope. Do not invent IDs or claim today's evidence date for old captures. |
| summary | Concise answer, useful strengths, material gaps and next decision. A limited audit must say what it cannot establish. |
| coverage | Selected modules with rationale and state assessed / partial / unassessed; skipped modules with reason. |
| sourceRegister | Array of sourceId/path, location, supplied SHA256/version, capture/decision date, source kind and status/approval scope. Unknown fields explicitly null/unknown. SourceId is task-local; preserve supplied native IDs where present. |
| reuse | Relevant existing artifact + sourceIds, keep / repair / missing / approval-needed and reason. These are recommendations, not mutations or approvals. |
| findings | Array: findingId, module, observation, sourceIds+locations, interpretation, qualitative consequence, confidence(high/medium/low)+reason, recommendation, priority(urgent/next/optional)+reason, accountable existing role, dependencies, limitations. Unsupported hypotheses are labelled, never observations. |
| conflictsAndUnknowns | Array: issue, sources/affected finding IDs, missing evidence or precise unresolved decision, affected work and safe work that can continue. |
| nextActions | Ordered role/action/dependency/acceptance evidence; direction questions limited to material unknowns. No automatic external action or new project scope. |
| revision | Supplied revision/parent if any, corrected finding IDs and changed-source IDs; otherwise initial draft. Review/approval state only as supplied, never minted by the author. |

References must resolve into the assigned packet or granted source register. If a requested module lacks evidence, record partial/unassessed rather than fill it with generic conclusions. Every material source limitation or conflict remains in the artifact. The coordinator binds exact source/method/context/tool/artifact hashes and independent verdicts outside this author-generated business payload.
