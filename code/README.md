# Jarvis OS / The Office — public testing source handoff

This is a sanitized working-source export for independent testing. It is not the private repository or its Git history, a merged release, a hosted service, or a claim that autonomous client delivery works.

Start with `variants/backend-working` for the fullest development source and `variants/public-demo-main120` for the exact source lineage of the latest delivered 3D Demo. Those are different variants. Do not merge them automatically. `variants/native-runtime-048` is the matched native audit candidate; `canonical-main` and `ui-working` retain the other worktrees. All application/Office source and generic runtime helpers are present, subject to recorded privacy exclusions. Original files were never changed.

The export includes 106 installed method folders under `office-method-library/`, with SKILL.md files, explicit references, role procedures and available licences/notices. The three worktrees and two frozen sources are kept separately. See `handoff/SOURCE-VARIANTS.json`, `SOURCE-FILES.json`, `EXCLUSIONS.json`, `REDACTIONS.json` and `SHA256SUMS` for boundaries and hashes.

## Begin safely

Read `handoff/TEST-SETUP.md` and `handoff/TOOLS-AND-ENV.md`. Use your own isolated local database and subscription/tool accounts. No production key, user login, DB dump, client upload, active private grant, native receipt or account state is included. Contact values and IDs were anonymized, machine paths and production endpoints are placeholders, and configuration examples keep execution inactive/dry-run. Historical SQL row inserts/backfills were removed while schema and function definitions remain.

No install, build, app startup, database command, native workflow or deployment was run against this exported copy. Syntax, typing, behavioural compatibility and a clean rebuild after sanitization remain to be verified. There is no access bypass: any hosted app link retains its existing owner-controlled access until its operator explicitly changes it.

## Scope and rights

The latest Demo's exported 3D models, textures and UI assets are included for the viewer; Blender editable masters are not. Public visibility is not a universal third-party redistribution licence. Retained MIT/Apache notices and attributed internal adaptations remain separate; see `handoff/LICENSING-AND-LIMITS.md`. Do not silently relicense the whole collection.


## Cast asset attribution clarification

The three exact cast GLBs are included after an independent positive match of all66characters and507reachable meshes per export to the builder and cast sheet. Downloaded asset572 hair_medium was not selected. Its conflicting local licence record is retained as downloaded/not-used provenance, not a claim that it is CC-BY or part of the cast. See handoff/CAST-USAGE-PROVENANCE.json. The asset572 download itself is not included. This is not a blanket licence certification.
