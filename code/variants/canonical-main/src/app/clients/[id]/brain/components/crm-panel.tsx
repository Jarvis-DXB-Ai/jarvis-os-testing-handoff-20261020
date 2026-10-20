'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CRM_SOURCE_OPTIONS,
  EMPTY_CRM_SUMMARY,
  crmSourceLabel,
  type CrmContact,
  type CrmContactFilter,
  type CrmContactInput,
  type CrmSummary,
} from '@/lib/crm'

export type CrmWorkspaceView = 'all_guests' | 'segments' | 'data_quality' | 'integrations'

type ContactDraft = CrmContactInput & { tagsText: string }

const EMPTY_DRAFT: ContactDraft = {
  first_name: '',
  last_name: '',
  display_name: '',
  email: '',
  phone: '',
  phone_country_code: '',
  company: '',
  job_title: '',
  date_of_birth: '',
  nationality: '',
  preferred_language: '',
  notes: '',
  source: 'manual',
  status: 'active',
  tags: [],
  tagsText: '',
}

const FILTER_OPTIONS: Array<{ value: CrmContactFilter; label: string }> = [
  { value: 'all', label: 'All Guests' },
  { value: 'complete', label: 'Complete Profiles' },
  { value: 'missing_email', label: 'Missing Email' },
  { value: 'missing_phone', label: 'Missing Phone' },
  { value: 'recent', label: 'Recently Added' },
]

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return 'Not provided'
  return new Intl.DateTimeFormat('en-AE', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }
    : { dateStyle: 'medium', timeZone: 'Asia/Dubai' }).format(new Date(value))
}

function contactToDraft(contact: CrmContact): ContactDraft {
  return {
    first_name: contact.first_name ?? '',
    last_name: contact.last_name ?? '',
    display_name: contact.display_name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    phone_country_code: contact.phone_country_code ?? '',
    company: contact.company ?? '',
    job_title: contact.job_title ?? '',
    date_of_birth: contact.date_of_birth ?? '',
    nationality: contact.nationality ?? '',
    preferred_language: contact.preferred_language ?? '',
    notes: contact.notes ?? '',
    source: contact.source,
    status: contact.status,
    tags: contact.tags,
    tagsText: contact.tags.join(', '),
  }
}

function inputFromDraft(draft: ContactDraft): CrmContactInput {
  return {
    first_name: draft.first_name,
    last_name: draft.last_name,
    display_name: draft.display_name,
    email: draft.email,
    phone: draft.phone,
    phone_country_code: draft.phone_country_code,
    company: draft.company,
    job_title: draft.job_title,
    date_of_birth: draft.date_of_birth,
    nationality: draft.nationality,
    preferred_language: draft.preferred_language,
    notes: draft.notes,
    source: draft.source,
    status: draft.status,
    tags: draft.tagsText.split(',').map(tag => tag.trim()).filter(Boolean),
  }
}

