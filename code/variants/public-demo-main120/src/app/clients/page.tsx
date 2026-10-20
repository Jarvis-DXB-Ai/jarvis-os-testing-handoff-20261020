import ClientIndex from "@/components/clients/client-index"
import Sidebar from "@/components/layout/sidebar"
import { loadClientIndexData } from "@/lib/client-index-server"

export default async function ClientsPage() {
  return <><Sidebar /><ClientIndex initialData={await loadClientIndexData()} /></>
}
