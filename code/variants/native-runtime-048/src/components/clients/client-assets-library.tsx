'use client';
/* eslint-disable @next/next/no-img-element -- Private previews use short-lived signed URLs, refreshed in the browser. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ClientBrainV2AssetListRecord, ClientBrainV2Record } from '@/lib/client-brain-v2';
import { ASSET_CATEGORIES, assetLibraryFacts, assetPreviewsNeedRefresh } from '@/lib/client-assets-library';
import styles from './client-assets-library.module.css';

type Library = { supported: boolean; canOpenAssetEditor?: boolean; records: ClientBrainV2AssetListRecord[]; inspirations: { id: string; title: string; status: string; analysis_state: string }[] };
type PreviewState = { url: string | null; failed: boolean; revision: number };
const label = (value: string | null | undefined) => value ? value.replaceAll('_', ' ') : 'Not recorded';
function Preview({ entry, title, refresh }: { entry?: PreviewState; title: string; refresh: () => void }) {
  const [failedRevision, setFailedRevision] = useState<number | null>(null);
  const failed = entry?.failed || (entry && failedRevision === entry.revision);
  return <div className={styles.preview}>
    {entry?.url && !failed ? <img src={entry.url} alt={title} loading="lazy" onError={() => setFailedRevision(entry.revision)} /> : <div>
      <span>{!entry ? 'Loading preview…' : failed ? 'Preview unavailable' : 'No preview available'}</span>
      {entry && <button type="button" onClick={refresh}>Refresh preview</button>}
    </div>}
  </div>;
}
export function ClientAssetsLibrary({ clientId, initial }: { clientId: string; initial: Library }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [role, setRole] = useState('all');
  const [approval, setApproval] = useState('all');
  const [limit, setLimit] = useState(48);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const lastRefresh = useRef(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [detail, setDetail] = useState<{ id: string; record?: ClientBrainV2Record; error?: string; revision: number } | null>(null);
  const records = initial.records.filter(record => {
    const facts = assetLibraryFacts(record);
    return record.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      && (category === 'all' || category === facts.category)
      && (role === 'all' || role === facts.lane)
      && (approval === 'all' || approval === (facts.approval ?? 'unset'));
  });
  const displayed = records.slice(0, limit);
  const selected = displayed.find(record => record.id === selectedId) ?? displayed[0];
  const ids = displayed.map(record => record.id).join(',');
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    const values = ids.split(',');
    async function load() {
      // Reveal the first cards without waiting for a whole library of cold derivatives.
      for (let offset = 0; offset < values.length; offset += 6) {
        if (controller.signal.aborted) return;
        const batch = values.slice(offset, offset + 6);
        try {
          const response = await fetch(`/api/clients/${clientId}/brain-v2/assets/thumbnails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetIds: batch }), signal: controller.signal });
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error('Preview request failed');
          if (!controller.signal.aborted) {
            const revision = Date.now();
            setPreviews(current => ({ ...current, ...Object.fromEntries(batch.map(id => [id, { url: payload.thumbnailUrls[id] ?? null, failed: false, revision }])) }));
            lastRefresh.current = revision;
          }
        } catch {
          if (!controller.signal.aborted) setPreviews(current => ({ ...current, ...Object.fromEntries(batch.map(id => [id, { url: null, failed: true, revision: Date.now() }])) }));
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [clientId, ids, previewRevision]);
  useEffect(() => {
    // Refresh before the 30-minute grant expires, including after a suspended tab resumes.
    const refreshIfDue = () => {
      if (assetPreviewsNeedRefresh(lastRefresh.current, Date.now(), !document.hidden)) {
        lastRefresh.current = Date.now();
        setPreviewRevision(current => current + 1);
      }
    };
    const interval = setInterval(refreshIfDue, 60_000);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshIfDue); };
  }, []);
  const currentId = selected?.id;
  useEffect(() => {
    if (!currentId) return;
    const controller = new AbortController();
    void fetch(`/api/clients/${clientId}/brain-v2/assets/${currentId}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load asset detail'); return body.record as ClientBrainV2Record; })
      .then(record => { if (!controller.signal.aborted) setDetail({ id: currentId, record, revision: detailRevision }); })
      .catch(error => { if (!controller.signal.aborted) setDetail({ id: currentId, error: error.message, revision: detailRevision }); });
    return () => controller.abort();
  }, [clientId, currentId, detailRevision]);
  const editor = (id?: string) => `/clients/${clientId}/brain?section=assets&subsection=all${id && initial.canOpenAssetEditor ? `&asset=${id}` : ''}`;
  const refresh = () => setPreviewRevision(current => current + 1);
  function clearFilters() { setSearch(''); setCategory('all'); setRole('all'); setApproval('all'); setLimit(48); }
  if (!initial.supported) return <section className={styles.shell}><h2>Assets is not available for this client yet</h2><p>This client uses a Brain setup that this library does not support. Its existing files remain in Brain.</p><Link href={`/clients/${clientId}/brain`}>Open Client Brain</Link></section>;
  const activeDetail = detail && detail.id === currentId && detail.revision === detailRevision ? detail : null;
  const facts = selected ? assetLibraryFacts(selected) : null;
  return <section className={styles.shell}>
    <div className={styles.heading}><h2>Assets</h2><Link href={editor()}>Add or manage assets</Link></div>
    <p className={styles.note}>Client assets do not require a social-platform connection. Category, file role, approval and reference readiness are separate facts.</p>
    <div className={styles.toolbar}>
      <input type="search" aria-label="Search assets by title" placeholder="Search assets by title" value={search} onChange={e => { setSearch(e.target.value); setLimit(48); }} />
      <label>Category<select value={category} onChange={e => { setCategory(e.target.value); setLimit(48); }}>{ASSET_CATEGORIES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Role<select value={role} onChange={e => { setRole(e.target.value); setLimit(48); }}>{['all','truth','direction','other'].map(value => <option key={value} value={value}>{value === 'other' ? 'Other / not set' : label(value)}</option>)}</select></label>
      <label>File approval<select value={approval} onChange={e => { setApproval(e.target.value); setLimit(48); }}>{['all','approved','draft','needs_review','restricted','archived','unset'].map(value => <option key={value} value={value}>{value === 'unset' ? 'Not recorded' : label(value)}</option>)}</select></label>
      <button type="button" onClick={clearFilters}>Clear filters</button><button type="button" onClick={refresh}>Refresh previews</button>
    </div>
    {!initial.records.length ? <div className={styles.empty}><h3>No assets yet</h3><p>Add your first client asset using the existing Brain uploader.</p><Link href={editor()}>Open uploader in Brain</Link></div>
      : !records.length ? <div className={styles.empty}><h3>No matching assets</h3><p>Your library still contains {initial.records.length} records.</p><button type="button" onClick={clearFilters}>Clear filters</button></div>
      : <div className={styles.layout}><div>
        {(['truth','direction','other'] as const).map(lane => {
          const items = displayed.filter(record => assetLibraryFacts(record).lane === lane);
          if (!items.length) return null;
          return <section className={`${styles.lane} ${lane === 'truth' ? styles.truth : ''}`} key={lane}>
            <h3>{lane === 'truth' ? 'Factual references' : lane === 'direction' ? 'Creative direction' : 'Other files and roles not set'}</h3>
            <p className={styles.note}>{lane === 'truth' ? 'Truth is the recorded file role. Check its approval and metadata before use.' : lane === 'direction' ? 'Framing and mood references do not establish client identity.' : 'These files are not promoted to factual references by their category.'}</p>
            <div className={styles.grid}>{items.map(record => {
              const item = assetLibraryFacts(record);
              return <article key={record.id} className={styles.card} data-selected={selected?.id === record.id}>
                <Preview entry={previews[record.id]} title={record.title} refresh={refresh} />
                <button type="button" className={styles.cardBody} onClick={() => setSelectedId(record.id)} aria-pressed={selected?.id === record.id}>
                  <strong>{record.title}</strong><span className={styles.facts}>
                    <span>Category: {label(item.category)}</span><span>Role: {label(item.role)}</span>
                    <span>File approval: {label(item.approval)}</span><span>Readiness: {item.readiness}</span>
                  </span>
                  {item.reasons[0] && <span className={styles.reason}>{item.reasons[0]}</span>}
                  <small>Updated {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Dubai' }).format(new Date(record.updated_at))}</small>
                </button>
              </article>;
            })}</div>
          </section>;
        })}
        {records.length > displayed.length && <button type="button" onClick={() => setLimit(current => current + 48)}>Show more ({displayed.length} of {records.length})</button>}
      </div>{selected && facts && <aside className={styles.detail} aria-label="Asset detail">
        <Preview entry={previews[selected.id]} title={selected.title} refresh={refresh} />
        <div className={styles.detailBody}><h3>{selected.title}</h3><dl>
          <dt>Category</dt><dd>{label(facts.category)}</dd><dt>Semantic file role</dt><dd>{label(facts.role)}</dd>
          <dt>File approval</dt><dd>{label(facts.approval)}</dd><dt>Asset record status</dt><dd>{label(selected.status)}</dd>
          <dt>Studio default role</dt><dd>{facts.studioRole ? label(facts.studioRole) : 'Role not set'}</dd>
          <dt>Reference readiness</dt><dd>{facts.readiness}</dd>
        </dl>{facts.reasons.map(reason => <p className={styles.reason} key={reason}>{reason}</p>)}
        <p className={styles.note}>Review permissions and factual accuracy before using this reference in Studio.</p>
        {!activeDetail ? <p role="status">Loading details…</p> : activeDetail.error ? <div role="alert"><p>Asset details unavailable.</p><button type="button" onClick={() => setDetailRevision(current => current + 1)}>Retry details</button></div> : activeDetail.record && <>
          <h4>Linked files</h4>{activeDetail.record.files?.length ? <ul>{activeDetail.record.files.map(file => <li key={file.id}>{file.file_name}<small>{label(file.semantic_role)} · {label(file.approval_status)}</small></li>)}</ul> : <p>No files recorded.</p>}
          <h4>Recorded metadata</h4><dl>{Object.entries(activeDetail.record.metadata ?? {}).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value == null ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
          <h4>Relationships and sources</h4>{activeDetail.record.relationships?.length ? <ul>{activeDetail.record.relationships.map((relationship, index) => <li key={index}>{relationship.record.title}</li>)}</ul> : <p>No relationships recorded.</p>}
        </>}
        <Link href={editor(selected.id)}>{initial.canOpenAssetEditor ? 'Open in asset editor →' : 'Manage in Client Brain →'}</Link>
        <p className={styles.note}>Previews are temporary. Metadata editing and file management stay in Client Brain.</p>
        </div></aside>}</div>}
    <section className={styles.lane}><div className={styles.heading}><h3>Inspiration</h3><Link href={`/clients/${clientId}/brain/pinterest-inspiration`}>Manage Pinterest inspiration →</Link></div>
      <p className={styles.note}>Composition and mood only. Inspiration remains separate from factual references.</p>
      {initial.inspirations.length ? <ul className={styles.inspirations}>{initial.inspirations.map(pin => <li key={pin.id}><strong>{pin.title}</strong><span>{label(pin.status)} · Analysis: {label(pin.analysis_state)}</span></li>)}</ul> : <p>No inspiration recorded yet.</p>}
    </section>
  </section>;
}
