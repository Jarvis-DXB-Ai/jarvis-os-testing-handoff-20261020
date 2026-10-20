import styles from './design-system-r02.module.css';
/** Guide-only interactions. Scoped selectors and disposal keep navigation and product state untouched. */
export function mountDesignGuide(root: HTMLElement) {
    const abort = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const selector = (value: string) => value.replace(/\.([a-zA-Z][\w-]*)/g, (_, name: string) => '.' + (styles[name] ?? name));
    const one = <T extends HTMLElement = HTMLElement>(s: string, scope: ParentNode = root) => scope.querySelector<T>(selector(s));
    const all = <T extends HTMLElement = HTMLElement>(s: string, scope: ParentNode = root) => Array.from(scope.querySelectorAll<T>(selector(s)));
    const on = (target: EventTarget, type: string, handler: EventListener) => target.addEventListener(type, handler, { signal: abort.signal });
    const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); if (!abort.signal.aborted)
        fn(); }, ms); timers.add(id); };
    const frame = (fn: FrameRequestCallback) => { const id = requestAnimationFrame(t => { frames.delete(id); if (!abort.signal.aborted)
        fn(t); }); frames.add(id); };
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const search = one<HTMLInputElement>('#j-search-input');
    const sections = all('.j-section[data-group]');
    const nav = all('.j-nav .j-nav-item');
    const specs = all('.j-spec');
    let group = 'all';
    function filter() {
        const q = search?.value.trim().toLowerCase() ?? '';
        let total = 0;
        sections.forEach(section => { let found = 0; const cards = all('.j-spec', section); cards.forEach(card => { const hit = !q || `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(q); card.dataset.hidden = String(!hit); if (hit)
            found++; }); const visible = (group === 'all' || section.dataset.group === group) && (!q || (cards.length ? found > 0 : section.textContent?.toLowerCase().includes(q))); section.dataset.hidden = String(!visible); if (visible)
            total++; });
        nav.forEach(item => item.setAttribute('aria-current', String(item.dataset.group === group)));
        one('#j-no-results')?.setAttribute('data-hidden', String(total !== 0));
    }
    function toast(title: string, body = 'Demo only. No system record was changed.') {
        const host = one('#j-toast-host');
        if (!host || abort.signal.aborted)
            return;
        const box = document.createElement('div');
        box.className = styles['j-toast'];
        box.setAttribute('role', 'status');
        const titleNode = document.createElement('b');
        titleNode.textContent = title;
        const text = document.createElement('span');
        text.append(titleNode, document.createElement('br'), document.createTextNode(body));
        box.append(text);
        host.append(box);
        later(() => box.remove(), 3200);
    }
    on(root, 'submit', e => e.preventDefault());
    if (search)
        on(search, 'input', filter);
    nav.forEach(button => on(button, 'click', () => { group = button.dataset.group ?? 'all'; filter(); window.scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' }); }));
    let modal: HTMLElement | null = null;
    let modalHost: HTMLElement | null = null;
    let opener: HTMLElement | null = null;
    let restoreInert: Array<() => void> = [];
    const focusables = (host: HTMLElement) => all<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])', host).filter(el => el.getClientRects().length && !el.closest('[hidden],[inert]'));
    function closeModal() { if (!modal)
        return; const closing = modal; const host = modalHost!; if (host.id === 'j-palette')
        host.hidden = true;
    else {
        host.dataset.open = 'false';
        closing.inert = true;
    } closing.removeAttribute('aria-modal'); restoreInert.forEach(fn => fn()); restoreInert = []; modal = null; modalHost = null; opener?.focus(); }
    function openModal(host: HTMLElement) {
        if (modal)
            closeModal();
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (host.id === 'j-drawer') {
            group = 'all';
            if (search)
                search.value = '';
            filter();
            host.scrollIntoView({ block: 'center' });
        }
        host.hidden = false;
        host.dataset.open = 'true';
        const dialog = host.id === 'j-drawer' ? one('.j-drawer', host)! : host;
        dialog.inert = false;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        if (!dialog.getAttribute('aria-label'))
            dialog.setAttribute('aria-label', host.id === 'j-palette' ? 'Jump to a specimen' : 'Drawer demonstration');
        modal = dialog;
        modalHost = host;
        let node: HTMLElement | null = dialog;
        while (node && node !== root) {
            const parent: HTMLElement | null = node.parentElement;
            if (!parent)
                break;
            for (const sibling of Array.from(parent.children)) {
                if (sibling !== node && sibling instanceof HTMLElement) {
                    const was = sibling.inert;
                    sibling.inert = true;
                    restoreInert.push(() => { sibling.inert = was; });
                }
            }
            node = parent;
        }
        const first = focusables(dialog)[0];
        if (first)
            first.focus();
        else {
            dialog.tabIndex = -1;
            dialog.focus();
        }
    }
    all('.j-drawer').forEach(drawer => drawer.inert = true);
    const palette = one('#j-palette');
    const paletteInput = one<HTMLInputElement>('#j-palette-input');
    const paletteList = one('#j-palette-list');
    let palIndex = 0;
    let palRows: HTMLElement[] = [];
    function jump(target: HTMLElement) { closeModal(); group = 'all'; if (search)
        search.value = ''; filter(); target.scrollIntoView({ block: 'start', behavior: reduced() ? 'instant' : 'smooth' }); target.focus({ preventScroll: true }); history.replaceState(null, '', '#' + target.id); }
    function renderPalette() {
        if (!paletteList)
            return;
        const q = paletteInput?.value.toLowerCase().trim() ?? '';
        palRows = specs.filter(s => `${s.dataset.name} ${s.dataset.search}`.toLowerCase().includes(q));
        palIndex = Math.max(0, Math.min(palIndex, palRows.length - 1));
        paletteList.replaceChildren();
        if (!palRows.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No matching specimens.';
            paletteList.append(empty);
            return;
        }
        palRows.forEach((spec, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = styles['j-palette-item']; b.dataset.selected = String(i === palIndex); b.textContent = spec.dataset.name ?? 'Specimen'; b.id = `guide-result-${i}`; b.addEventListener('click', () => jump(spec), { signal: abort.signal }); paletteList.append(b); });
        paletteList.children[palIndex]?.scrollIntoView({ block: 'nearest' });
    }
    function openPalette() { if (!palette)
        return; if (paletteInput)
        paletteInput.value = ''; palIndex = 0; renderPalette(); openModal(palette); }
    if (paletteInput)
        on(paletteInput, 'input', () => { palIndex = 0; renderPalette(); });
    on(document, 'keydown', e => {
        const event = e as KeyboardEvent;
        if (document.querySelector('dialog[open]')) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            if (modal === palette)
                closeModal();
            else
                openPalette();
            return;
        }
        if (event.key === 'Escape' && modal) {
            event.preventDefault();
            closeModal();
            return;
        }
        if (modal && event.key === 'Tab') {
            const list = focusables(modal);
            const first = list[0], last = list.at(-1);
            if (!first) {
                event.preventDefault();
                modal.focus();
            }
            else if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        }
        if (modal === palette && event.target === paletteInput) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                palIndex = Math.max(0, Math.min(palRows.length - 1, palIndex + (event.key === 'ArrowDown' ? 1 : -1)));
                renderPalette();
            }
            else if (event.key === 'Enter' && palRows[palIndex]) {
                event.preventDefault();
                jump(palRows[palIndex]);
            }
        }
    });
    let focusLayer: HTMLElement | null = null;
    function drawFocus() { if (!focusLayer)
        return; focusLayer.replaceChildren(); focusables(root).filter(el => !el.closest(selector('.j-palette-scrim'))).forEach((el, i) => { const rect = el.getBoundingClientRect(); if (rect.bottom < 0 || rect.top > innerHeight)
        return; const badge = document.createElement('span'); badge.className = styles['j-focus-badge']; badge.style.left = rect.left + 'px'; badge.style.top = Math.max(0, rect.top - 8) + 'px'; badge.textContent = String(i + 1); focusLayer!.append(badge); }); }
    function setToggle(button: HTMLElement) { const active = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(active)); return active; }
    const stress = new Map<HTMLElement, string>();
    function replay(target: HTMLElement) { target.getAnimations({ subtree: true }).forEach(animation => { animation.cancel(); if (!reduced())
        animation.play(); }); const counters = target.matches('[data-count-to]') ? [target] : all('[data-count-to]', target); counters.forEach(countUp); }
    function countUp(el: HTMLElement) { const to = Number(el.dataset.countTo ?? 0); if (reduced()) {
        el.textContent = to.toLocaleString();
        return;
    } const start = performance.now(); const duration = Number(el.dataset.countDur ?? 900); const tick = (now: number) => { const p = Math.min(1, (now - start) / duration); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1)
        frame(tick); }; frame(tick); }
    on(root, 'click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-r03]')) return;
        const button = target?.closest<HTMLElement>('button,a,[data-drawer-toggle],[data-tabs]');
        if (target === palette) {
            closeModal();
            return;
        }
        if (!button || !root.contains(button))
            return;
        if (button.hasAttribute('data-open-palette')) {
            openPalette();
            return;
        }
        if (button.hasAttribute('data-drawer-toggle')) {
            const host = one(button.dataset.drawerToggle!);
            if (host) {
                if (modalHost === host)
                    closeModal();
                else
                    openModal(host);
            }
            return;
        }
        if (button.id === 'j-top') {
            scrollTo({ top: 0, behavior: reduced() ? 'instant' : 'smooth' });
            return;
        }
        if (button.id === 'j-t-density') {
            const active = setToggle(button);
            root.dataset.density = active ? 'compact' : 'comfortable';
            return;
        }
        if (button.id === 'j-t-grid') {
            const active = setToggle(button);
            if (active)
                root.style.setProperty('--j-texture-dot', 'radial-gradient(rgba(255,255,255,.14) 1px, transparent 1px)');
            else
                root.style.removeProperty('--j-texture-dot');
            return;
        }
        if (button.id === 'j-t-focus') {
            if (setToggle(button)) {
                focusLayer = document.createElement('div');
                focusLayer.className = styles['j-focus-layer'];
                focusLayer.setAttribute('aria-hidden', 'true');
                root.append(focusLayer);
                drawFocus();
            }
            else {
                focusLayer?.remove();
                focusLayer = null;
            }
            return;
        }
        if (button.id === 'j-t-stress') {
            if (setToggle(button)) {
                all('.j-card-title,.j-clientName', root).forEach(el => { stress.set(el, el.textContent ?? ''); el.textContent = (el.textContent ?? '') + ' — a deliberately longer demonstration label for regional operations'; });
            }
            else {
                stress.forEach((value, el) => { el.textContent = value; });
                stress.clear();
            }
            return;
        }
        if (button.hasAttribute('data-force-set')) {
            const host = button.closest(selector('[data-force-group]'));
            if (host) {
                all('[data-force-set]', host).forEach(b => b.setAttribute('aria-pressed', String(b === button)));
                all('[data-force-target]', host).forEach(t => { if (button.dataset.forceSet === 'none')
                    t.removeAttribute('data-force');
                else
                    t.dataset.force = button.dataset.forceSet; });
            }
            return;
        }
        if (button.hasAttribute('data-copy')) {
            const source = button.dataset.copy ? one(button.dataset.copy) : null;
            navigator.clipboard?.writeText(source?.textContent ?? button.dataset.copyText ?? '').then(() => toast('Copied', 'Snippet copied to clipboard.'), () => toast('Copy unavailable', 'Select the code in the disclosure instead.'));
            if (!navigator.clipboard)
                toast('Copy unavailable', 'Select the code in the disclosure instead.');
            return;
        }
        if (button.hasAttribute('data-load-demo')) {
            const panel = one(button.dataset.loadDemo!);
            if (panel) {
                panel.dataset.state = 'loading';
                button.setAttribute('aria-busy', 'true');
                button.setAttribute('disabled', '');
                later(() => { panel.dataset.state = 'ready'; button.removeAttribute('aria-busy'); button.removeAttribute('disabled'); }, 1500);
            }
            return;
        }
        if (button.hasAttribute('data-replay')) {
            all(button.dataset.replay!).forEach(replay);
            return;
        }
        if (button.matches(selector('.j-tab'))) {
            const host = button.closest('[data-tabs]');
            if (host) {
                all('.j-tab', host).forEach(t => { const active = t === button; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; });
                all('[data-tabpanel]', host).forEach(p => { const active = p.dataset.tabpanel === button.dataset.tab; p.dataset.hidden = String(!active); p.hidden = !active; });
            }
            return;
        }
        if (button.hasAttribute('data-toast')) {
            toast(button.dataset.toast!, button.dataset.toastBody);
            return;
        }
        if (button.tagName === 'A' && button.getAttribute('href')?.startsWith('#')) {
            const id = button.getAttribute('href')!.slice(1);
            const anchor = all('[id]').find(el => el.id === id);
            if (anchor) {
                event.preventDefault();
                jump(anchor);
                return;
            }
        }
        // Other visual specimen buttons demonstrate an action without pretending to save or execute.
        if (button.tagName === 'BUTTON' && button.closest(selector('.j-spec-canvas')) && !button.closest('[data-current-briefing]') && button.textContent !== 'Switch sample copy')
            toast('Example action');
    });
    all('[data-tabs]').forEach(host => { const tabs = all('.j-tab', host); tabs.forEach((tab, i) => { const id = `guide-tab-${i}-${host.getAttribute('id') ?? all('[data-tabs]').indexOf(host)}`; tab.id = id; tab.setAttribute('role', 'tab'); tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; const panel = all('[data-tabpanel]', host).find(p => p.dataset.tabpanel === tab.dataset.tab); if (panel) {
        panel.id = id + '-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', id);
        tab.setAttribute('aria-controls', panel.id);
    } }); on(host, 'keydown', e => { const event = e as KeyboardEvent; const i = tabs.indexOf(event.target as HTMLElement); if (i < 0)
        return; const next = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) {
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
    } }); });
    all('.j-dropzone').forEach(dz => { dz.tabIndex = 0; dz.setAttribute('role', 'button'); dz.setAttribute('aria-label', 'Demonstration dropzone; no files are uploaded'); ['dragenter', 'dragover'].forEach(type => on(dz, type, e => { e.preventDefault(); dz.dataset.over = 'true'; })); ['dragleave', 'drop'].forEach(type => on(dz, type, e => { e.preventDefault(); dz.dataset.over = 'false'; if (type === 'drop')
        toast('Demo only', 'No file was read or uploaded.'); })); on(dz, 'click', () => toast('Demo only', 'No file was read or uploaded.')); on(dz, 'keydown', e => { const k = e as KeyboardEvent; if (['Enter', ' '].includes(k.key)) {
        k.preventDefault();
        toast('Demo only', 'No file was read or uploaded.');
    } }); });
    // Each contrast badge describes a resolved colour pair, not a complete accessibility audit.
    const luminance = (rgb: number[]) => rgb.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const parse = (color: string) => { const probe = document.createElement('span'); probe.style.color = color; root.append(probe); const channels = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number); probe.remove(); return channels?.length === 3 ? channels : null; };
    all('.j-swatch-row').forEach(row => { const chip = one('.j-swatch', row) ?? one('.j-swatch-chip', row); const text = one('.j-swatch-val', row); const host = one('.j-swatch-use', row); const foreground = chip ? getComputedStyle(chip).backgroundColor : text?.textContent; const background = row.dataset.on ?? getComputedStyle(root).getPropertyValue('--j-ink'); if (!foreground || !host)
        return; const a = parse(foreground), b = parse(background); if (!a || !b)
        return; const l1 = luminance(a), l2 = luminance(b); const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); const badge = document.createElement('span'); badge.dataset.generatedContrast = ''; badge.className = styles['j-ratio']; badge.textContent = `${ratio.toFixed(1)}:1 · ${ratio >= 4.5 ? 'body' : ratio >= 3 ? 'large only' : 'decoration'}`; badge.title = `Sample colour pair against ${background}; not a per-surface audit`; host.append(badge); });
    function scroll() { one('.j-head')?.setAttribute('data-condensed', String(scrollY > 90)); const progress = one('.j-progress span'); if (progress)
        progress.style.width = reduced() ? '0%' : `${Math.max(0, Math.min(100, scrollY / (document.documentElement.scrollHeight - innerHeight || 1) * 100))}%`; one('#j-top')?.setAttribute('data-shown', String(scrollY > 600)); let current = ''; sections.forEach(s => { const b = s.getBoundingClientRect(); if (b.top < innerHeight * .35 && b.bottom > innerHeight * .35)
        current = s.dataset.group ?? ''; }); nav.forEach(n => n.dataset.inview = String(n.dataset.group === current)); drawFocus(); }
    on(window, 'scroll', scroll);
    on(window, 'resize', scroll);
    on(window, 'hashchange', () => { const id = location.hash.slice(1); const target = all('[id]').find(el => el.id === id); if (target)
        jump(target); });
    all('[data-count-to]').forEach(countUp);
    filter();
    scroll();
    const target = all('[id]').find(el => el.id === location.hash.slice(1));
    if (target)
        later(() => jump(target), 100);
    root.dataset.ready = 'true';
    return () => { delete root.dataset.ready; abort.abort(); timers.forEach(clearTimeout); frames.forEach(cancelAnimationFrame); closeModal(); focusLayer?.remove(); all('[data-generated-contrast]').forEach(el => el.remove()); one('#j-toast-host')?.replaceChildren(); stress.forEach((text, el) => { el.textContent = text; }); root.removeAttribute('data-density'); root.style.removeProperty('--j-texture-dot'); };
}
