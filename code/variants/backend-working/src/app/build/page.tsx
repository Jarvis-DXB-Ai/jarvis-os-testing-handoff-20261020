import Sidebar from "@/components/layout/sidebar"
import { BuildRegistryWorkspace } from "@/components/build/build-registry-workspace"
import { loadBuildRegistrySnapshot } from "@/lib/build-registry-server"

export default async function BuildPage() {
  return <><Sidebar /><BuildRegistryWorkspace initialSnapshot={await loadBuildRegistrySnapshot()} /></>
}
