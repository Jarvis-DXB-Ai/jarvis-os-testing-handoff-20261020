import { headers } from "next/headers"
import { ownerForRequest } from "@/lib/owner-request-server"
import Sidebar from "@/components/layout/sidebar"
import HomeDashboard from "@/components/dashboard/home-dashboard"
import { getHomeDashboardData } from "@/lib/home-dashboard-server"
import { Suspense } from "react"

async function DashboardContent() {
  const owner = await ownerForRequest(new Request("http://jarvis-internal/", { headers: await headers() }))
  if (owner instanceof Response) return <main className="px-6 pt-20"><p role="alert">Owner sign-in is required or not yet configured.</p></main>
  const data = await getHomeDashboardData(owner.subject)
  return <HomeDashboard initialData={data} />
}

export default function DashboardPage() {
  return <><Sidebar /><Suspense fallback={
    <main className="px-6 pb-8 pt-20 md:pt-8" aria-busy="true">
      <p role="status" className="text-sm text-white/60">Loading dashboard…</p>
      <div aria-hidden="true" className="mt-6 h-40 rounded-2xl border border-white/10 bg-white/[.03]" />
    </main>
  }><DashboardContent /></Suspense></>
}
