import Sidebar from "@/components/layout/sidebar"
import { OrganisationStructure } from "@/components/agents/organisation-structure"
import { loadOrganisationStructure } from "@/lib/organisation-structure-server"
export const dynamic = "force-dynamic"
export default async function OrganisationStructurePage() {
 const snapshot = await loadOrganisationStructure()
 return <><Sidebar /><OrganisationStructure snapshot={snapshot} /></>
}
