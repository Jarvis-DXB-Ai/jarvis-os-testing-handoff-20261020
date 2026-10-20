import Sidebar from '@/components/layout/sidebar'
import { ResearchWorkspace } from '@/components/tools/research-workspace'
import { ToolsWorkspaceNav } from '@/components/tools/tools-workspace-nav'
import { loadResearchSnapshot } from '@/lib/jarvis-research-server'

export default async function ResearchPage() {
  const snapshot = await loadResearchSnapshot()
  return <><Sidebar /><ToolsWorkspaceNav active="research" /><ResearchWorkspace initialSnapshot={snapshot} /></>
}
