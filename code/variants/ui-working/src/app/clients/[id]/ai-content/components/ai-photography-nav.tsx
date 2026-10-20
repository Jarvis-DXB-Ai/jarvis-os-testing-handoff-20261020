"use client"

import Link from "next/link"

export type AiPhotographyNavSection =
  | "lifestyle"
  | "product"
  | "venue"
  | "studio"
  | "reference_rebuild"
  | "pinterest"
  | "models"

export type AiPhotographyWorkflowSection = Exclude<AiPhotographyNavSection, "models" | "pinterest">

export const AI_PHOTOGRAPHY_NAV_ITEMS: Array<{
  id: AiPhotographyNavSection
  label: string
}> = [
  { id: "lifestyle", label: "Lifestyle Campaigns" },
  { id: "product", label: "Product Photography" },
  { id: "venue", label: "Venue Photography" },
  { id: "studio", label: "Studio Shots" },
  { id: "reference_rebuild", label: "Reference Rebuild" },
  { id: "models", label: "Models" },
]

const workflowSections = new Set<AiPhotographyWorkflowSection>([
  "lifestyle",
  "product",
  "venue",
  "studio",
  "reference_rebuild",
])

export function isAiPhotographyWorkspace(section: string | null): section is AiPhotographyWorkflowSection {
  return Boolean(section && workflowSections.has(section as AiPhotographyWorkflowSection))
}

function navItemClass(active: boolean) {
  return `rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-emerald-400 text-black shadow-[0_0_24px_rgba(52,211,153,0.20)]"
      : "text-zinc-400 hover:text-emerald-100"
  }`
}

type AiPhotographyNavProps = {
  clientId: string
  active: AiPhotographyNavSection
  onWorkspaceSelect?: (section: AiPhotographyWorkflowSection) => void
}

export function AiPhotographyNav({ clientId, active, onWorkspaceSelect }: AiPhotographyNavProps) {
  return (
    <nav className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-1">
      {AI_PHOTOGRAPHY_NAV_ITEMS.map(item => {
        const selected = active === item.id

        if (item.id === "models") {
          return (
            <Link key={item.id} href={`/clients/${clientId}/ai-content/models`} className={navItemClass(selected)}>
              {item.label}
            </Link>
          )
        }

        if (onWorkspaceSelect) {
          const workspaceId = item.id as AiPhotographyWorkflowSection
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onWorkspaceSelect(workspaceId)}
              className={navItemClass(selected)}
            >
              {item.label}
            </button>
          )
        }

        return (
          <Link key={item.id} href={`/clients/${clientId}/ai-content?section=${item.id}`} className={navItemClass(selected)}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