function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'info' }) {
  const colors = tone === 'good'
    ? 'border-emerald-300/20 bg-emerald-300/[0.09] text-emerald-100'
    : tone === 'warn'
      ? 'border-amber-300/20 bg-amber-300/[0.09] text-amber-100'
      : tone === 'info'
        ? 'border-blue-300/20 bg-blue-300/[0.09] text-blue-100'
        : 'border-white/10 bg-white/[0.045] text-white/48'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors}`}>{children}</span>
}

function SummaryCards({ summary }: { summary: CrmSummary }) {
  const cards = [
    ['Total Guests', summary.totalGuests],
    ['Guests with Email', summary.guestsWithEmail],
    ['Guests with Phone', summary.guestsWithPhone],
    ['Missing Key Information', summary.incompleteProfiles],
  ] as const
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/35">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1.5 block text-[11px] font-semibold text-white/45">{label}</span>
      {children}
    </label>
  )
}

const INPUT_CLASS = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/24 focus:border-emerald-300/35'

function ContactFormModal({
  contact,
  onClose,
  onSaved,
  clientId,
}: {
  contact: CrmContact | null
  onClose: () => void
  onSaved: (contact: CrmContact) => void
  clientId: string
}) {
  const [draft, setDraft] = useState<ContactDraft>(() => contact ? contactToDraft(contact) : { ...EMPTY_DRAFT })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicateMatches, setDuplicateMatches] = useState<Array<{ id: string; display_name: string; matched_on: string[] }>>([])

  function update<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }))
    setDuplicateMatches([])
    setError('')
  }

  async function save(allowDuplicate = false) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(contact
        ? `/api/clients/${clientId}/crm/contacts/${contact.id}`
        : `/api/clients/${clientId}/crm/contacts`, {
        method: contact ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...inputFromDraft(draft), allow_duplicate: allowDuplicate }),
      })
      const payload = await response.json()
      if (response.status === 409 && payload.duplicateWarning) {
        setDuplicateMatches(payload.matches ?? [])
        setError(payload.error)
        return
      }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to save guest.')
      onSaved(payload.contact as CrmContact)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save guest.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={contact ? 'Edit guest' : 'Add guest'}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-white/12 bg-[#101515] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#101515]/95 px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/55">CRM</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{contact ? 'Edit Guest' : 'Add Guest'}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-white/10 text-lg text-white/55 hover:bg-white/[0.06]" aria-label="Close">×</button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="First name">
            <input className={INPUT_CLASS} value={draft.first_name ?? ''} onChange={event => update('first_name', event.target.value)} autoFocus />
          </Field>
          <Field label="Last name">
            <input className={INPUT_CLASS} value={draft.last_name ?? ''} onChange={event => update('last_name', event.target.value)} />
          </Field>
          <Field label="Display name" wide>
            <input className={INPUT_CLASS} value={draft.display_name ?? ''} onChange={event => update('display_name', event.target.value)} placeholder="Required when first name is empty" />
          </Field>
          <Field label="Phone">
            <input className={INPUT_CLASS} value={draft.phone ?? ''} onChange={event => update('phone', event.target.value)} placeholder="+971..." inputMode="tel" />
          </Field>
          <Field label="Email">
            <input className={INPUT_CLASS} value={draft.email ?? ''} onChange={event => update('email', event.target.value)} placeholder="owner@example.invalid" type="email" />
          </Field>
          <Field label="Company">
            <input className={INPUT_CLASS} value={draft.company ?? ''} onChange={event => update('company', event.target.value)} />
          </Field>
          <Field label="Job title">
            <input className={INPUT_CLASS} value={draft.job_title ?? ''} onChange={event => update('job_title', event.target.value)} />
          </Field>
          <Field label="Date of birth">
            <input className={INPUT_CLASS} value={draft.date_of_birth ?? ''} onChange={event => update('date_of_birth', event.target.value)} type="date" />
          </Field>
          <Field label="Nationality">
            <input className={INPUT_CLASS} value={draft.nationality ?? ''} onChange={event => update('nationality', event.target.value)} />
          </Field>
          <Field label="Preferred language">
            <input className={INPUT_CLASS} value={draft.preferred_language ?? ''} onChange={event => update('preferred_language', event.target.value)} />
          </Field>
          <Field label="Source">
            <select className={INPUT_CLASS} value={draft.source} onChange={event => update('source', event.target.value as ContactDraft['source'])}>
              {CRM_SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={INPUT_CLASS} value={draft.status} onChange={event => update('status', event.target.value as ContactDraft['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Tags" wide>
            <input className={INPUT_CLASS} value={draft.tagsText} onChange={event => update('tagsText', event.target.value)} placeholder="Regular, VIP, Business Lunch" />
          </Field>
          <Field label="Notes" wide>
            <textarea className={`${INPUT_CLASS} min-h-28 resize-y`} value={draft.notes ?? ''} onChange={event => update('notes', event.target.value)} />
          </Field>
        </div>

        {error && (
          <div className="mx-5 mb-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm text-amber-100">
            <p>{error}</p>
            {duplicateMatches.length > 0 && (
              <div className="mt-3 space-y-2">
                {duplicateMatches.map(match => (
                  <p key={match.id} className="text-xs text-amber-100/70">{match.display_name} · matched on {match.matched_on.join(', ')}</p>
                ))}
                <button type="button" onClick={() => save(true)} disabled={saving} className="mt-2 rounded-lg border border-amber-200/30 px-3 py-2 text-xs font-semibold hover:bg-amber-200/10">
                  Save as separate guest
                </button>
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-white/10 bg-[#101515]/95 px-5 py-4 backdrop-blur-xl">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/55 hover:bg-white/[0.05]">Cancel</button>
          <button type="button" onClick={() => save(false)} disabled={saving} className="jarvis-button px-5 py-2.5 text-sm disabled:opacity-45">{saving ? 'Saving...' : 'Save Guest'}</button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid gap-1 border-b border-white/[0.07] py-3 last:border-0 sm:grid-cols-[150px_1fr] sm:gap-4">
      <p className="text-xs font-semibold text-white/34">{label}</p>
      <div className="text-sm text-white/70">{value}</div>
    </div>
  )
}

function ContactProfileDrawer({ contact, onClose, onEdit }: { contact: CrmContact; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Guest profile">
      <button type="button" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" aria-label="Close guest profile" />
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0e1313] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#0e1313]/95 p-5 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/55">Guest Profile</p>
            <h3 className="mt-2 truncate text-2xl font-semibold text-white">{contact.display_name}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone="good">{contact.status}</StatusBadge>
              {contact.tags.map(tag => <StatusBadge key={tag}>{tag}</StatusBadge>)}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onEdit} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 hover:bg-white/[0.05]">Edit</button>
            <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-white/10 text-lg text-white/55 hover:bg-white/[0.05]" aria-label="Close">×</button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <section>
            <h4 className="text-sm font-semibold text-white">Contact Information</h4>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4">
              <InfoRow label="Name" value={contact.display_name} />
              <InfoRow label="Phone" value={contact.phone ?? <span className="text-white/30">Missing phone</span>} />
              <InfoRow label="Email" value={contact.email ?? <span className="text-white/30">Missing email</span>} />
              <InfoRow label="Company" value={contact.company} />
              <InfoRow label="Job title" value={contact.job_title} />
              <InfoRow label="Date of birth" value={contact.date_of_birth ? formatDate(contact.date_of_birth) : null} />
              <InfoRow label="Nationality" value={contact.nationality} />
              <InfoRow label="Preferred language" value={contact.preferred_language} />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-white">Guest Intelligence</h4>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4">
              <InfoRow label="Notes" value={contact.notes} />
              <InfoRow label="Tags" value={contact.tags.length ? contact.tags.join(', ') : null} />
              <InfoRow label="Source" value={crmSourceLabel(contact.source)} />
              <InfoRow label="Created" value={formatDate(contact.created_at, true)} />
              <InfoRow label="Last updated" value={formatDate(contact.updated_at, true)} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-white">Hospitality Activity</h4>
              <StatusBadge>SevenRooms · Future integration</StatusBadge>
            </div>
            <p className="mt-4 text-sm text-white/42">No reservation or spend data connected yet.</p>
          </section>
        </div>
      </aside>
    </div>
  )
}

function ComingLater({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6">
      <StatusBadge>Coming later</StatusBadge>
      <h3 className="mt-4 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">{description}</p>
    </div>
  )
}

export function CrmPanel({ clientId, view }: { clientId: string; clientName: string; view: CrmWorkspaceView }) {
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [summary, setSummary] = useState<CrmSummary>(EMPTY_CRM_SUMMARY)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<CrmContactFilter>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formContact, setFormContact] = useState<CrmContact | null | undefined>(undefined)
  const [profileContact, setProfileContact] = useState<CrmContact | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, filter])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '25', filter })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const response = await fetch(`/api/clients/${clientId}/crm/contacts?${params}`, { signal, cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load CRM guests.')
      setContacts(payload.contacts ?? [])
      setSummary(payload.summary ?? EMPTY_CRM_SUMMARY)
      setTotalPages(payload.pagination?.totalPages ?? 1)
      setTotal(payload.pagination?.total ?? 0)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setError(loadError instanceof Error ? loadError.message : 'Unable to load CRM guests.')
    } finally {
      setLoading(false)
    }
  }, [clientId, debouncedSearch, filter, page])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function deleteContact(contact: CrmContact) {
    if (!window.confirm(`Delete ${contact.display_name}? The record will be retained as a soft-deleted audit record.`)) return
    const response = await fetch(`/api/clients/${clientId}/crm/contacts/${contact.id}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload.error ?? 'Unable to delete guest.')
      return
    }
    if (profileContact?.id === contact.id) setProfileContact(null)
    await load()
  }

  const pageLabel = useMemo(() => total === 0 ? 'No guests' : `${(page - 1) * 25 + 1}-${Math.min(page * 25, total)} of ${total}`, [page, total])

  if (view === 'segments') {
    return <ComingLater title="Segments" description="Reusable guest segments will be added when real reservation, visit, preference, and spend data is connected. No inferred or automated segments are shown in the MVP." />
  }

  if (view === 'integrations') {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/55">Integration</p>
            <h3 className="mt-3 text-xl font-semibold text-white">SevenRooms</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">Connect reservation, guest, visit, order, and spend history to enrich CRM profiles.</p>
          </div>
          <StatusBadge tone="warn">Not connected</StatusBadge>
        </div>
        <button type="button" disabled className="mt-6 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/25">Connect later</button>
      </div>
    )
  }

  if (view === 'data_quality') {
    return (
      <div className="space-y-4">
        <SummaryCards summary={summary} />
        {error && <p className="rounded-xl border border-red-300/20 bg-red-300/[0.07] p-3 text-sm text-red-100">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ['Missing email', summary.missingEmail, 'Profiles without an email address.'],
            ['Missing phone', summary.missingPhone, 'Profiles without a phone number.'],
            ['No contact details', summary.missingBoth, 'Profiles with neither email nor phone.'],
            ['Possible duplicate groups', summary.possibleDuplicateGroups, 'Repeated normalized email or phone values. Review manually; no contacts are merged automatically.'],
          ].map(([label, value, detail]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/38">{detail}</p>
                </div>
                <span className="text-xl font-semibold text-white">{Number(value).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SummaryCards summary={summary} />

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 md:flex-row md:items-center">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, phone, or email" className={`${INPUT_CLASS} md:max-w-md`} />
        <select value={filter} onChange={event => setFilter(event.target.value as CrmContactFilter)} className={`${INPUT_CLASS} md:w-52`}>
          {FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" onClick={() => setFormContact(null)} className="jarvis-button justify-center px-4 py-2.5 text-sm md:ml-auto">Add Guest</button>
      </div>

      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/[0.07] p-3 text-sm text-red-100">{error}</p>}

      <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.025]">
        {loading ? (
          <div className="p-10 text-center text-sm text-white/35">Loading guests...</div>
        ) : contacts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-white/62">No guests found</p>
            <p className="mt-2 text-xs text-white/34">{search || filter !== 'all' ? 'Try a different search or filter.' : 'Add the first guest profile when you have real contact information.'}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] border-collapse text-left">
                <thead className="border-b border-white/10 bg-black/20 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  <tr>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Tags</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {contacts.map(contact => (
                    <tr key={contact.id} className="hover:bg-white/[0.025]">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setProfileContact(contact)} className="text-sm font-semibold text-white hover:text-emerald-100">{contact.display_name}</button>
                        <div className="mt-1 flex gap-1.5">
                          {!contact.email && <StatusBadge tone="warn">Missing email</StatusBadge>}
                          {!contact.phone && <StatusBadge tone="warn">Missing phone</StatusBadge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs leading-5 text-white/52">
                        {contact.phone && <p>{contact.phone}</p>}
                        {contact.email && <p>{contact.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/48">{contact.company ?? ''}</td>
                      <td className="px-4 py-3"><div className="flex max-w-48 flex-wrap gap-1">{contact.tags.slice(0, 3).map(tag => <StatusBadge key={tag}>{tag}</StatusBadge>)}</div></td>
                      <td className="px-4 py-3"><StatusBadge>{crmSourceLabel(contact.source)}</StatusBadge></td>
                      <td className="px-4 py-3 text-xs text-white/38">{formatDate(contact.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 text-xs font-semibold">
                          <button type="button" onClick={() => setProfileContact(contact)} className="text-white/55 hover:text-white">Open</button>
                          <button type="button" onClick={() => setFormContact(contact)} className="text-white/55 hover:text-white">Edit</button>
                          <button type="button" onClick={() => deleteContact(contact)} className="text-red-200/60 hover:text-red-100">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-white/[0.07] md:hidden">
              {contacts.map(contact => (
                <article key={contact.id} className="p-4">
                  <button type="button" onClick={() => setProfileContact(contact)} className="text-left text-sm font-semibold text-white">{contact.display_name}</button>
                  <div className="mt-2 text-xs leading-5 text-white/48">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <StatusBadge>{crmSourceLabel(contact.source)}</StatusBadge>
                    {!contact.email && <StatusBadge tone="warn">Missing email</StatusBadge>}
                    {!contact.phone && <StatusBadge tone="warn">Missing phone</StatusBadge>}
                  </div>
                  <div className="mt-4 flex gap-4 text-xs font-semibold">
                    <button type="button" onClick={() => setProfileContact(contact)} className="text-white/58">Open Profile</button>
                    <button type="button" onClick={() => setFormContact(contact)} className="text-white/58">Edit</button>
                    <button type="button" onClick={() => deleteContact(contact)} className="text-red-200/65">Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-white/34">{pageLabel}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/55 disabled:opacity-25">Previous</button>
          <button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/55 disabled:opacity-25">Next</button>
        </div>
      </div>

      {formContact !== undefined && (
        <ContactFormModal
          clientId={clientId}
          contact={formContact}
          onClose={() => setFormContact(undefined)}
          onSaved={saved => {
            setProfileContact(current => current?.id === saved.id ? saved : current)
            load()
          }}
        />
      )}
      {profileContact && (
        <ContactProfileDrawer
          contact={profileContact}
          onClose={() => setProfileContact(null)}
          onEdit={() => setFormContact(profileContact)}
        />
      )}
    </div>
  )
}
