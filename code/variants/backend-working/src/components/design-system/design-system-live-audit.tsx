'use client';
import { useEffect, useRef, useState } from 'react';
import inventory from '@/generated/design-inventory.json';
import home from '@/components/dashboard/home-dashboard-view.module.css';
import styles from './design-system-workspace.module.css';
type Reading = {
    name: string;
    global: string;
    home: string;
    client: string;
};
type TypeReading = {
    name: string;
    family: string;
    size: string;
    weight: string;
    lineHeight: string;
    spacing: string;
};
function Source({ path }: {
    path: string;
}) { return <p className={styles.source}>Source: <code>{path}</code></p>; }
function Value({ value }: {
    value: string;
}) {
    const color = typeof CSS !== 'undefined' && CSS.supports('color', value);
    return <span className={styles.value}>{color && <i aria-hidden style={{ backgroundColor: value }}/>}<code>{value || 'Not set in this scope'}</code></span>;
}
import { cx } from './design-system-parts';
import proposals from './r02-token-proposals.json';
export function LiveDesignAudit() {
    const homeRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<HTMLDivElement>(null);
    const typographyRef = useRef<HTMLDivElement>(null);
    const [readings, setReadings] = useState<Reading[]>([]);
    const [typeReadings, setTypeReadings] = useState<TypeReading[]>([]);
    const [refresh, setRefresh] = useState(0);
    const [measured, setMeasured] = useState('');
    const [query, setQuery] = useState('');
    const [auditQuery, setAuditQuery] = useState('');
    const [auditLimit, setAuditLimit] = useState(15);
    const [showAllRepeated, setShowAllRepeated] = useState(false);
    useEffect(() => {
        let active = true;
        function read() {
            if (!active || !homeRef.current || !clientRef.current)
                return;
            const global = getComputedStyle(document.documentElement);
            const localHome = getComputedStyle(homeRef.current);
            const client = getComputedStyle(clientRef.current);
            setReadings(inventory.names.map(name => ({ name, global: global.getPropertyValue(name).trim(), home: localHome.getPropertyValue(name).trim(), client: client.getPropertyValue(name).trim() })));
            setTypeReadings(Array.from(typographyRef.current?.closest('[data-design-library]')?.querySelectorAll<HTMLElement>('[data-type-sample]') ?? []).map(node => {
                const value = getComputedStyle(node);
                return { name: node.dataset.typeSample!, family: value.fontFamily, size: value.fontSize, weight: value.fontWeight, lineHeight: value.lineHeight, spacing: value.letterSpacing };
            }));
            setMeasured(new Date().toLocaleTimeString());
        }
        read();
        void document.fonts.ready.then(read);
        window.addEventListener('resize', read);
        const observer = new MutationObserver(read);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
        return () => { active = false; observer.disconnect(); window.removeEventListener('resize', read); };
    }, [refresh]);
    const tokens = readings.filter(row => `${row.name} ${row.global} ${row.home} ${row.client}`.toLowerCase().includes(query.toLowerCase()));
    const variants = (showAllRepeated ? inventory.repeated : inventory.variants).filter(item => `${item.name} ${item.definitions.map(row => `${row.file} ${row.scope} ${row.value}`).join(' ')}`.toLowerCase().includes(auditQuery.toLowerCase()));
    return <section id="audit" data-group="audit" className={`${cx('j-section')} ${styles.canvas}`}><div className={cx('j-section-head')}><span className={cx('j-section-num')}>09</span><h2 className={cx('j-section-title')}>Live tokens and source audit</h2></div><p className={cx('j-section-lede')}>Current browser measurements and generated source definitions. R02 aliases are scoped to this library. The Home and client samples retain their component token overrides but inherit library aliases here; they do not prove how every application page resolves them.</p><div ref={typographyRef}/><div ref={homeRef} className={home.root} hidden/><div ref={clientRef} className="client-workspace-shell" hidden/><div className={styles.tableWrap}><table><caption>Computed typography from the rendered r02 specimens (font stack does not prove the actual face)</caption><thead><tr><th>Role</th><th>Font stack</th><th>Size / weight</th><th>Line / tracking</th></tr></thead><tbody>{typeReadings.map(row => <tr key={row.name}><th>{row.name}</th><td>{row.family}</td><td>{row.size} / {row.weight}</td><td>{row.lineHeight} / {row.spacing}</td></tr>)}</tbody></table></div>    <section id="tokens" className={styles.section}><div className={styles.actions}><h3>Live token readings</h3><button type="button" onClick={() => setRefresh(current => current + 1)}>Refresh readings</button></div><p>Resolved from the document root, Home sample and client sample. “Not set” means that token is not defined in that sampled scope. Browser readings refresh on viewport and root-class changes; refresh manually after other CSS edits.</p><p className={styles.source} role="status">{measured ? `Last measured ${measured}` : 'Reading computed styles…'}</p><label className={styles.search}>Filter live tokens<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try --green or --cw-"/></label>
      <div className={styles.tableWrap}><table><caption>{tokens.length} matching tokens from the source inventory</caption><thead><tr><th>Token</th><th>Document root</th><th>Home scope</th><th>Client scope</th></tr></thead><tbody>{tokens.map(row => <tr key={row.name}><th><code>{row.name}</code></th><td><Value value={row.global}/></td><td><Value value={row.home}/></td><td><Value value={row.client}/></td></tr>)}</tbody></table></div>{!tokens.length && measured && <p>No matching tokens. Clear the filter to see all readings.</p>}
    </section>

    <details id="source-audit" className={styles.section}><summary>Expand source definitions and stylesheet inventory</summary><h3>Source audit and differences</h3><p>{inventory.files.length} CSS files, {inventory.names.length} unique custom-property names, {inventory.definitions.length} declarations. Snapshot <code>{inventory.sourceHash}</code>.</p><p><strong>{inventory.variants.length} names have more than one written value.</strong> This is a review list, not a count of CSS bugs. Module scopes, responsive rules, aliases and themes can explain differences. Resolve a conflict only after checking the affected component and state.</p><label className={styles.search}>Filter definitions<input value={auditQuery} onChange={event => { setAuditQuery(event.target.value); setAuditLimit(15); }} placeholder="Token, file or selector"/></label>
      <label className={styles.actions}><input type="checkbox" checked={showAllRepeated} onChange={event => { setShowAllRepeated(event.target.checked); setAuditLimit(15); }}/>Include repeated names with identical values</label>
      {variants.slice(0, auditLimit).map(item => <details className={styles.auditItem} key={item.name}><summary><code>{item.name}</code><span>{item.definitions.length} definitions</span></summary><ul>{item.definitions.map((row, index) => <li key={`${row.file}:${row.line}:${index}`}><code>{row.value}{row.important ? ' !important' : ''}</code><p>{row.module ? 'Scoped CSS module' : 'Global stylesheet'} · <code>{row.scope}</code></p><Source path={`${row.file}:${row.line}`}/></li>)}</ul></details>)}
      {!variants.length && <p>No matching differing definitions.</p>}{variants.length > auditLimit && <button type="button" onClick={() => setAuditLimit(current => current + 15)}>Show more definitions</button>}
      <details className={styles.auditItem}><summary>Stylesheet inventory</summary><ul>{inventory.files.map(file => <li key={file.path}><code>{file.path}</code><p>{file.lines} lines · {file.customProperties} token declarations · {file.hash}</p></li>)}</ul></details>
      <p>Coverage: checked-in CSS under src, including legacy styles. Tailwind utilities, inline styles, generated font declarations and JavaScript-only values are not fully inventoried. A runtime reading cannot prove that every route is consistent. An apparently unused component needs an import/route audit before deletion.</p>
    </details>

    <details className={styles.auditItem}><summary>R02 semantic token proposals and source mappings ({proposals.tokens.length})</summary><p>Reference for deliberate adoption. This catalogue is the design proposal, not live measurements or a claim of global migration. Compare it with the generated source inventory above.</p><div className={styles.tableWrap}><table><thead><tr><th>Proposed name</th><th>Reference value</th><th>Purpose / intended scope</th><th>Existing mappings</th></tr></thead><tbody>{proposals.tokens.map(token => <tr key={token.name}><th><code>{token.name}</code></th><td><code>{token.value}</code></td><td>{token.purpose}<br />{token.scope}</td><td>{token.currentMappings?.join(', ') || 'No current mapping'}</td></tr>)}</tbody></table></div><details><summary>Machine-readable reference</summary><pre className={styles.code}>{JSON.stringify(proposals.tokens, null, 2)}</pre></details></details></section>;
}
