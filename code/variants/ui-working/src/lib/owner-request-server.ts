import "server-only";
import { authorizeOwner } from "@/cloudflare/owner-access";

/** Local fixtures only. Production always verifies the original Access JWT. */
export async function ownerForRequest(request: Request) {
  if (process.env.NODE_ENV === "development"
    && process.env.JARVIS_ISOLATED_TEST === "1"
    && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:55421") {
    return { subject: "isolated-owner", email: "owner@example.invalid" };
  }
  return authorizeOwner(request, {
    JARVIS_ACCESS_TEAM_DOMAIN: process.env.JARVIS_ACCESS_TEAM_DOMAIN || "",
    JARVIS_ACCESS_AUDIENCE: process.env.JARVIS_ACCESS_AUDIENCE || "",
    JARVIS_OWNER_EMAILS: process.env.JARVIS_OWNER_EMAILS || "",
  });
}
