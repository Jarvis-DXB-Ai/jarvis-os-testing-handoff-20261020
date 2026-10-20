'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  commercialMoney,
  commercialPriceLabel,
  commercialStateLabel,
  type CommercialCatalogSnapshot,
  type CommercialProduct,
  type CommercialServiceState,
} from '@/lib/commercial-catalog'

import styles from './packages-workspace.module.css'
import { keepDialogFocus } from '../agents/agent-modal'

type Filter = 'all' | CommercialServiceState
type EditorDraft = {
  summary: string
  price_amount: string
  billing_unit: CommercialProduct['billing_unit']
  pricing_model: CommercialProduct['pricing_model']
  service_state: CommercialProduct['service_state']
  availability_note: string
  scope_notes: string
  includes: string
  requirements: string
  exclusions: string
}

const availabilityFilters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'hybrid', label: 'In development' },
  { id: 'planned', label: 'Planned' },
]

const splitLines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const packageBySlug = (products: CommercialProduct[], slug: string) => products.find(product => product.slug === slug) ?? null
const isMonthlySelectable = (product: CommercialProduct) => product.catalog_type === 'addon' && product.billing_unit === 'month' && product.price_amount !== null
const servicePrice = (product: CommercialProduct) => product.billing_unit === 'video'
  ? `${commercialMoney(product.price_amount, product.currency)} / video`
  : `${commercialMoney(product.price_amount, product.currency)} / month`

function productDraft(product: CommercialProduct): EditorDraft {
  return {
    summary: product.summary,
    price_amount: product.price_amount === null ? '' : String(product.price_amount),
    billing_unit: product.billing_unit,
    pricing_model: product.pricing_model,
    service_state: product.service_state,
    availability_note: product.availability_note ?? '',
    scope_notes: product.scope_notes ?? '',
    includes: product.includes.join('\n'),
    requirements: product.requirements.join('\n'),
    exclusions: product.exclusions.join('\n'),
  }
}

