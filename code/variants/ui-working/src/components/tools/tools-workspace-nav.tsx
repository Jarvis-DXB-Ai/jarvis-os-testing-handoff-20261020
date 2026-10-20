import Link from 'next/link'

const entries = [
  { id: 'registry', href: '/tools', label: 'Tool Registry', compactLabel: undefined },
  { id: 'research', href: '/tools/research', label: 'Research', compactLabel: undefined },
] as const

export function ToolsWorkspaceNav({ active }: { active: typeof entries[number]['id'] }) {
  return <nav aria-label="Tools workspaces" className="border-b border-white/10 bg-[#050806] pl-[72px]"><div className="mx-auto flex w-full max-w-[1640px] gap-1 overflow-x-auto px-3 py-3 sm:px-6 lg:px-8">{entries.map(entry => <Link key={entry.id} href={entry.href} className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition ${active === entry.id ? 'bg-emerald-300 text-[#062016]' : 'text-white/52 hover:bg-white/[0.05] hover:text-white'}`} aria-label={entry.label}>{entry.compactLabel ? <><span className="sm:hidden">{entry.compactLabel}</span><span className="hidden sm:inline">{entry.label}</span></> : entry.label}</Link>)}</div></nav>
}
