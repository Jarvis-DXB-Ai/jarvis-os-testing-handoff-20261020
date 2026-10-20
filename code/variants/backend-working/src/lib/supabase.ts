import { createClient } from '@supabase/supabase-js'
import { privateMediaValues } from '@/lib/private-media'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// The public SDK key grants no database access. Every legacy browser query goes
// through Jarvis's verified owner boundary; server modules use server-only clients.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== new URL(supabaseUrl).origin) throw new Error("Unexpected data service")
    if (typeof window === "undefined") throw new Error("Server queries must use a server-only database client")
    const response = await fetch(`/api/owner-data${url.pathname}${url.search}`, { ...init, credentials: "same-origin" })
    if ((init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "HEAD") return response
    if (!response.headers.get("content-type")?.includes("application/json") || response.status === 204) return response
    const data = privateMediaValues(await response.json(), supabaseUrl)
    const headers = new Headers(response.headers); headers.delete("content-length")
    return new Response(JSON.stringify(data), { status: response.status, headers })
  } },
})
