'use client';
import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { BriefingSurface } from './briefing-surface';
import { ClientAction, ClientActionLink } from './client-action';
import home from '@/components/dashboard/home-dashboard-view.module.css';
import styles from './design-system-r02.module.css';
export const cx = (names: string) => names.split(/\s+/).map(name => styles[name] ?? name).join(' ');
export const specimenId = (name: string) => 's-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const actionStarter = `import { ClientAction, ClientActionLink } from '@/components/design-system/client-action';

// Inside the existing client-workspace-shell.
<ClientAction onClick={handleReview}>Review items</ClientAction>
<ClientAction variant="secondary" disabled={saving}>Save changes</ClientAction>
<ClientActionLink href={brainHref}>Open Brain</ClientActionLink>

// Subtle/destructive variants and size props remain r02 proposals.`;
export const pageStarter = `import { ClientAction } from '@/components/design-system/client-action';
import { BriefingSurface } from '@/components/design-system/briefing-surface';

// Reuse the existing global or client shell; it owns navigation offsets.
<section aria-labelledby="section-title">
  <header>
    <h2 id="section-title">Section title</h2>
    <p>Purpose and the decision this section supports.</p>
  </header>
  <ClientAction onClick={handleReview}>Review items</ClientAction>
</section>

// BriefingSurface takes children and section HTML attributes.
// Keep carousel content, callbacks and all-slide height reservation in the caller.
// PageColumn, Greeting and other prototype names are not shared imports yet.`;
/** Reusable library frame; viewport controls inspect a column, not a physical device. */
export function Specimen({ name, search, children }: {
    name: string;
    search: string;
    children: ReactNode;
}) {
    const [width, setWidth] = useState<string | undefined>();
    const [copied, setCopied] = useState('');
    const id = specimenId(name);
    const tools = <div className={cx('j-spec-tools')} aria-label={`${name} column preview`}>
   {['430', '390', '360'].map(w => <button type="button" key={w} className={cx('j-widthbtn')} aria-pressed={width === w} title={`Preview in a ${w}px column; not a device test`} onClick={() => setWidth(width === w ? undefined : w)}>{w}</button>)}
   <button type="button" className={cx('j-widthbtn')} aria-label={`Copy link to ${name}`} onClick={async () => { try {
        await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${id}`);
        setCopied('Link copied');
    }
    catch {
        setCopied('Copy unavailable');
    } }}>#</button><span className={cx('sr')} role="status">{copied}</span>
 </div>;
    return <article id={id} className={cx('j-spec')} data-search={search} data-name={name} data-width={width} tabIndex={-1}>
  {Children.map(children, child => {
            if (isValidElement<HTMLAttributes<HTMLDivElement>>(child) && child.props.className === cx('j-spec-head'))
                return cloneElement(child as ReactElement<HTMLAttributes<HTMLDivElement>>, {}, child.props.children, tools);
            return child;
        })}
 </article>;
}
const copy = [
    { lead: 'Review the next deliverable.', body: 'Use this sample to inspect the recommendation surface.' },
    { lead: 'Keep the briefing stable.', body: 'This longer demonstration reserves its space alongside the short version. Read the supporting context, inspect the action, and switch between both examples without changing the height of the green panel.' },
];
export function CurrentBriefing() {
    const [slide, setSlide] = useState(0);
    const [height, setHeight] = useState(0);
    const [result, setResult] = useState('');
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => { const node = box.current; if (!node)
        return; const observer = new ResizeObserver(() => setHeight(Math.round(node.getBoundingClientRect().height))); observer.observe(node); return () => observer.disconnect(); }, []);
    return <><div className={cx('j-row')} style={{ marginBottom: 12 }}><button type="button" className={cx('j-toggle')} onClick={() => setSlide(i => (i + 1) % copy.length)}>Switch sample copy</button><span className={cx('j-meta-body')}>Shared Home component · demo only</span></div>
 <div className={`${home.root} ${cx('currentHome')}`}><div ref={box} data-current-briefing><BriefingSurface aria-label="Current Home briefing surface"><span className={`${home.mono} ${home.heroEyebrow}`}>JARVIS / DEMO</span><div className={home.heroBodyStack}>{copy.map((c, i) => <p className={home.heroBody} aria-hidden={slide !== i} style={{ visibility: slide === i ? 'visible' : 'hidden' }} key={c.lead}><b>{c.lead}</b> {c.body}</p>)}</div><div className={cx('j-row')}><button type="button" className={home.heroCta} onClick={() => setResult('Review demonstrated. No record was changed.')}>Review example</button><button type="button" className={home.heroCtaGhost} onClick={() => setResult('Deferral demonstrated. No record was changed.')}>Later</button></div></BriefingSurface></div></div>
 <p className={cx('j-meta-body')} aria-live="polite">Measured height: {height || '—'}px · {result || 'Longest copy sets the reserved height.'}</p></>;
}
export function CurrentClientActions() { return <Specimen name="Shared client actions in use" search="current button link primary secondary client action source"><div className={cx('j-spec-head')}><span className={cx('j-spec-name')}>Shared client actions in use</span><span className={cx('j-status')}>Shared component</span></div><div className={cx('j-spec-canvas')}><div className="client-workspace-shell"><div className={cx('j-row')}><ClientAction>Primary example</ClientAction><ClientAction variant="secondary">Secondary example</ClientAction><ClientAction disabled>Unavailable</ClientAction><ClientActionLink href="/design-system#build">Link to page guidance</ClientActionLink></div></div></div><div className={cx('j-spec-meta')}><div><div className={cx('j-meta-label')}>Use when</div><p className={cx('j-meta-body')}>Building a client action in the existing client shell.</p></div><div><div className={cx('j-meta-label')}>Anatomy</div><p className={cx('j-meta-body')}>Native button or link; current primary/secondary variants. The expanded matrix remains a proposal.</p></div><div><div className={cx('j-meta-label')}>Source</div><code>src/components/design-system/client-action.tsx</code></div></div></Specimen>; }
