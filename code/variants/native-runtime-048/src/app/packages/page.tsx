import Sidebar from '@/components/layout/sidebar'
import { PackagesWorkspace } from '@/components/packages/packages-workspace'
import { loadCommercialCatalogSnapshot } from '@/lib/commercial-catalog-server'

export default async function PackagesPage() {
  return <><Sidebar /><PackagesWorkspace initialSnapshot={await loadCommercialCatalogSnapshot()} /></>
}