export function PackagesWorkspace({ initialSnapshot }: { initialSnapshot: CommercialCatalogSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])
  const [family, setFamily] = useState('All')
  const [availability, setAvailability] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<CommercialProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const customRef = useRef<HTMLElement>(null)

  const products = snapshot.products
  const standard = packageBySlug(products, 'standard')
  const custom = packageBySlug(products, 'custom')
  const max = packageBySlug(products, 'max')
  const enterprise = packageBySlug(products, 'enterprise')
  const addons = useMemo(() => products.filter(product => product.catalog_type === 'addon'), [products])
  const monthlyAddons = useMemo(() => addons.filter(isMonthlySelectable), [addons])
  const selectedAddons = useMemo(() => monthlyAddons.filter(product => selectedAddonIds.includes(product.id)), [monthlyAddons, selectedAddonIds])
  const standardPrice = standard?.price_amount ?? 0
  const addonTotal = selectedAddons.reduce((sum, product) => sum + (product.price_amount ?? 0), 0)
  const customTotal = standardPrice + addonTotal
  const maxAddons = useMemo(() => monthlyAddons.filter(product => product.max_eligible), [monthlyAddons])
  const maxDiscount = typeof max?.metadata.addon_discount_percent === 'number' ? max.metadata.addon_discount_percent : 25
  const maxAddonRetail = maxAddons.reduce((sum, product) => sum + (product.price_amount ?? 0), 0)
  const maxTotal = standardPrice + maxAddonRetail * (1 - maxDiscount / 100)
  const maxSaving = standardPrice + maxAddonRetail - maxTotal
  const familyOptions = useMemo(() => ['All', ...[...new Set(addons.map(product => product.family ?? 'Other'))]], [addons])
  const filteredAddons = useMemo(() => addons.filter(product => {
    const haystack = `${product.name} ${product.family ?? ''} ${product.summary} ${product.includes.join(' ')}`.toLowerCase()
    return (family === 'All' || (product.family ?? 'Other') === family)
      && (availability === 'all' || product.service_state === availability)
      && (!search.trim() || haystack.includes(search.trim().toLowerCase()))
  }), [addons, availability, family, search])

  function toggleAddon(product: CommercialProduct) {
    if (!isMonthlySelectable(product)) return
    setSelectedAddonIds(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])
  }

  function addCombination(ids: string[]) {
    setSelectedAddonIds(current => [...new Set([...current, ...ids.filter(id => monthlyAddons.some(product => product.id === id))])])
  }

  function chooseMax() { setSelectedAddonIds(maxAddons.map(product => product.id)) }
  function viewCustom() { customRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }) }

  async function saveProduct(product: CommercialProduct, draft: EditorDraft) {
    setError(null)
    const response = await fetch(`/api/packages/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedUpdatedAt: product.updated_at,
        summary: draft.summary,
        price_amount: draft.price_amount === '' ? null : Number(draft.price_amount),
        billing_unit: draft.billing_unit,
        pricing_model: draft.pricing_model,
        service_state: draft.service_state,
        availability_note: draft.availability_note,
        scope_notes: draft.scope_notes,
        includes: splitLines(draft.includes),
        requirements: splitLines(draft.requirements),
        exclusions: splitLines(draft.exclusions),
      }),
    })
    const next = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(next.error ?? 'Package could not be saved.')
    setSnapshot(next as CommercialCatalogSnapshot)
    setDetail((next as CommercialCatalogSnapshot).products.find(item => item.id === product.id) ?? null)
  }

  return <main className={styles.root}>
    <div className={styles.canvas}>
      <header className={styles.header}>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[color:var(--j-recommend)]">Build / Commercial</p>
        <h1 className="mt-3 text-4xl font-medium leading-tight sm:text-5xl">Packages</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[color:var(--j-text-3)]">Compare packages, assemble a custom scope and explore the services you can offer.</p>
      </header>

      {error && <div role="alert" className="mx-auto mt-8 flex max-w-4xl items-center justify-between gap-4 rounded-md border border-rose-300/25 bg-rose-300/[.08] px-4 py-3 text-sm text-rose-100"><span>{error}</span><button type="button" onClick={() => setError(null)} className="font-medium">Dismiss</button></div>}

      <section className={`${styles.packages} mt-8 grid items-stretch gap-5 xl:grid-cols-3`} aria-label="Primary packages">
        {standard && <StandardCard product={standard} onDetail={() => setDetail(standard)} />}
        <section ref={customRef}>{custom && <CustomCard addons={addons} selectedIds={selectedAddonIds} selectedCount={selectedAddons.length} addonTotal={addonTotal} total={customTotal} maxTotal={maxTotal} onToggle={toggleAddon} onDetail={() => setDetail(custom)} />}</section>
        {max && <MaxCard total={maxTotal} saving={maxSaving} eligibleCount={maxAddons.length} discount={maxDiscount} onDetail={() => setDetail(max)} onChoose={chooseMax} />}
      </section>

      <section className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Commercial terms">
        {['12-month Standard commitment', '3-month minimum add-ons', 'Onboarding included', 'No setup fees', 'Ad spend separate', `${maxDiscount}% Max add-on discount`].map(term => <div key={term} className="bg-[var(--j-panel)] px-4 py-3 text-center text-xs font-medium text-[color:var(--j-text-3)]">{term}</div>)}
      </section>

      {enterprise && <EnterpriseCallout onDetail={() => setDetail(enterprise)} />}

      <section className="mt-16 border-t border-[var(--j-hair-2)] pt-14" aria-labelledby="all-services">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--j-recommend)]">All services</p>
            <h2 id="all-services" className="mt-2 text-3xl font-medium">Explore every way Jarvis can help.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--j-text-3)]">Select a service for a clear scope, requirements and what it works well with. Add compatible recurring services to your Custom package as you explore.</p>
          </div>
          <div className="w-full lg:max-w-xs"><label className="sr-only" htmlFor="service-search">Search services</label><input id="service-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search services" className="min-h-11 w-full rounded-md border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] px-4 text-sm text-white outline-none placeholder:text-[color:var(--j-text-3)] focus:border-emerald-300/45" /></div>
        </div>
        <div className="mt-7 flex flex-wrap gap-2" aria-label="Service family filters">
          {familyOptions.map(option => <button key={option} type="button" aria-pressed={family === option} onClick={() => setFamily(option)} className={`min-h-10 rounded-md border px-3 text-xs font-medium transition ${family === option ? 'border-emerald-300 bg-[var(--j-recommend)] text-[color:var(--j-on-green)]' : 'border-[var(--j-hair-2)] bg-[var(--j-panel-2)] text-[color:var(--j-text-3)] hover:border-[var(--j-hair-2)] hover:text-white'}`}>{option}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Availability filters">
          {availabilityFilters.map(option => <button key={option.id} type="button" aria-pressed={availability === option.id} onClick={() => setAvailability(option.id)} className={`min-h-9 rounded-md px-3 text-xs font-medium transition ${availability === option.id ? 'bg-[var(--j-panel-2)] text-white' : 'text-[color:var(--j-text-3)] hover:text-[color:var(--j-text-2)]'}`}>{option.label}</button>)}
        </div>
        {filteredAddons.length === 0 ? <Empty label="No services match these filters." /> : <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredAddons.map(product => <ServiceCard key={product.id} product={product} selected={selectedAddonIds.includes(product.id)} onDetail={() => setDetail(product)} onToggle={() => toggleAddon(product)} />)}</div>}
      </section>

      <section className="mt-16 border-t border-[var(--j-hair-2)] pt-14" aria-labelledby="recommended-combinations">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--j-recommend)]">Recommended combinations</p>
        <h2 id="recommended-combinations" className="mt-2 text-3xl font-medium">Services that work better together.</h2>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">{snapshot.combinations.map(combination => <CombinationCard key={combination.id} combination={combination} onAdd={() => addCombination(combination.products.map(product => product.id))} />)}</div>
      </section>
    </div>

    {selectedAddons.length > 0 && <div className={styles.selectionBar}><div><p className="text-[10px] font-medium uppercase tracking-[.14em] text-[color:var(--j-recommend)]">Custom package</p><p className="mt-0.5 text-sm font-medium">{selectedAddons.length} service{selectedAddons.length === 1 ? '' : 's'} <span className="font-normal text-[color:var(--j-text-3)]">{commercialMoney(customTotal)} / month</span></p></div><button type="button" onClick={viewCustom} className="min-h-10 rounded-md border border-emerald-300/30 px-3 text-xs font-medium text-[color:var(--j-recommend)] hover:bg-emerald-300/[.08]">View package</button></div>}
    {detail && <ProductDrawer key={`${detail.id}:${detail.updated_at}`} product={detail} onClose={() => setDetail(null)} onSave={saveProduct} onError={setError} />}
  </main>
}

function CardHeader({ title, eyebrow, badge }: { title: string; eyebrow: string; badge?: string }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[.18em] text-[color:var(--j-text-3)]">{eyebrow}</p><h2 className="mt-2 text-2xl font-medium">{title}</h2></div>{badge && <span className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-2.5 py-1 text-[10px] font-medium text-[color:var(--j-recommend)]">{badge}</span>}</div>
}

function Price({ amount, subline }: { amount: string; subline: string }) {
  return <div className="mt-7"><p className="text-4xl font-medium tracking-tight sm:text-[2.7rem]">{amount}</p><p className="mt-1 text-sm text-[color:var(--j-text-3)]">{subline}</p></div>
}

function FeatureList({ features, limit }: { features: string[]; limit?: number }) {
  const visible = typeof limit === 'number' ? features.slice(0, limit) : features
  return <ul className="mt-7 space-y-3">{visible.map(feature => <li key={feature} className="flex gap-3 text-sm leading-5 text-[color:var(--j-text-2)]"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />{feature}</li>)}</ul>
}

function StandardCard({ product, onDetail }: { product: CommercialProduct; onDetail: () => void }) {
  return <article className={`${styles.packageCard} p-6 sm:p-7`}><CardHeader title="Standard" eyebrow="A complete foundation" /><Price amount={commercialMoney(product.price_amount, product.currency)} subline="per month / 12-month commitment" /><p className="mt-5 text-sm leading-6 text-[color:var(--j-text-3)]">Everything needed for a consistent, managed social and brand foundation.</p><FeatureList features={product.includes} /><button type="button" onClick={onDetail} className="mt-auto min-h-11 rounded-md border border-[var(--j-hair-2)] px-4 text-sm font-medium text-[color:var(--j-text-2)] hover:bg-[var(--j-panel-2)] hover:text-white">See full Standard features</button></article>
}

function CustomCard({ addons, selectedIds, selectedCount, addonTotal, total, maxTotal, onToggle, onDetail }: { addons: CommercialProduct[]; selectedIds: string[]; selectedCount: number; addonTotal: number; total: number; maxTotal: number; onToggle: (product: CommercialProduct) => void; onDetail: () => void }) {
  const difference = maxTotal - total
  return <article className={`${styles.packageCard} ${styles.featured} p-6 sm:p-7`}><CardHeader title="Custom" eyebrow="Build your system" badge="Most flexible" /><Price amount={commercialMoney(total)} subline={selectedCount ? `${selectedCount} add-on${selectedCount === 1 ? '' : 's'} selected; +${commercialMoney(addonTotal)} / month` : 'Includes Standard; add the services you need'} /><div className="mt-6 border-t border-emerald-200/15 pt-5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-medium uppercase tracking-[.16em] text-[color:var(--j-recommend)]">Add the services you need</p><button type="button" onClick={onDetail} className="text-xs font-medium text-[color:var(--j-recommend)] hover:text-[color:var(--j-recommend)]">Package details</button></div><div className="mt-3 max-h-[390px] space-y-1 overflow-y-auto pr-1" aria-label="Custom services">{addons.map(addon => <AddonSelector key={addon.id} product={addon} selected={selectedIds.includes(addon.id)} onToggle={() => onToggle(addon)} />)}</div></div><div className="mt-auto pt-5"><div className="rounded-md border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] px-4 py-3"><p className="text-sm font-medium text-white">{difference > 0 ? `Max is ${commercialMoney(difference)} more per month.` : difference === 0 ? 'Your Custom selection matches Max.' : `Max saves ${commercialMoney(Math.abs(difference))} per month.`}</p><p className="mt-1 text-xs leading-5 text-[color:var(--j-text-3)]">Max includes every eligible recurring service, with the add-on discount already applied.</p></div></div></article>
}

function MaxCard({ total, saving, eligibleCount, discount, onDetail, onChoose }: { total: number; saving: number; eligibleCount: number; discount: number; onDetail: () => void; onChoose: () => void }) {
  return <article className={`${styles.packageCard} p-6 sm:p-7`}><CardHeader title="Max" eyebrow="Complete operating system" badge="Best value" /><Price amount={commercialMoney(total)} subline={`per month / save ${commercialMoney(saving)} / month`} /><p className="mt-5 text-sm leading-6 text-[color:var(--j-text-3)]">The complete Jarvis operating system, built for a business ready to connect every eligible service.</p><FeatureList features={['Everything in Standard', `All ${eligibleCount} eligible recurring add-ons`, `${discount}% off eligible add-on pricing`, 'Maximum integration between services', 'Growth opportunities and business intelligence', 'Complete managed system']} /><div className="mt-auto grid grid-cols-2 gap-2 pt-6"><button type="button" onClick={onDetail} className="min-h-11 rounded-md border border-[var(--j-hair-2)] px-3 text-sm font-medium text-[color:var(--j-text-2)] hover:bg-[var(--j-panel-2)]">Details</button><button type="button" onClick={onChoose} className="min-h-11 rounded-md bg-[var(--j-recommend)] px-3 text-sm font-medium text-[color:var(--j-on-green)] hover:brightness-110">Compare in Custom</button></div></article>
}

function AddonSelector({ product, selected, onToggle }: { product: CommercialProduct; selected: boolean; onToggle: () => void }) {
  const selectable = isMonthlySelectable(product)
  return <label className={`flex min-w-0 min-h-12 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition ${selected ? 'bg-emerald-300/[.12]' : 'hover:bg-[var(--j-panel-2)]'} ${selectable ? '' : 'cursor-default opacity-55'}`}><input type="checkbox" checked={selected} disabled={!selectable} onChange={onToggle} className="h-4 w-4 shrink-0 accent-emerald-300" /><span className="min-w-0 flex-1 text-sm leading-5 text-[color:var(--j-text-2)]">{product.name}</span><span className="max-w-24 shrink-0 text-right text-xs font-medium leading-4 text-[color:var(--j-recommend)]">{commercialPriceLabel(product)}</span></label>
}

function EnterpriseCallout({ onDetail }: { onDetail: () => void }) {
  return <section className="mt-5 flex flex-col gap-6 rounded-lg border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-medium uppercase tracking-[.18em] text-[color:var(--j-recommend)]">Enterprise</p><h2 className="mt-2 text-2xl font-medium">For groups, multi-location businesses and complex organisations.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--j-text-3)]">Custom architecture, service allocation and centralized reporting for a business with a larger operational footprint.</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[color:var(--j-text-3)]">{['Custom architecture', 'Multi-location intelligence', 'Centralized reporting', 'Custom pricing'].map(item => <span key={item}>{item}</span>)}</div></div><button type="button" onClick={onDetail} className="min-h-11 shrink-0 rounded-md border border-emerald-300/30 px-5 text-sm font-medium text-[color:var(--j-recommend)] hover:bg-emerald-300/[.08]">Explore Enterprise scope</button></section>
}

function ServiceCard({ product, selected, onDetail, onToggle }: { product: CommercialProduct; selected: boolean; onDetail: () => void; onToggle: () => void }) {
  const selectable = isMonthlySelectable(product)
  return <article className={`flex min-h-[305px] flex-col rounded-lg border p-5 transition ${selected ? 'border-emerald-300/40 bg-emerald-300/[.07]' : 'border-[var(--j-hair-2)] bg-[var(--j-panel-2)] hover:border-[var(--j-hair-2)]'}`}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[.14em] text-[color:var(--j-text-3)]">{product.family ?? 'Service'}</p><h3 className="mt-2 text-lg font-medium leading-6">{product.name}</h3></div><span className={`shrink-0 rounded border px-2 py-1 text-[10px] font-medium ${styles[product.service_state]}`}>{commercialStateLabel(product.service_state)}</span></div><p className="mt-4 text-xl font-medium text-[color:var(--j-recommend)]">{servicePrice(product)}</p><p className="mt-3 text-sm leading-6 text-[color:var(--j-text-3)]">{product.summary}</p><FeatureList features={product.includes} limit={3} /><div className="mt-auto flex items-center justify-between gap-3 pt-5"><button type="button" onClick={onDetail} className="min-h-10 text-xs font-medium text-[color:var(--j-text-3)] hover:text-white">Explore service</button>{selectable ? <button type="button" onClick={onToggle} className={`min-h-10 rounded-md px-3 text-xs font-medium ${selected ? 'border border-emerald-300/35 bg-emerald-300/[.10] text-[color:var(--j-recommend)]' : 'bg-[var(--j-recommend)] text-[color:var(--j-on-green)] hover:brightness-110'}`}>{selected ? 'Included in Custom' : 'Add to Custom'}</button> : <span className="text-xs text-[color:var(--j-text-3)]">Quoted per video</span>}</div></article>
}

function CombinationCard({ combination, onAdd }: { combination: CommercialCatalogSnapshot['combinations'][number]; onAdd: () => void }) {
  const monthlyPrice = combination.products.reduce((sum, product) => sum + (product.billing_unit === 'month' ? product.price_amount ?? 0 : 0), 0)
  return <article className="rounded-lg border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] p-5"><h3 className="text-lg font-medium">{combination.name}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[color:var(--j-text-3)]">{combination.description}</p><div className="mt-5 flex flex-wrap gap-2">{combination.products.map(product => <span key={product.id} className="rounded-md border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] px-2.5 py-1.5 text-[11px] text-[color:var(--j-text-2)]">{product.name}</span>)}</div><div className="mt-6 flex items-center justify-between gap-4"><p className="text-sm font-medium">{commercialMoney(monthlyPrice)}<span className="font-normal text-[color:var(--j-text-3)]"> / month in add-ons</span></p><button type="button" onClick={onAdd} className="min-h-10 rounded-md border border-emerald-300/25 px-3 text-xs font-medium text-[color:var(--j-recommend)] hover:bg-emerald-300/[.08]">Add combination</button></div></article>
}

function ProductDrawer({ product, onClose, onSave, onError }: { product: CommercialProduct; onClose: () => void; onSave: (product: CommercialProduct, draft: EditorDraft) => Promise<void>; onError: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => productDraft(product))
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  const update = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => setDraft(current => ({ ...current, [field]: value }))
  async function save() { try { setSaving(true); setSaveError(null); onError(null); await onSave(product, draft); setEditing(false) } catch (caught) { const message = caught instanceof Error ? caught.message : 'Package could not be saved.'; setSaveError(message); onError(message) } finally { setSaving(false) } }
  return <dialog ref={dialog} aria-label={`${product.name} details`} className={styles.dialog} onKeyDown={keepDialogFocus} onCancel={onClose} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className={styles.drawer}><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-medium uppercase tracking-[.14em] text-[color:var(--j-recommend)]">{product.family ?? 'Package'}</p><h2 className="mt-1 text-2xl font-medium">{product.name}</h2><p className="mt-2 text-sm text-[color:var(--j-text-3)]">{commercialPriceLabel(product)}</p></div><button type="button" onClick={onClose} className="min-h-10 rounded-md border border-[var(--j-hair-2)] px-3 text-xs font-medium text-[color:var(--j-text-2)]">Close</button></div>{saveError && <p role="alert" className={styles.error}>{saveError}</p>}{!editing ? <ProductRead product={product} onEdit={() => setEditing(true)} /> : <div className="mt-7 space-y-4"><Field label="Summary"><textarea value={draft.summary} onChange={event => update('summary', event.target.value)} className={inputClass} rows={3} /></Field><div className="grid gap-3 sm:grid-cols-3"><Field label="Price"><input value={draft.price_amount} onChange={event => update('price_amount', event.target.value)} type="number" min="0" step="0.01" className={inputClass} /></Field><Field label="Billing"><select value={draft.billing_unit} onChange={event => update('billing_unit', event.target.value as EditorDraft['billing_unit'])} className={inputClass}><option value="month">Per month</option><option value="video">Per video</option><option value="custom">Custom</option></select></Field><Field label="Pricing"><select value={draft.pricing_model} onChange={event => update('pricing_model', event.target.value as EditorDraft['pricing_model'])} className={inputClass}><option value="fixed">Fixed</option><option value="working">Working / TBD</option><option value="calculated">Calculated</option><option value="custom">Custom</option></select></Field></div><Field label="Availability"><select value={draft.service_state} onChange={event => update('service_state', event.target.value as EditorDraft['service_state'])} className={inputClass}><option value="available">Available</option><option value="hybrid">In development</option><option value="planned">Planned</option></select></Field><Field label="Availability note"><textarea value={draft.availability_note} onChange={event => update('availability_note', event.target.value)} className={inputClass} rows={2} /></Field><Field label="Scope note"><textarea value={draft.scope_notes} onChange={event => update('scope_notes', event.target.value)} className={inputClass} rows={2} /></Field><Field label="Includes (one per line)"><textarea value={draft.includes} onChange={event => update('includes', event.target.value)} className={inputClass} rows={7} /></Field><Field label="Requirements (one per line)"><textarea value={draft.requirements} onChange={event => update('requirements', event.target.value)} className={inputClass} rows={5} /></Field><Field label="Not included (one per line)"><textarea value={draft.exclusions} onChange={event => update('exclusions', event.target.value)} className={inputClass} rows={4} /></Field><div className="flex justify-end gap-2 border-t border-[var(--j-hair-2)] pt-5"><button type="button" onClick={() => { setDraft(productDraft(product)); setEditing(false) }} className="min-h-11 rounded-md border border-[var(--j-hair-2)] px-4 text-sm font-medium text-[color:var(--j-text-2)]">Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-md bg-[var(--j-recommend)] px-4 text-sm font-medium text-[color:var(--j-on-green)] disabled:opacity-50">{saving ? 'Saving...' : 'Save details'}</button></div></div>}</section></dialog>
}

function ProductRead({ product, onEdit }: { product: CommercialProduct; onEdit: () => void }) { return <div className="mt-7"><div className="flex flex-wrap gap-2"><span className={`rounded border px-2 py-1 text-[11px] font-medium ${styles[product.service_state]}`}>{commercialStateLabel(product.service_state)}</span>{product.minimum_commitment_months && <span className="rounded border border-[var(--j-hair-2)] px-2 py-1 text-[11px] font-medium text-[color:var(--j-text-3)]">{product.minimum_commitment_months}-month commitment</span>}{product.requires_standard && <span className="rounded border border-[var(--j-hair-2)] px-2 py-1 text-[11px] font-medium text-[color:var(--j-text-3)]">Requires Standard</span>}</div><p className="mt-5 text-sm leading-relaxed text-[color:var(--j-text-2)]">{product.summary}</p><InfoList label="What is included" values={product.includes} />{product.requirements.length > 0 && <InfoList label="What is needed" values={product.requirements} />}{product.relationships.length > 0 && <section className="mt-7"><h3 className="text-sm font-medium">Works especially well with</h3><div className="mt-3 space-y-2">{product.relationships.map(relationship => <div key={relationship.id} className="rounded-md border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] p-3"><p className="text-sm font-medium">{relationship.related_product_name}</p><p className="mt-1 text-xs leading-relaxed text-[color:var(--j-text-3)]">{relationship.note ?? relationship.relationship_type}</p></div>)}</div></section>}{product.exclusions.length > 0 && <InfoList label="Not included" values={product.exclusions} />}{product.availability_note && <Notice label="Availability" value={product.availability_note} />}<div className="mt-8 border-t border-[var(--j-hair-2)] pt-5"><button type="button" onClick={onEdit} className="min-h-11 rounded-md border border-emerald-300/25 px-4 text-sm font-medium text-[color:var(--j-recommend)] hover:bg-emerald-300/10">Edit details</button></div></div> }

function Notice({ label, value }: { label: string; value: string }) { return <section className="mt-6 rounded-md border border-sky-300/20 bg-sky-300/[.06] p-4"><p className="text-[11px] font-medium uppercase tracking-[.12em] text-sky-100/75">{label}</p><p className="mt-2 text-sm leading-relaxed text-sky-50/80">{value}</p></section> }
function InfoList({ label, values }: { label: string; values: string[] }) { return <section className="mt-7"><h3 className="text-sm font-medium">{label}</h3><FeatureList features={values} /></section> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-medium text-[color:var(--j-text-3)]">{label}</span>{children}</label> }
function Empty({ label }: { label: string }) { return <div className="mt-7 rounded-lg border border-dashed border-[var(--j-hair-2)] px-5 py-12 text-center text-sm text-[color:var(--j-text-3)]">{label}</div> }
const inputClass = 'w-full rounded-md border border-[var(--j-hair-2)] bg-[var(--j-panel-2)] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[color:var(--j-text-3)] focus:border-emerald-300/45'
