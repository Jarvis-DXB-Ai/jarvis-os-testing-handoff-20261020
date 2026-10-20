# Local setup and tests — instructions, not checks performed here

## 1. Choose one variant

- `backend-working`: fullest unmerged backend/Office development source, including the 106th client-audit registration. It includes dirty work; it is not an accepted production release.
- `public-demo-main120`: frozen lineage of the delivered finger-motion Demo, including its viewer assets. It contains the older application registry and code baseline rather than every later backend change.
- `native-runtime-048`: reviewed-source native audit candidate, with matched external worker/runner and 106-method registry. It does not include an active authorisation, credentials or successful live-run guarantee.
- `ui-working`: separate UI worktree; keep its changes distinct.
- `canonical-main`: older integration checkout, not the latest Office implementation.

Source branch/HEAD and source-manifest pins are in SOURCE-VARIANTS.json. Privacy substitutions mean export hashes differ from those original pins; use the export manifests for the actual files you received.

## 2. Synthetic local Home/app preview

Requirements: Node.js with npm compatible with the snapshot lockfile, Python 3, Docker, and the Supabase CLI. Snapshot package.json records Next 16.2.6 / React 19.2.4; retain the lockfile. The local scripts contain a specific guard for Supabase CLI 2.98.2's port binding behaviour. Use a disposable local machine/workspace and inspect setup scripts first. The exporter installed or ran none of these services.

From `variants/backend-working`:

```sh
npm ci
sh scripts/setup-isolated-home.sh
node scripts/start-isolated-home.mjs
```

The helper requires project_id `jarvis-home-test`, API `http://127.0.0.1:55421`, DB port 55422, and loopback-only Docker bindings. It starts Next on `http://127.0.0.1:3101`. It seeds only the disposable local test DB using scripts/isolated-home-seed.sql and constructs an environment allowlist with AI/social generation and publishing in dry_run mode. It rejects ambient .env files other than .env.example. Do not place your production .env in this workspace.

Visit `/`, `/clients`, and `/office/demo` as supported by the selected snapshot. Source access controls remain intact. Do not set an invented identity header or disable auth to make a page load. Native Office may report unavailable until its separate local prerequisites are deliberately configured.

For the public Demo source, initialize the disposable schema from backend-working first, then stop that Next app and use public-demo-main120's own dependency lockfile and local start helper against the same disposable local DB. Frozen Demo/native source snapshots do not contain the complete migrations tree; it is supplied separately by backend-working. These variant combinations have not been run or certified by this handoff.

## 3. Focused tests available

After installing dependencies in the chosen copy, inspect and run only the tests you need. Two source-defined examples are:

```sh
npm run test:owner-access
node --test scripts/verify-office-demo.test.mjs
```

Owner-access fixtures use generated synthetic keys and no remote services. The Demo test exercises pure scripted Demo logic. Neither is a native workforce acceptance test. TypeScript fixture files that import .js siblings require their original compile harness; running them directly is not promised. Do not run integration, provider, private-runtime, setup/send, migration, live-client or daemon scripts indiscriminately.

An optional local production compilation uses `npm run build`; `npm run start -- --hostname 127.0.0.1 --port 3101` serves its result. Supply only disposable local configuration. These commands were not run on the sanitized export. Dependencies and native modules are not bundled, and a current compiler may surface source/version drift.

## 4. Actual Office agents are separate

A real local test additionally needs Paperclip, an independent company/agent allocation, own authenticated subscription CLIs, fresh own storage roots and task context, the method library, valid tool adapters, fresh budget observations and a narrowly scoped current authority. The copied source is not permission to execute. The original agent IDs are replaced with consistent synthetic IDs and private paths with placeholders, so they must not be used against a live company. Do not copy an original user's account state, production keys or exhausted grants.

Inspect the plan and set your own absolute data/library roots. If testing methodology, stage `office-method-library/<id>` under your sandbox recordsRoot/library/skills and use the sanitized registry's fileHashes. They were recomputed where privacy substitutions changed method bytes. The root original bundle refs remain provenance, not proof that a sanitized adaptation has been native-tested.

No auto-resume, WhatsApp, scheduling, publication, paid fallback or broad external action is included in this handoff. The latest simulated Demo and real Office delivery evidence must be judged separately.
