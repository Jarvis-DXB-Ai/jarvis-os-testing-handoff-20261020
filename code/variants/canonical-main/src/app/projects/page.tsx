import Sidebar from "@/components/layout/sidebar"
import { supabase } from "@/lib/supabase"

export default async function ProjectsPage() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })

  return (
    <main className="flex min-h-screen bg-black text-gray-900">
      <Sidebar />

      <section className="flex-1 p-10">
        <p className="mb-3 text-sm text-gray-500">Project Database</p>
        <h1 className="text-5xl font-bold tracking-tight">Projects</h1>
        <p className="mt-4 max-w-2xl text-gray-400">
          Central production hub for campaigns, shoots, AI workflows, and client deliverables.
        </p>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          {error ? (
            <p className="text-red-400">{error.message}</p>
          ) : projects && projects.length > 0 ? (
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="rounded-xl border border-gray-200 bg-black p-5">
                  <h3 className="text-lg font-semibold">{project.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {project.type || "No project type set"}
                  </p>
                  <p className="mt-3 text-sm text-gray-400">
                    Status: {project.status}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No projects added yet.</p>
          )}
        </div>
      </section>
    </main>
  )
}
