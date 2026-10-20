'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { ClientBrainV2EditField, ClientBrainV2EditorWorkspace } from '@/lib/client-brain-v2-edit'

export type ClientBrainV2InlineEditor = {
  workspace: ClientBrainV2EditorWorkspace
  field: (id: string) => ClientBrainV2EditField | undefined
  updateField: (field: ClientBrainV2EditField) => void
}

const inlineFocusClass = 'appearance-none rounded-sm !border-0 !bg-transparent shadow-none outline-none transition-colors hover:!bg-white/[0.025] focus:!bg-emerald-300/[0.035] focus:ring-1 focus:ring-inset focus:ring-emerald-300/30 placeholder:text-white/25'

export function InlineText({
  label,
  value,
  onChange,
  placeholder,
  className = 'text-sm leading-6 text-white/56',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.max(element.scrollHeight, 24)}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      aria-label={label}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      className={`-mx-1 block w-[calc(100%+0.5rem)] resize-none overflow-hidden px-1 py-0.5 ${inlineFocusClass} ${className}`}
    />
  )
}

export function InlineSelect({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      className={`min-h-9 max-w-full rounded-full border border-white/12 bg-[#0a100d] px-2.5 py-1 text-[10px] font-semibold text-white/62 outline-none focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-300/10 ${className}`}
    >
      {children}
    </select>
  )
}

export function InlineRemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full text-base text-red-100/45 transition hover:bg-red-300/[0.08] hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300/25 md:opacity-35 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
    >
      ×
    </button>
  )
}

export function InlineAddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 rounded-md px-2 text-xs font-semibold text-emerald-100/52 transition hover:bg-emerald-300/[0.05] hover:text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/20"
    >
      + {label}
    </button>
  )
}

export function InlineList({
  label,
  values,
  onChange,
  emptyPlaceholder,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  emptyPlaceholder?: string
}) {
  const visibleValues = values.length > 0 ? values : ['']
  return (
    <div className="mt-3 space-y-2">
      {visibleValues.map((value, index) => (
        <div key={index} className="group flex items-start gap-1 border-l border-emerald-300/20 pl-3">
          <InlineText
            label={`${label} item ${index + 1}`}
            value={value}
            placeholder={emptyPlaceholder ?? `Add ${label.toLowerCase()}…`}
            onChange={next => onChange(visibleValues.map((item, itemIndex) => itemIndex === index ? next : item))}
          />
          <InlineRemoveButton
            label={`Remove ${label} item ${index + 1}`}
            onClick={() => onChange(visibleValues.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <InlineAddButton label="Add item" onClick={() => onChange([...visibleValues.filter(Boolean), ''])} />
    </div>
  )
}

export default function ClientBrainV2Editor({
  workspace,
  onChange,
  children,
}: {
  workspace: ClientBrainV2EditorWorkspace
  onChange: (workspace: ClientBrainV2EditorWorkspace) => void
  children: (editor: ClientBrainV2InlineEditor) => ReactNode
}) {
  const updateField = (field: ClientBrainV2EditField) => onChange({
    ...workspace,
    fields: workspace.fields.map(item => item.id === field.id ? field : item),
  })

  return children({
    workspace,
    field: id => workspace.fields.find(field => field.id === id),
    updateField,
  })
}
