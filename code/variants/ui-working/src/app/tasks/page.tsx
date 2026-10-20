import Sidebar from "@/components/layout/sidebar"
import TasksBoard from "@/components/tasks/tasks-board"
import { loadTasksBoardData } from "@/lib/tasks-board-server"

export default async function TasksPage() {
  const data = await loadTasksBoardData()
  return <><Sidebar /><TasksBoard key={data.generatedAt} initialData={data} /></>
}
