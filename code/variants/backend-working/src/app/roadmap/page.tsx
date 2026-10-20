import Sidebar from "@/components/layout/sidebar"
import RoadmapWorkspace from "@/components/roadmap/roadmap-workspace"
import { loadRoadmapSnapshot } from "@/lib/roadmap-server"

export default async function RoadmapPage() { const snapshot = await loadRoadmapSnapshot(); return <><Sidebar /><RoadmapWorkspace initialSnapshot={snapshot} /></> }
