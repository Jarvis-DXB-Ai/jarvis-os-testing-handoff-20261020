// Compatibility boundary for existing owner screens; no RPC/Auth/Admin proxy.
const browserTables = new Set([
  "agent_skills",
  "agent_task_outputs",
  "agent_tasks",
  "agents",
  "ai_model_accessories",
  "ai_model_assets",
  "ai_model_outfits",
  "ai_model_prompts",
  "ai_model_relationships",
  "ai_models",
  "asset_uploads",
  "audit_findings",
  "audit_sessions",
  "brain_update_proposals",
  "brand_playbooks",
  "client_brain",
  "client_knowledge",
  "clients",
  "command_plans",
  "deliverable_activity",
  "deliverable_assets",
  "deliverable_copy",
  "deliverable_revisions",
  "deliverables",
  "execution_queue",
  "execution_reviews",
  "execution_runs",
  "learning_events",
  "model_pricing",
  "monthly_cycles",
  "platform_rules",
  "projects",
  "rejection_patterns",
  "research_library",
  "research_links",
  "sandbox_runs",
  "skill_lessons",
  "successful_outputs",
  "telegram_commands",
  "token_budgets",
  "workspaces",
]);

export async function proxyOwnerData(request: Request, path: string[], config: { url: string; key: string; origin?: string }, send: typeof fetch = fetch) {
  const deny = (status: number, error: string) => Response.json({ message: error }, { status, headers: { "cache-control": "no-store" } });
  const origin = config.origin || new URL(request.url).origin;
  if (request.headers.get("sec-fetch-site") === "cross-site"
    || (request.headers.has("origin") && request.headers.get("origin") !== origin))
    return deny(403, "Cross-origin data requests are not allowed.");
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== origin)
    return deny(403, "Same-origin request required.");
  if (path.some(part => !part || part === "." || part === ".." || /[\\/%?#\x00-\x1f]/.test(part)))
    return deny(400, "Invalid data path.");
  const isTable = path.length === 3 && path[0] === "rest" && path[1] === "v1" && browserTables.has(path[2]);
  const isGuestUpload = path.length >= 5 && path[0] === "storage" && path[1] === "v1"
    && path[2] === "object" && path[3] === "guest-models" && ["POST", "PUT"].includes(request.method);
  if (!isTable && !isGuestUpload) return deny(404, "Data route is unavailable.");
  if (!config.key) return deny(503, "Data access is not configured.");
  let upstream: URL;
  try { upstream = new URL(config.url); } catch { return deny(503, "Data access is not configured."); }
  if (upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash
    || !(upstream.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(upstream.hostname)
      || upstream.origin === "http://127.0.0.1:55421")) return deny(503, "Data access is not configured.");
  upstream.pathname = "/" + path.map(encodeURIComponent).join("/");
  upstream.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of ["accept", "content-type", "prefer", "range", "range-unit", "x-upsert"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name)!);
  headers.set("apikey", config.key);
  headers.set("authorization", `Bearer ${config.key}`);
  if (isTable) { headers.set("accept-profile", "public"); headers.set("content-profile", "public"); }
  try {
    const response = await send(upstream, {
      method: request.method, headers, body: request.body,
      duplex: "half", cache: "no-store", redirect: "manual", signal: request.signal,
    } as RequestInit & { duplex: "half" });
    if (response.status >= 300 && response.status < 400) return deny(502, "Unexpected data redirect.");
    const outputHeaders = new Headers({ "cache-control": "private, no-store" });
    for (const name of ["content-type", "content-range", "range-unit", "preference-applied"])
      if (response.headers.has(name)) outputHeaders.set(name, response.headers.get(name)!);
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch { return deny(502, "Data service is unavailable."); }
}
