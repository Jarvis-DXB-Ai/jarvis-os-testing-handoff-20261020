import Sidebar from "@/components/layout/sidebar"

export default function OrganisationStructurePage() {
  return (
    <main className="flex min-h-screen bg-[#020403] text-white">
      <Sidebar />

      <section className="jarvis-dark-shell">
        <div className="jarvis-page">
          <div className="jarvis-hero">
            <p className="jarvis-eyebrow">Structure Workspace</p>
            <h1 className="jarvis-title mt-3">Organisation Structure</h1>
            <p className="jarvis-copy mt-4 max-w-2xl">
              Coming soon. This workspace will map MC Studios and client operating structures, roles, ownership,
              escalation paths, and agent responsibilities.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Departments", "Map internal teams, client departments, and operational ownership."],
              ["Agents", "Connect AI agents to responsibilities, escalation paths, and review loops."],
              ["Workflows", "Describe how work moves between people, agents, approvals, and delivery."],
            ].map(([title, desc]) => (
              <div key={title} className="jarvis-card p-6">
                <span className="jarvis-pill">Coming soon</span>
                <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/44">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
