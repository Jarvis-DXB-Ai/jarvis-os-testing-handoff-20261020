'use client'

/* eslint-disable @next/next/no-img-element -- Signed private-storage brand assets cannot use static Next image optimization. */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

type HeaderData = {
  client: { name: string; industry: string | null; status: string; logoUrl: string | null }
}

const tabs = [
  { id: 'overview', label: 'Overview', href: (id: string) => `/clients/${id}` },
  { id: 'social', label: 'Social', href: (id: string) => `/clients/${id}/social` },
  { id: 'ai-content', label: 'Studio', href: (id: string) => `/clients/${id}/ai-content/studio` },
  { id: 'planner', label: 'Planner', href: (id: string) => `/clients/${id}/planner` },
  { id: 'brain', label: 'Brain', href: (id: string) => `/clients/${id}/brain` },
] as const

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J'
}

function activeTab(pathname: string, clientId: string) {
  const root = `/clients/${clientId}`
  if (pathname === root) return 'overview'
  if (pathname === `${root}/brain`) return 'brain'
  if (pathname === `${root}/planner`) return 'planner'
  if (pathname === `${root}/social`) return 'social'
  if (pathname === `${root}/ai-content` || pathname === `${root}/ai-content/studio`) return 'ai-content'
  return null
}

export default function ClientWorkspaceHeader({ clientId, data, loading = false }: { clientId: string; data?: HeaderData | null; loading?: boolean; activeTab?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const client = data?.client
  const name = client?.name ?? 'Client workspace'
  const status = client?.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : null
  const selected = activeTab(pathname, clientId)
  const onBrain = selected === 'brain'
  return (
    <header className="client-workspace-header border-b border-white/[0.09] pb-5 sm:pb-6">
      <div className="client-workspace-breadcrumb"><Link href="/clients">Clients</Link><span>/</span><span>{loading ? 'Client workspace' : name}</span></div>
      <div className="mt-4 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="client-workspace-logo flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-[#121815]">
            {client?.logoUrl ? <img src={client.logoUrl} alt={`${name} logo`} className="h-full w-full object-contain p-2.5" /> : <span className="text-lg font-semibold tracking-tight text-emerald-100">{initials(name)}</span>}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-[-0.04em] text-white sm:text-[34px]">{loading ? 'Loading workspace…' : name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/48">
              {status && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{status}</span>}
              {status && client?.industry && <span className="text-white/22">·</span>}
              {client?.industry && <span>{client.industry}</span>}
            </p>
          </div>
        </div>
        {onBrain ? <div className="flex flex-wrap items-center gap-3"><Link href={`/clients/${clientId}/brain?section=intelligence&subsection=overview`} className="client-workspace-secondary">Run scanner</Link><Link href={`/clients/${clientId}/brain?section=intelligence&subsection=knowledge_gaps`} className="client-workspace-primary">Review gaps</Link></div> : null}
      </div>
      <nav aria-label="Client workspace" className="mt-6 overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl border border-white/[0.09] bg-white/[0.018] p-1">
          {tabs.map(tab => {
            const href = tab.href(clientId)
            return <Link key={tab.id} href={href} scroll={false} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)} className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${selected === tab.id ? 'bg-white/[0.1] text-white shadow-sm' : 'text-white/42 hover:bg-white/[0.045] hover:text-white/72'}`}>{tab.label}</Link>
          })}
        </div>
      </nav>
    </header>
  )
}
