import { ownerForRequest } from "@/lib/owner-request-server";
import { proxyOwnerData } from "@/lib/owner-data-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const owner = await ownerForRequest(request);
  if (owner instanceof Response) return owner;
  const { path } = await context.params;
  return proxyOwnerData(request, path, {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    origin: process.env.JARVIS_RUNTIME_WORKER_ORIGIN || (process.env.JARVIS_ISOLATED_TEST === "1" && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:55421" ? "http://127.0.0.1:3101" : undefined),
  });
}
export { handle as GET, handle as HEAD, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
