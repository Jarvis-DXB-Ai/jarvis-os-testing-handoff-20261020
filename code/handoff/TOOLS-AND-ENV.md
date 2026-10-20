# Tools and configuration

For a local UI/code review: Node/npm, Python 3, Docker and Supabase CLI. Optional source features use Paperclip and authenticated Codex/Claude subscription CLIs; Cloudflare/Wrangler, GitHub CLI, FFmpeg/ffprobe, Blender and provider integrations are separate opt-in dependencies. Native-tool readiness and permitted task scope must be verified before use. Source definitions do not mean these tools are connected or outputs were produced.

The ordinary .env.example contains only names/empty values. This export supplies no server secret, anon/publishable key, OAuth token, password or encryption key. Local start-isolated-home.mjs obtains disposable local keys from the user's own Supabase CLI and rejects ambient .env files. Other manual environments must use their own keys and isolated endpoints. Server-only keys stay server-only.

Cloudflare JSONC files are sanitized templates: owner emails, Access audience, account IDs, hosted project URLs and machine locations are placeholders. Execution flags are inactive/dry-run where an exported configuration value previously selected live operation. Do not deploy these templates unchanged. No existing hosted auth or private repository was modified.

Runtime metadata (.next, private-release.json), history, node_modules, .env/.dev.vars, auth/browser state, native receipts, policy/grant ledgers, real client uploads and historical reports are excluded. Required app code that *handles* credentials remains included; it contains no copied credential values.
