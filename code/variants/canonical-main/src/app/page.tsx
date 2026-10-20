import Sidebar from "@/components/layout/sidebar"
import HomeDashboard from "@/components/dashboard/home-dashboard"
import { getHomeDashboardData } from "@/lib/home-dashboard-server"

export default async function DashboardPage() {
  const data = await getHomeDashboardData()
  return <><Sidebar /><HomeDashboard initialData={data} /></>
}
