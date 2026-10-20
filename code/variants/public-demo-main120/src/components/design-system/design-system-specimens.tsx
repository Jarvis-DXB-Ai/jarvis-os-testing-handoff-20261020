// R02 specimens adapted from Claude Design; editable React source, not an embedded HTML page.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Specimen, CurrentBriefing, pageStarter, actionStarter, CurrentClientActions, cx } from './design-system-parts';
import { DesignSystemR03 } from './design-system-r03';
import { LiveDesignAudit } from './design-system-live-audit';
export function DesignSystemSpecimens() {
    return <>

    <header className={cx("j-head")}>
    <div className={cx("j-head-in")}>
    <div className={cx("j-eyebrow")}>{"Build / Internal reference"}</div>
    <div className={cx("j-title-row")}>
    <h1 className={cx("j-title")}>{"Jarvis "}<b>{"design system"}</b></h1>
    <div className={cx("j-title-meta")}><span className={cx("j-status")}>R03 / Internal library</span><Link className={cx("j-btn")} data-variant="secondary" data-size="sm" href="/system-operations">System Operations</Link><a className={cx("j-btn")} data-variant="secondary" data-size="sm" href="#composition">Build a page</a><a className={cx("j-btn")} data-variant="secondary" data-size="sm" href="#r03-workflows">Explore r03</a></div>
    </div>
    <p className={cx("j-head-sub j-duo")}>{"Find a "}<b>{"pattern"}</b>{", see "}<b>{"when to use it"}</b>{", inspect its "}<b>{"states"}</b>{", copy what you need. Examples marked "}<b>{"shared"}</b>{" use actual imported components; R02 reference examples document the design direction. "}<b>{"proposed"}</b>{" ones are design proposals, while R03 guide demos are interactive examples with no product writes."}</p>
    <div className={cx("j-head-tools")}>
    <nav className={cx("j-nav")} aria-label="Library sections">
    <button className={cx("j-nav-item")} data-group="all" type="button">{"All"}</button>
    <button className={cx("j-nav-item")} data-group="r03" type="button">R03 additions</button>
    <button className={cx("j-nav-item")} data-group="foundations" type="button">{"Foundations"}</button>
    <button className={cx("j-nav-item")} data-group="components" type="button">{"Components"}</button>
    <button className={cx("j-nav-item")} data-group="primitives" type="button">{"Primitives"}</button>
    <button className={cx("j-nav-item")} data-group="states" type="button">{"States"}</button>
    <button className={cx("j-nav-item")} data-group="motion" type="button">{"Motion"}</button>
    <button className={cx("j-nav-item")} data-group="patterns" type="button">{"Patterns"}</button>
    <button className={cx("j-nav-item")} data-group="audit" type="button">{"Tokens & audit"}</button>
    </nav>
    <label className={cx("j-search")}>
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"></circle><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"></path></svg>
    <span className={cx("sr")}>{"Search the library"}</span>
    <input id="j-search-input" type="search" placeholder="Search patterns, states, tokens" autoComplete="off"/>
    </label>
    </div>
    <div className={cx("j-inspect")}>
    <span className={cx("j-inspect-label")}>{"Inspect"}</span>
    <button className={cx("j-toggle")} id="j-t-focus" type="button" aria-pressed="false" title="Number every focusable element in DOM order">{"Focus order"}</button>
    <button className={cx("j-toggle")} id="j-t-stress" type="button" aria-pressed="false" title="Swap sample names for worst-case lengths">{"Long labels"}</button>
    <button className={cx("j-toggle")} id="j-t-density" type="button" aria-pressed="false" title="Shrink the spacing ramp">{"Compact"}</button>
    <button className={cx("j-toggle")} id="j-t-grid" type="button" aria-pressed="false" title="Raise the dot lattice so the texture is visible">{"Show texture"}</button>
    <button className={cx("j-toggle")} type="button" data-open-palette="true" title="Jump to any specimen">{"Jump to … "}<span className={cx("j-kbd")}>{"⌘K"}</span></button>
    </div>
    <div className={cx("j-head-rule")}></div>
    <div className={cx("j-progress")} aria-hidden="true"><span></span></div>
    </div>
    </header>
    <div className={cx("j-page")}>
    <aside className={cx("j-notice")}><span className={cx("j-notice-mark")} aria-hidden="true">i</span><span><b>Jarvis’s working design library.</b> These examples use demo content. Shared components and live readings are identified; proposed styles are examples to adopt deliberately, not changes already applied across the app. Update this library alongside new components.</span></aside>
    <p id="j-no-results" className={cx("j-nores")} data-hidden="true">{"No pattern matches that search."}</p>

    <section className={cx("j-section")} data-group="foundations" id="foundations">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"01"}</span>
    <h2 className={cx("j-section-title")}>{"Foundations"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/01"}</span>
    <span className={cx("j-status")}>{"R02 reference values"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"Geist for prose and headings, Geist Mono for labels, identifiers and figures-as-data. Every type role below has one job; if a new screen needs a size that is not here, that is a system decision, not a local one."}</p>
    <Specimen name="Type roles" search="typography type scale roles geist mono heading figure label">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Type roles"}</span>
    <span className={cx("j-paren")}>{"seven roles"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    <div className={cx("j-spec-head-tools")}>
    <button className={cx("j-btn")} data-variant="subtle" data-size="sm" type="button" data-copy="#code-type" data-copy-label="Type role CSS copied.">{"Copy CSS"}</button>
    </div>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Greeting · 46 / 200 / -.045em"}</div>
    <div className={cx("j-type-sample")}><div className={cx("j-t-greeting")} data-type-sample="Greeting">{"A clear "}<b>{"workspace."}</b></div></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Section title · 22 / 500 / -.026em"}</div>
    <div className={cx("j-type-sample")}><div className={cx("j-t-section")} data-type-sample="Section">{"Finance"}</div></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Figure · 44 / 200 / tabular"}</div>
    <div className={cx("j-type-sample")}><div className={cx("j-t-figure")} data-type-sample="Figure">{"48,200"}</div></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Body · 16 / 400 / 1.5"}</div>
    <div className={cx("j-type-sample")}><p className={cx("j-t-body")} data-type-sample="Body">{"Use concise copy that explains the next decision."}</p></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Meta · 13 / 400"}</div>
    <div className={cx("j-type-sample")}><p className={cx("j-t-meta")}>{"Supporting context, secondary to the value above it."}</p></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Label · mono 10 / .16em / upper"}</div>
    <div className={cx("j-type-sample")}><div className={cx("j-t-label")} data-type-sample="Label">{"Section / label"}</div></div>
    </div>
    <div className={cx("j-type-row")}>
    <div className={cx("j-type-spec")}>{"Identifier · mono 12"}</div>
    <div className={cx("j-type-sample")}><div className={cx("j-t-id")} data-type-sample="Identifier">{"CLI-0421 · 2026-09-06"}</div></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"One greeting per page. One section title per section. Figures only for a real measured value — never for a count that is unknown."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rules"}</div><p className={cx("j-meta-body")}>{"Mono is reserved for labels, IDs, dates, token names and code. Prose never uses mono. Body text never goes below 13px."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"src/app/layout.tsx"}</code>{" + "}<code>{"home-dashboard-view.module.css"}</code>{" (.greetHeading, .sectionTitle, .figure)"}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"CSS"}</summary>
    <pre className={cx("j-code")} id="code-type">{"/* Proposed role names; values are the current Home measurements. */\n--j-type-greeting: 200 46px/1.02 var(--j-sans); letter-spacing: -.045em;\n--j-type-section:  500 22px/1.2  var(--j-sans); letter-spacing: -.026em;\n--j-type-figure:   200 44px/.88  var(--j-sans); letter-spacing: -.045em;\n--j-type-body:     400 16px/1.5  var(--j-sans);\n--j-type-meta:     400 13px/1.45 var(--j-sans);\n--j-type-label:    400 10px/1.2  var(--j-mono); letter-spacing: .16em; text-transform: uppercase;\n--j-type-id:       400 12px/1.4  var(--j-mono);"}</pre>
    </details>
    </Specimen>
    <Specimen name="Colour roles" search="colour color roles green amber red signal surface text">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Colour roles"}</span>
    <span className={cx("j-paren")}>{"no new hues"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed naming"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-sub")} style={{ "marginTop": "0" } as CSSProperties}>{"Surfaces"}</div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#08080A" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-ink"}</span><span className={cx("j-swatch-val")}>{"#08080A"}</span><span className={cx("j-swatch-use")}>{"Page ground. Also the specimen canvas."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#0A0A0C" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-panel"}</span><span className={cx("j-swatch-val")}>{"#0A0A0C"}</span><span className={cx("j-swatch-use")}>{"Lists, lanes, rows sitting on the page."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#0C0C0E" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-panel-2"}</span><span className={cx("j-swatch-val")}>{"#0C0C0E"}</span><span className={cx("j-swatch-use")}>{"Cards and metadata strips."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#101013" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-raised"}</span><span className={cx("j-swatch-val")}>{"#101013"}</span><span className={cx("j-swatch-use")}>{"Anything floating: toast, tooltip, drag card, icon button."}</span></div>
    <div className={cx("j-sub")}>{"Ink"}</div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#F5F5F6" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-text"}</span><span className={cx("j-swatch-val")}>{"#F5F5F6"}</span><span className={cx("j-swatch-use")}>{"Titles, values, active labels."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#C9C9CF" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-text-2"}</span><span className={cx("j-swatch-val")}>{"#C9C9CF"}</span><span className={cx("j-swatch-use")}>{"Body copy inside components."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#A1A1A6" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-text-3"}</span><span className={cx("j-swatch-val")}>{"#A1A1A6"}</span><span className={cx("j-swatch-use")}>{"Smallest readable text. Proposed floor for anything a person must read."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#8A8A91" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-text-4"}</span><span className={cx("j-swatch-val")}>{"#8A8A91"}</span><span className={cx("j-swatch-use")}>{"Eyebrows and mono labels."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#46464C" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-text-dis"}</span><span className={cx("j-swatch-val")}>{"#46464C"}</span><span className={cx("j-swatch-use")}>{"Disabled text and the no-value dash. Never body copy."}</span></div>
    <div className={cx("j-sub")}>{"Signals — one meaning each"}</div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#4ADE80" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-recommend"}</span><span className={cx("j-swatch-val")}>{"#4ADE80"}</span><span className={cx("j-swatch-use")}>{"Jarvis is recommending or affirming. Primary action."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#22C55E" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-done"}</span><span className={cx("j-swatch-val")}>{"#22C55E"}</span><span className={cx("j-swatch-use")}>{"Completed work."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#4DA3FF" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-verified"}</span><span className={cx("j-swatch-val")}>{"#4DA3FF"}</span><span className={cx("j-swatch-use")}>{"Reviewed and accepted — one step past completed. Blue, so completed and reviewed cannot be confused."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#F0B24A" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-progress"}</span><span className={cx("j-swatch-val")}>{"#F0B24A"}</span><span className={cx("j-swatch-use")}>{"In progress, needs attention, adjustment pending."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#F0564B" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-critical"}</span><span className={cx("j-swatch-val")}>{"#F0564B"}</span><span className={cx("j-swatch-use")}>{"Failure, overdue, destructive."}</span></div>
    <div className={cx("j-swatch-row")}><span className={cx("j-swatch")} style={{ "background": "#8A8A91" } as CSSProperties}></span><span className={cx("j-swatch-name")}>{"--j-idle"}</span><span className={cx("j-swatch-val")}>{"#8A8A91"}</span><span className={cx("j-swatch-use")}>{"Not started, unknown, untracked."}</span></div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Colour carries product state only. Documentation metadata, section chrome and navigation stay neutral — that is why every badge on this page is grey."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Why blue for reviewed"}</div><p className={cx("j-meta-body")}>{"Completed and reviewed are different facts, and two greens two shades apart cannot be told apart at 7px on a lane accent. Blue reads as “checked by a person” and is the only non-brand hue in the set."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Current mapping"}</div><p className={cx("j-meta-body")}>{"Home "}<code>{"--green/--green2/--greenDeep/--amber/--red"}</code>{"; shell "}<code>{"--cw-green/--cw-core/--cw-amber/--cw-red"}</code>{". See "}<code>{"TOKEN-PROPOSALS.json"}</code>{"."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Space and radius" search="spacing space scale radius corner geometry">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Space and radius"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed scale"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-t-label")}>{"Space ramp — 4 · 6 · 8 · 10 · 12 · 14 · 18 · 22 · 26 · 34"}</div>
    <div className={cx("j-ruler")} style={{ "marginTop": "14px" } as CSSProperties}>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "4px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"4"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "6px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"6"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "8px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"8"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "10px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"10"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "12px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"12"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "14px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"14"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "18px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"18"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "22px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"22"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "26px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"26"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-ruler-bar")} style={{ "width": "34px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"34"}</span></div>
    </div>
    <div className={cx("j-t-label")} style={{ "marginTop": "26px" } as CSSProperties}>{"Radius — size decides the corner"}</div>
    <div className={cx("j-ruler")} style={{ "marginTop": "14px" } as CSSProperties}>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "8px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"8 · tag"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "11px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"11 · control"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "14px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"14 · row"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "17px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"17 · card"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "20px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"20 · surface"}</span></div>
    <div className={cx("j-ruler-item")}><span className={cx("j-radius-box")} style={{ "borderRadius": "999px" } as CSSProperties}></span><span className={cx("j-swatch-val")}>{"999 · pill"}</span></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Component padding uses 12–22. Gaps between siblings use 8–12. Section rhythm uses 26–34."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Nested corners step down by one stop: a 17px card holds a 11px control, never another 17."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"Home uses 2px-resolution values (e.g. 11px, 17px). The ramp records that reality instead of forcing an 8pt grid."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Layout grid" search="grid layout columns gutters twelve column rhythm">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Layout grid"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-demo")}>
    <span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span>
    <span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span>
    <span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span>
    <span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span><span className={cx("j-grid-col")}></span>
    </div>
    <div className={cx("j-grid-demo")} style={{ "marginTop": "12px" } as CSSProperties}>
    <span className={cx("j-grid-span")} style={{ "gridColumn": "span 6" } as CSSProperties}>{"6 · lead"}</span>
    <span className={cx("j-grid-span")} style={{ "gridColumn": "span 3" } as CSSProperties}>{"3"}</span>
    <span className={cx("j-grid-span")} style={{ "gridColumn": "span 3" } as CSSProperties}>{"3"}</span>
    </div>
    <div className={cx("j-grid-demo")} style={{ "marginTop": "12px" } as CSSProperties}>
    <span className={cx("j-grid-span")} style={{ "gridColumn": "span 8" } as CSSProperties}>{"8 · content"}</span>
    <span className={cx("j-grid-span")} style={{ "gridColumn": "span 4" } as CSSProperties}>{"4 · rail"}</span>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Twelve columns, 12px gutters, no visible rules. Cards claim 4/4/4, 6/3/3 or 8/4; content plus rail is 8/4. Nothing sits on a half column."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"The grid is felt, not drawn. If a layout needs a visible divider to make sense, the spacing is wrong."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Responsive"}</div><p className={cx("j-meta-body")}>{"Twelve columns down to 700px, then six, then a single stack below 560px. Column counts change; gutters do not."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Depth: hairlines, not shadows" search="elevation border hairline shadow depth glow bloom">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Depth: hairlines, not shadows"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-3")}>
    <div className={cx("j-card")}><div className={cx("j-card-title")}>{"Hairline"}</div><p className={cx("j-card-note")}>{"1px rgba(255,255,255,.075). The default separation for every static panel."}</p></div>
    <div className={cx("j-card")}><div className={cx("j-card-title")}>{"Texture"}</div><p className={cx("j-card-note")}>{"A 1px dot lattice at 18px, 5.5% white, on specimen and canvas grounds. Depth without a border."}</p></div>
    <div className={cx("j-card")} style={{ "boxShadow": "0 22px 44px -18px rgba(0,0,0,.9)" } as CSSProperties}><div className={cx("j-card-title")}>{"Float"}</div><p className={cx("j-card-note")}>{"Shadow only when the element actually floats: drag card, toast, drawer, tooltip."}</p></div>
    <div className={cx("j-card")} data-accent="true" style={{ "boxShadow": "0 24px 50px -26px rgba(34,197,94,.5)" } as CSSProperties}><div className={cx("j-card-title")}>{"Green bloom"}</div><p className={cx("j-card-note")}>{"Reserved for the briefing surface. One per view."}</p></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Separation first, then a background step, then a border. Shadow last."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Don't"}</div><p className={cx("j-meta-body")}>{"No drop shadow on cards in a grid; it reads as a modal."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"--hair"}</code>{", "}<code>{"--hair2"}</code>{", "}<code>{".taskRowOverlay"}</code>{", "}<code>{".hero"}</code></p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="components" id="actions"><span id="components"/>
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"02"}</span>
    <h2 className={cx("j-section-title")}>{"Actions"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/02"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"One primary action per decision. Everything else is secondary or subtle. Destructive is a proposal: the application has irreversible actions with no distinct treatment today."}</p>
    <CurrentClientActions /><Specimen name="Button variants" search="button variants primary secondary subtle destructive link action">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Button variants"}</span>
    <span className={cx("j-paren")}>{"6 variants · 3 sizes"}</span>
    <span className={cx("j-status")}>{"Current + proposed"}</span>
    <div className={cx("j-spec-head-tools")}>
    <button className={cx("j-btn")} data-variant="subtle" data-size="sm" type="button" data-copy="#code-action" data-copy-label="Action markup copied.">{"Copy example"}</button>
    </div>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-row")}>
    <button className={cx("j-btn")} data-variant="primary" type="button">{"Approve change"}</button>
    <button className={cx("j-btn")} data-variant="secondary" type="button">{"Open brief"}</button>
    <button className={cx("j-btn")} data-variant="subtle" type="button">{"Dismiss"}</button>
    <button className={cx("j-btn")} data-variant="destructive" type="button">{"Delete draft"}</button>
    <button className={cx("j-link")} type="button">{"Inline link action"}</button>
    </div>
    <div className={cx("j-row")} style={{ "marginTop": "22px" } as CSSProperties}>
    <button className={cx("j-btn")} data-variant="primary" data-size="sm" type="button">{"Small"}</button>
    <button className={cx("j-btn")} data-variant="primary" type="button">{"Default"}</button>
    <button className={cx("j-btn")} data-variant="primary" data-size="lg" type="button">{"Large"}</button>
    <span className={cx("j-tip-wrap")}>
    <button className={cx("j-icon-btn")} type="button" aria-label="Previous month">{"‹"}</button>
    <span className={cx("j-tip")} role="tooltip">{"Previous month"}</span>
    </span>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"10/16 padding, radius 11, 13px semibold, gap 6 to a 12px icon. Small 6/11 · 11.5px, large 13/20 · 14px radius 14. Minimum touch target 44px on mobile via a padded wrapper, not a bigger button."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Text rules"}</div><p className={cx("j-meta-body")}>{"Verb first, no trailing punctuation, two to four words. Never \"Click here\". Loading label keeps the verb and adds nothing."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"design-system/client-action.tsx"}</code>{" + "}<code>{"client-action.module.css"}</code>{"; "}<code>{"globals.css"}</code> <code>{".client-workspace-primary/secondary"}</code></p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"Markup"}</summary>
    <pre className={cx("j-code")} id="code-action">{actionStarter}</pre>
    </details>
    </Specimen>
    <Specimen name="Action states" search="states hover focus active disabled loading matrix keyboard">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Action states"}</span>
    <span className={cx("j-status")}>{"R02 example states"}</span>
    </div>
    <div className={cx("j-spec-canvas")} data-flush="true" data-force-group="true">
    <div className={cx("j-row")} data-gap="sm" style={{ "padding": "14px 16px", "borderBottom": "1px solid var(--j-hair)" } as CSSProperties}>
    <span className={cx("j-t-label")}>{"Force state"}</span>
    <button className={cx("j-nav-item")} type="button" data-force-set="none" aria-pressed="true">{"Rest"}</button>
    <button className={cx("j-nav-item")} type="button" data-force-set="hover">{"Hover"}</button>
    <button className={cx("j-nav-item")} type="button" data-force-set="focus">{"Focus ring"}</button>
    <button className={cx("j-nav-item")} type="button" data-force-set="active">{"Active"}</button>
    </div>
    <div className={cx("j-matrix")}>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Primary"}</span><button className={cx("j-btn")} data-variant="primary" data-force-target="true" type="button">{"Approve"}</button></div>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Secondary"}</span><button className={cx("j-btn")} data-variant="secondary" data-force-target="true" type="button">{"Open brief"}</button></div>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Subtle"}</span><button className={cx("j-btn")} data-variant="subtle" data-force-target="true" type="button">{"Dismiss"}</button></div>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Destructive"}</span><button className={cx("j-btn")} data-variant="destructive" data-force-target="true" type="button">{"Delete"}</button></div>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Disabled"}</span><button className={cx("j-btn")} data-variant="primary" type="button" disabled={true}>{"Approve"}</button><span className={cx("j-meta-body")} style={{ "fontSize": "11.5px" } as CSSProperties}>{"Always paired with a reason in the real workflow."}</span></div>
    <div className={cx("j-matrix-cell")}><span className={cx("j-matrix-label")}>{"Loading"}</span><button className={cx("j-btn")} data-variant="primary" type="button" aria-busy="true"><span className={cx("j-spinner")} aria-hidden="true"></span>{"Approve"}</button><span className={cx("j-meta-body")} style={{ "fontSize": "11.5px" } as CSSProperties}>{"Width is held by the label; the spinner replaces the icon slot."}</span></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Focus"}</div><p className={cx("j-meta-body")}>{"2px "}<code>{"#4ADE80"}</code>{" outline, 3–4px offset, on "}<code>{":focus-visible"}</code>{" only. Never removed, never replaced by a colour change alone."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Motion"}</div><p className={cx("j-meta-body")}>{"160ms ease on background, border and colour. No transform on press. Reduced motion removes the transition and the spinner animation."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"The toggle above forces the visual state so it can be inspected in a screenshot; real hover and focus still work on every control."}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="components" id="signals">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"03"}</span>
    <h2 className={cx("j-section-title")}>{"Signal surfaces"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/03"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"The gradient briefing surface is the voice of Jarvis making a recommendation. It is the single loudest element in the product, so it appears once per view and never carries a warning or an error. Those get flat tinted panels."}</p>
    <Specimen name="Briefing surface — recommendation" search="briefing surface green gradient recommendation hero grain sheen height">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Briefing surface — recommendation"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <CurrentBriefing />

    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Jarvis proposes one specific next step with a real reason. Not for status, not for marketing, not for two recommendations at once."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Radius 20, padding 15/26/16, gradient at 8% 0%, grain 32% overlay, 1px light left edge, sheen every 7s. Eyebrow is mono 11px 700 in "}<code>{"#04200F"}</code>{"; body 18px weight 200 in "}<code>{"#042B14"}</code>{"; all copy slides share a reserved grid, with a minimum of "}<code>{"3lh"}</code>{"; the longest slide determines the height at each viewport."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"design-system/briefing-surface.tsx"}</code>{" + "}<code>{"home-dashboard-view.module.css"}</code>{" (.hero*)"}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"Copy and contrast rules"}</summary>
    <pre className={cx("j-code")}>{"Short copy  : one sentence, ≤ 90 characters. Bold the decision, plain the reason.\nLong copy   : up to 3 lines at 1440px. Beyond that, move detail behind the CTA.\nEyebrow     : dark ink on green (#04200F on #22C55E ≈ 8.6:1). Never white text.\nCTA         : filled #053B1C for the action, outlined for the deferral.\nMetric      : only a real measured number. No metric is better than a fake one."}</pre>
    </details>
    </Specimen>
    <Specimen name="Flat signal panels" search="warning error success info notice panel signal flat">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Flat signal panels"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-stack")}>
    <div className={cx("j-signal")} data-signal="done"><span className={cx("j-signal-mark")} aria-hidden="true">{"✓"}</span><div><div className={cx("j-signal-title")}>{"Retainer change approved"}</div><p className={cx("j-signal-body")}>{"September invoicing is unblocked. The change is recorded against Meridian."}</p></div></div>
    <div className={cx("j-signal")} data-signal="progress"><span className={cx("j-signal-mark")} aria-hidden="true">{"!"}</span><div><div className={cx("j-signal-title")}>{"Two approvals are overdue"}</div><p className={cx("j-signal-body")}>{"Both have been waiting more than five days. Nothing has failed yet."}</p></div></div>
    <div className={cx("j-signal")} data-signal="critical"><span className={cx("j-signal-mark")} aria-hidden="true">{"×"}</span><div><div className={cx("j-signal-title")}>{"Sync with the finance sheet failed"}</div><p className={cx("j-signal-body")}>{"Last successful sync 2026-09-04 09:12. Figures on this page may be stale."}<br /><button className={cx("j-link")} type="button" style={{ "marginTop": "8px" } as CSSProperties}>{"Retry sync"}</button></p></div></div>
    <div className={cx("j-signal")}><span className={cx("j-signal-mark")} aria-hidden="true">{"i"}</span><div><div className={cx("j-signal-title")}>{"This page is owner-only"}</div><p className={cx("j-signal-body")}>{"Neutral information carries no signal colour."}</p></div></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Why flat"}</div><p className={cx("j-meta-body")}>{"The gradient means \"Jarvis suggests\". Reusing it for an error would make failure feel like a recommendation and would put two loud surfaces on one page."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Radius 14, padding 14/18, 24px mark, title 14/600, body 13px. Wash 12%, border 30%, full-strength signal on the mark only."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Migration"}</div><p className={cx("j-meta-body")}>{"Replaces the ad-hoc amber notice block used by the current guide header and the inline red text in task rows."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Brand ground" search="brand ground deep green texture dot matrix field cover">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Brand ground"}</span>
    <span className={cx("j-paren")}>{"new values"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-brand-panel")}>
    <div className={cx("j-eyebrow")} style={{ "color": "rgba(234,251,240,.66)" } as CSSProperties}>{"Jarvis · Operations"}</div>
    <p className={cx("j-duo")} style={{ "marginTop": "12px", "fontSize": "26px", "fontWeight": "200", "letterSpacing": "-.03em", "lineHeight": "1.15", "color": "rgba(234,251,240,.62)", "maxWidth": "34ch" } as CSSProperties}>{"A calm ground for "}<b style={{ "color": "#EAFBF0", "fontWeight": "400" } as CSSProperties}>{"branded surfaces"}</b>{" that are not making a recommendation."}</p>
    <div className={cx("j-row")} style={{ "marginTop": "20px" } as CSSProperties}>
    <span className={cx("j-tag")} style={{ "background": "rgba(234,251,240,.14)", "color": "#EAFBF0" } as CSSProperties}>{"#0C3F09 → #061F05"}</span>
    <span className={cx("j-tag")} style={{ "background": "rgba(234,251,240,.14)", "color": "#EAFBF0" } as CSSProperties}>{"20px dot lattice"}</span>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"A surface should read as Jarvis rather than as an instruction: the pitch deck, a lock screen, an export cover, a print header."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Never for a recommendation, a status or a metric. The bright gradient stays the only surface that speaks; this ground only belongs."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"Genuinely new values, unlike the rest of this package. Ink is "}<code>{"#EAFBF0"}</code>{" at full opacity, about 8:1 on the ground."}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="components" id="cards">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"04"}</span>
    <h2 className={cx("j-section-title")}>{"Cards, metrics and status"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/04"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"A card holds one subject: a title, one meaningful value or state, and the context needed to act. If a card needs two values of equal weight, it is two cards."}</p>
    <Specimen name="Cards and metrics" search="card metric figure accent delta revenue sparkline">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Cards and metrics"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-3")}>
    <div className={cx("j-card")}>
    <span className={cx("j-card-accent-bar")} aria-hidden="true"></span>
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Committed revenue"}</span><span className={cx("j-delta")} data-dir="up">{"+12%"}</span></div>
    <div className={cx("j-t-figure")}>{"48,200"}</div>
    <p className={cx("j-card-note")}>{"AED · September, three retainers"}</p>
    </div>
    <div className={cx("j-card")}>
    <span className={cx("j-card-accent-bar")} data-signal="progress" aria-hidden="true"></span>
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Awaiting approval"}</span><span className={cx("j-delta")} data-dir="warn">{"2 late"}</span></div>
    <div className={cx("j-t-figure")}>{"5"}</div>
    <p className={cx("j-card-note")}>{"Oldest waiting 6 days"}</p>
    </div>
    <div className={cx("j-card")}>
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Pipeline"}</span><span className={cx("j-delta")} data-dir="none" aria-label="No change data">{"–"}</span></div>
    <div className={cx("j-card-empty-glyph")} aria-hidden="true"></div>
    <p className={cx("j-card-note")}>{"Not tracked"}</p>
    </div>
    </div>
    <div className={cx("j-grid-2")} style={{ "marginTop": "12px" } as CSSProperties}>
    <div className={cx("j-card")} data-accent="true">
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Meridian Group"}</span><span className={cx("j-pill")} data-signal="recommend">{"Active"}</span></div>
    <p className={cx("j-card-note")}>{"Retainer · Hospitality · since Feb 2026"}</p>
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-tag")} data-signal="recommend">{"Approved"}</span><span className={cx("j-tag")} data-signal="progress">{"Needs review"}</span></div>
    </div>
    <div className={cx("j-card")}>
    <div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Standard card"}</span></div>
    <p className={cx("j-card-note")}>{"Neutral panel. The accent treatment is for the one card that matters most in a set, not for every card."}</p>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Radius 17, padding 18/20/16, gap 11–12, 1px hairline. Optional 2px top accent bar in the signal colour. Figure 44px weight 200, tabular."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Density"}</div><p className={cx("j-meta-body")}>{"Three across at ≥1180px, two at 1180–768, one below 768. The lead card may span the full row."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Unknown values"}</div><p className={cx("j-meta-body")}>{"A missing value is a 22×2 dash in "}<code>{"--j-text-dis"}</code>{" plus the words \"Not tracked\". Never 0, never \"–%\"."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Status pills and task lanes" search="status pill chip badge state label lane task orange">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Status pills and task lanes"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-row")}>
    <span className={cx("j-pill")} data-signal="recommend">{"Active"}</span>
    <span className={cx("j-pill")} data-signal="progress">{"Onboarding"}</span>
    <span className={cx("j-pill")} data-signal="critical">{"Inactive"}</span>
    <span className={cx("j-pill")} data-signal="idle">{"Not started"}</span>
    <span className={cx("j-pill")} data-signal="verified">{"Reviewed"}</span>
    </div>
    <div className={cx("j-grid-4")} style={{ "marginTop": "22px" } as CSSProperties}>
    <div className={cx("j-lane")} data-state="not-started"><span className={cx("j-lane-accent")} aria-hidden="true"></span><div className={cx("j-lane-head")}><span className={cx("j-lane-dot")} aria-hidden="true"></span><span className={cx("j-lane-name")}>{"Not started"}</span><span className={cx("j-lane-count")}>{"4"}</span></div><div className={cx("j-lane-body")}>{"Neutral grey until work begins."}</div></div>
    <div className={cx("j-lane")} data-state="in-progress"><span className={cx("j-lane-accent")} aria-hidden="true"></span><div className={cx("j-lane-head")}><span className={cx("j-lane-dot")} aria-hidden="true"></span><span className={cx("j-lane-name")}>{"In progress"}</span><span className={cx("j-lane-count")}>{"2"}</span></div><div className={cx("j-lane-body")}>{"Orange. Fixed by product requirement."}</div></div>
    <div className={cx("j-lane")} data-state="completed"><span className={cx("j-lane-accent")} aria-hidden="true"></span><div className={cx("j-lane-head")}><span className={cx("j-lane-dot")} aria-hidden="true"></span><span className={cx("j-lane-name")}>{"Completed"}</span><span className={cx("j-lane-count")}>{"7"}</span></div><div className={cx("j-lane-body")}>{"Work finished, not yet checked."}</div></div>
    <div className={cx("j-lane")} data-state="reviewed"><span className={cx("j-lane-accent")} aria-hidden="true"></span><div className={cx("j-lane-head")}><span className={cx("j-lane-dot")} aria-hidden="true"></span><span className={cx("j-lane-name")}>{"Reviewed"}</span><span className={cx("j-lane-count")}>{"3"}</span></div><div className={cx("j-lane-body")}>{"Blue. Checked by a person."}</div></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Every pill carries a dot and a word. Colour never carries the state on its own, so the set stays readable in greyscale and for colour-blind viewers."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Pill: 3/9 padding, 10.5px 600, 5px dot, 6px gap. Lane: 2px gradient accent, 7px dot, mono 9px name, count pill right."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"home-dashboard-view.module.css"}</code>{" (.statusPill*), "}<code>{"home-dashboard-view.module.css"}</code>{" (.lane_*), "}<code>{"tasks-board.module.css"}</code></p></div>
    </div>
    </Specimen>
    <Specimen name="Asset preview slot" search="asset preview 4:5 slot image missing error restricted">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Asset preview slot"}</span>
    <span className={cx("j-status")}>{"Current requirement"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-4")}>
    <div><div className={cx("j-asset")} data-state="empty">{"No preview yet"}</div><p className={cx("j-meta-body")} style={{ "marginTop": "8px", "fontSize": "11.5px" } as CSSProperties}>{"Empty"}</p></div>
    <div><div className={cx("j-asset")} data-state="loading" aria-busy="true"></div><p className={cx("j-meta-body")} style={{ "marginTop": "8px", "fontSize": "11.5px" } as CSSProperties}>{"Loading"}</p></div>
    <div><div className={cx("j-asset")} data-state="error">{"Preview failed"}</div><p className={cx("j-meta-body")} style={{ "marginTop": "8px", "fontSize": "11.5px" } as CSSProperties}>{"Error"}</p></div>
    <div><div className={cx("j-asset")} data-state="restricted">{"Restricted"}</div><p className={cx("j-meta-body")} style={{ "marginTop": "8px", "fontSize": "11.5px" } as CSSProperties}>{"No access"}</p></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"The 4:5 box is reserved before the image resolves, in every state, so a grid never reflows as previews arrive."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"A display preview is visibly a preview. It is never presented as the unchanged original asset."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}><code>{"clients/client-assets-library.module.css"}</code>{" (slot geometry to confirm during integration)"}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="primitives" id="primitives">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"05"}</span>
    <h2 className={cx("j-section-title")}>{"Missing primitives"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/05"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"All proposed"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"Nothing in this section exists as a shared component today. Each one is already being improvised somewhere in the product; these are the versions to standardise on."}</p>
    <Specimen name="Text input, select, search" search="input select textarea search field form validation error">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Text input, select, search"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-3")}>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Client name"}</span><input className={cx("j-input")} type="text" defaultValue="Meridian Group"/><span className={cx("j-field-help")}>{"Shown on invoices."}</span></label>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Stage"}</span><select className={cx("j-select")}><option>{"Active"}</option><option>{"Onboarding"}</option><option>{"Inactive"}</option></select><span className={cx("j-field-help")}>{"Drives the status pill."}</span></label>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Monthly retainer"}</span><input className={cx("j-input")} type="text" defaultValue="not a number" aria-invalid="true"/><span className={cx("j-field-error")}>{"Enter an amount in AED, digits only."}</span></label>
    </div>
    <div className={cx("j-grid-3")} style={{ "marginTop": "18px" } as CSSProperties}>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Disabled"}</span><input className={cx("j-input")} type="text" defaultValue="Locked while syncing" disabled={true}/></label>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Empty"}</span><input className={cx("j-input")} type="text" placeholder="Search deliverables"/></label>
    <label className={cx("j-field")}><span className={cx("j-field-label")}>{"Focus"}</span><input className={cx("j-input")} type="text" defaultValue="Focus me" style={{ "borderColor": "rgba(74,222,128,.55)", "boxShadow": "0 0 0 3px rgba(34,197,94,.14)" } as CSSProperties}/></label>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Radius 11, padding 10/12, 14px value, mono 9.5px label above, 12px help below. Focus adds a green border and a 3px 14% ring; invalid uses the critical equivalent."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Label above the field, always visible. No placeholder-as-label. Error text replaces help text and states what to do."}</p></div>
    <div><div className={cx("j-meta-label")}>{"R02 reference"}</div><p className={cx("j-meta-body")}>{"Closest existing style is the lane composer input in "}<code>{"home-dashboard-view.module.css"}</code>{"; it is smaller and unlabelled."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Tabs" search="tabs segmented navigation panel">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Tabs"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")} data-tabs="true">
    <div className={cx("j-tabs")} role="tablist">
    <button className={cx("j-tab")} role="tab" data-tab="a" aria-selected="true" type="button">{"Overview"}</button>
    <button className={cx("j-tab")} role="tab" data-tab="b" aria-selected="false" type="button">{"Deliverables"}</button>
    <button className={cx("j-tab")} role="tab" data-tab="c" aria-selected="false" type="button">{"Finance"}</button>
    </div>
    <div data-tabpanel="a" style={{ "paddingTop": "16px" } as CSSProperties}><p className={cx("j-meta-body")}>{"Underline marks the selected tab; the label carries full-strength ink. Tabs switch a view, they never submit anything."}</p></div>
    <div data-tabpanel="b" data-hidden="true" style={{ "paddingTop": "16px" } as CSSProperties}><p className={cx("j-meta-body")}>{"Second panel."}</p></div>
    <div data-tabpanel="c" data-hidden="true" style={{ "paddingTop": "16px" } as CSSProperties}><p className={cx("j-meta-body")}>{"Third panel."}</p></div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Two to five sibling views of one subject. More than five is navigation, not tabs."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Responsive"}</div><p className={cx("j-meta-body")}>{"Below 560px the strip scrolls horizontally with the selected tab scrolled into view. It never wraps to two rows."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Keyboard"}</div><p className={cx("j-meta-body")}>{"Arrow keys move selection, Home/End jump to the ends, Tab leaves the strip."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Data table" search="table rows data grid list header">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Data table"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-table-wrap")}>
    <table className={cx("j-table")}>
    <caption>{"Deliverables · sample data"}</caption>
    <thead><tr><th>{"Item"}</th><th>{"Client"}</th><th>{"State"}</th><th>{"Due"}</th><th>{"Value"}</th></tr></thead>
    <tbody>
    <tr><td>{"September brand film"}</td><td>{"Meridian Group"}</td><td><span className={cx("j-pill")} data-signal="progress">{"In progress"}</span></td><td className={cx("j-num")}>{"2026-09-12"}</td><td className={cx("j-num")}>{"18,000"}</td></tr>
    <tr><td>{"Launch stills, set two"}</td><td>{"Northwind"}</td><td><span className={cx("j-pill")} data-signal="verified">{"Reviewed"}</span></td><td className={cx("j-num")}>{"2026-09-04"}</td><td className={cx("j-num")}>{"6,500"}</td></tr>
    <tr><td>{"Retainer report"}</td><td>{"Meridian Group"}</td><td><span className={cx("j-pill")} data-signal="idle">{"Not started"}</span></td><td className={cx("j-num")}>{"2026-09-30"}</td><td className={cx("j-num")} style={{ "color": "var(--j-text-dis)" } as CSSProperties}>{"—"}</td></tr>
    </tbody>
    </table>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Mono uppercase headers, 11/16 cells, hairline row separators, tabular numerals, right-hand numeric columns never wrap."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Responsive"}</div><p className={cx("j-meta-body")}>{"Horizontal scroll inside a bordered wrapper below 700px. Do not collapse rows into cards; the comparison is the point."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Replaces"}</div><p className={cx("j-meta-body")}>{"The unstyled tables in the current guide's typography and token sections."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Overlays: drawer, toast, tooltip" search="drawer slideover modal toast tooltip overlay notification">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Overlays: drawer, toast, tooltip"}</span>
    <span className={cx("j-status")}>{"Drawer current · toast and tooltip proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-drawer-demo")} id="j-drawer" data-open="false">
    <div style={{ "padding": "16px" } as CSSProperties}><p className={cx("j-meta-body")}>{"Page content behind the overlay."}</p><button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-drawer-toggle="#j-drawer" style={{ "marginTop": "10px" } as CSSProperties}>{"Open drawer"}</button></div>
    <div className={cx("j-drawer-scrim")}></div>
    <aside className={cx("j-drawer")} aria-label="Notifications sample">
    <div className={cx("j-drawer-head")}><span className={cx("j-spec-name")}>{"Notifications"}</span><span className={cx("j-lane-count")}>{"3"}</span><button className={cx("j-icon-btn")} type="button" data-drawer-toggle="#j-drawer" style={{ "marginLeft": "auto" } as CSSProperties} aria-label="Close">{"×"}</button></div>
    <div className={cx("j-drawer-body")}>{"Right-side panel, 400px on desktop and 88vw maximum, 340ms cubic-bezier(.2,.8,.2,1) slide, scrim at 60% with a 2px blur."}</div>
    </aside>
    </div>
    <div className={cx("j-row")} style={{ "marginTop": "18px" } as CSSProperties}>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-toast="Saved" data-toast-body="Demo toast: nothing was written.">{"Trigger toast"}</button>
    <span className={cx("j-tip-wrap")}><button className={cx("j-btn")} data-variant="subtle" data-size="sm" type="button">{"Hover for tooltip"}</button><span className={cx("j-tip")} role="tooltip">{"Explains, never instructs"}</span></span>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Drawer for a secondary list that keeps page context. Toast for a completed action, 3.2s, bottom right. Tooltip for a label that will not fit, never for essential information."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Keyboard"}</div><p className={cx("j-meta-body")}>{"Drawer traps focus, closes on Escape, returns focus to its trigger. Toasts use "}<code>{"role=\"status\""}</code>{" and are not focus-stealing."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}>{"Drawer geometry from "}<code>{".slideover"}</code>{" / "}<code>{".scrim"}</code>{" in "}<code>{"home-dashboard-view.module.css"}</code>{"."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Upload dropzone" search="upload dropzone file drag drop asset">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Upload dropzone"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-2")}>
    <div className={cx("j-dropzone")}><span className={cx("j-t-label")}>{"Drop files"}</span><span>{"or click to browse · JPG, PNG, MP4 · 4:5 previews are generated"}</span></div>
    <div className={cx("j-dropzone")} data-over="true"><span className={cx("j-t-label")}>{"Release to add"}</span><span>{"Green border and 6% wash only while a drag is over the target."}</span></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Dashed 1px border at 14% white, radius 14, 26px padding, centred two-line copy naming accepted formats."}</p></div>
    <div><div className={cx("j-meta-label")}>{"States"}</div><p className={cx("j-meta-body")}>{"Rest, drag-over, uploading with per-file progress, per-file error with a retry, and rejected-type with the reason."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"This demo accepts no files. Upload behaviour and limits stay with Codex."}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="states" id="states">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"06"}</span>
    <h2 className={cx("j-section-title")}>{"States"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/06"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"Unknown, empty, filtered-empty, loading, failed and restricted are six different facts. They get six different treatments and none of them invents a number."}</p>
    <Specimen name="Loading" search="loading skeleton shimmer">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Loading"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed skeleton"}</span>
    <div className={cx("j-spec-head-tools")}>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-load-demo="#j-load-target">{"Replay"}</button>
    </div>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-3")} id="j-load-target" data-state="loading">
    <div className={cx("j-card")}><div className={cx("j-skel")} style={{ "height": "13px", "width": "52%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "34px", "width": "74%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "11px", "width": "40%" } as CSSProperties}></div></div>
    <div className={cx("j-card")}><div className={cx("j-skel")} style={{ "height": "13px", "width": "44%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "34px", "width": "60%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "11px", "width": "52%" } as CSSProperties}></div></div>
    <div className={cx("j-card")}><div className={cx("j-skel")} style={{ "height": "13px", "width": "58%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "34px", "width": "48%" } as CSSProperties}></div><div className={cx("j-skel")} style={{ "height": "11px", "width": "34%" } as CSSProperties}></div></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"The skeleton occupies the real card geometry so nothing jumps when data lands. No spinner for a region that has a known shape."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Motion"}</div><p className={cx("j-meta-body")}>{"1.4s linear shimmer. Reduced motion falls back to a flat "}<code>{"#101014"}</code>{" block."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"The Replay button shows the loading pass; it fetches nothing."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Empty, filtered, unavailable, restricted" search="empty no results filters unavailable restricted not tracked error">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Empty, filtered, unavailable, restricted"}</span>
    <span className={cx("j-status")}>{"Current guidance, new treatment"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-2")}>
    <div className={cx("j-empty")}><div className={cx("j-empty-title")}>{"No deliverables yet"}</div><p className={cx("j-empty-note")}>{"Nothing has been added for this client. Add the first deliverable to start tracking review state."}</p><button className={cx("j-btn")} data-variant="primary" data-size="sm" type="button">{"Add deliverable"}</button></div>
    <div className={cx("j-empty")}><div className={cx("j-empty-title")}>{"No items match these filters"}</div><p className={cx("j-empty-note")}>{"Three filters are active. The library itself is not empty."}</p><button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button">{"Clear filters"}</button></div>
    <div className={cx("j-empty")}><div className={cx("j-empty-title")}>{"Figures unavailable"}</div><p className={cx("j-empty-note")}>{"The finance source did not respond. This is a delivery failure, not a zero."}</p><button className={cx("j-link")} type="button">{"Retry"}</button></div>
    <div className={cx("j-empty")}><div className={cx("j-empty-title")}>{"Restricted"}</div><p className={cx("j-empty-note")}>{"This section is owner-only. You are seeing the label, not withheld values."}</p></div>
    </div>
    <div className={cx("j-grid-2")} style={{ "marginTop": "12px" } as CSSProperties}>
    <div className={cx("j-card")}><span className={cx("j-card-title")}>{"Not tracked"}</span><div className={cx("j-card-empty-glyph")} aria-hidden="true"></div><p className={cx("j-card-note")}>{"The metric exists but this client has no data for it."}</p></div>
    <div className={cx("j-card")} style={{ "borderColor": "var(--j-critical-edge)" } as CSSProperties}><span className={cx("j-card-title")}>{"Failed to load"}</span><p className={cx("j-card-note")} style={{ "color": "#FF8A80" } as CSSProperties}>{"Request timed out after 10s."}</p><button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" style={{ "alignSelf": "flex-start" } as CSSProperties}>{"Retry"}</button></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Every empty state names the cause and offers the one action that resolves it. Filtered-empty always offers clearing filters."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Failure is never rendered as zero, and restricted is never rendered as empty."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"Dashed hairline, radius 14, 22px padding, 14/500 title, 12.5px note capped at 52ch, one action."}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="motion" id="motion">
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"07"}</span>
    <h2 className={cx("j-section-title")}>{"Motion"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/07"}</span>
    <span className={cx("j-status")}>{"Current vocabulary"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"Motion in Jarvis reports what happened; it never performs. Three speeds cover the whole product: state changes are almost instant, surfaces enter deliberately, and only ambient loops are slow. Everything below already exists in Home — this section names it so new screens stop inventing timings."}</p>
    <Specimen name="Durations and easing" search="motion duration easing timing curve speed tokens">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Durations and easing"}</span>
    <span className={cx("j-paren")}>{"three speeds"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed names"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-ease-row")}>
    <div><div className={cx("j-demo-name")}>{"State · 140–160ms ease · colour, border, opacity"}</div><div className={cx("j-ease-track")} data-ease="state"><span className={cx("j-ease-dot")}></span></div></div>
    <div style={{ "marginTop": "10px" } as CSSProperties}><div className={cx("j-demo-name")}>{"Enter · 280–340ms cubic-bezier(.2,.8,.2,1) · surfaces arriving"}</div><div className={cx("j-ease-track")} data-ease="enter"><span className={cx("j-ease-dot")}></span></div></div>
    <div style={{ "marginTop": "10px" } as CSSProperties}><div className={cx("j-demo-name")}>{"Ambient · 1.4s–7s linear or ease-in-out · loops only"}</div><div className={cx("j-ease-track")} data-ease="linear"><span className={cx("j-ease-dot")}></span></div></div>
    </div>
    <div className={cx("j-table-wrap")} style={{ "marginTop": "22px" } as CSSProperties}>
    <table className={cx("j-table")}>
    <thead><tr><th>{"Token"}</th><th>{"Value"}</th><th>{"Applies to"}</th></tr></thead>
    <tbody>
    <tr><td><code>{"--j-dur-state"}</code></td><td className={cx("j-num")}>{"160ms"}</td><td>{"Hover, focus, active, chip and pill changes"}</td></tr>
    <tr><td><code>{"--j-dur-enter"}</code></td><td className={cx("j-num")}>{"280ms"}</td><td>{"Toast, tooltip, card and row entrance"}</td></tr>
    <tr><td><code>{"--j-dur-surface"}</code></td><td className={cx("j-num")}>{"340ms"}</td><td>{"Drawer slide, scrim fade"}</td></tr>
    <tr><td><code>{"--j-dur-measure"}</code></td><td className={cx("j-num")}>{"560ms"}</td><td>{"Bars, sparklines, progress filling to a real value"}</td></tr>
    <tr><td><code>{"--j-ease-state"}</code></td><td><code>{"ease"}</code></td><td>{"Anything reversible"}</td></tr>
    <tr><td><code>{"--j-ease-enter"}</code></td><td><code>{"cubic-bezier(.2,.8,.2,1)"}</code></td><td>{"Anything arriving or leaving"}</td></tr>
    <tr><td><code>{"--j-stagger"}</code></td><td className={cx("j-num")}>{"45–60ms"}</td><td>{"Per-item delay in a list or bar set, capped at 8 items"}</td></tr>
    </tbody>
    </table>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"One duration per purpose. If a new interaction needs a fourth speed, the interaction is probably wrong."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Nothing animates on the way out except overlays. Data never fades between values — it counts, grows or simply changes."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}>{"Existing literals in "}<code>{"home-dashboard-view.module.css"}</code>{": "}<code>{".34s cubic-bezier(.2,.8,.2,1)"}</code>{", "}<code>{"jrise .5s"}</code>{", "}<code>{"jgrow .56s"}</code>{", "}<code>{"jsheen 7s"}</code>{", "}<code>{"jpulse 2.6s"}</code>{"."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Entrance and stagger" search="entrance rise stagger reveal animation section">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Entrance and stagger"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    <div className={cx("j-spec-head-tools")}>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-replay="#j-anim-entrance">{"Replay"}</button>
    </div>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-motion-grid")} id="j-anim-entrance">
    <div className={cx("j-demo-tile j-lift")}>
    <span className={cx("j-demo-name")}>{"Rise · section and card entrance"}</span>
    <div className={cx("j-demo-stage")}><div className={cx("j-anim-rise j-stagger")}><span className={cx("j-stagger-row")} style={{ "--i": "0" } as CSSProperties}></span><span className={cx("j-stagger-row")} style={{ "--i": "1", "width": "78%" } as CSSProperties}></span><span className={cx("j-stagger-row")} style={{ "--i": "2", "width": "56%" } as CSSProperties}></span></div></div>
    <span className={cx("j-demo-spec")}>{"translateY(14px) → 0, opacity 0 → 1, 500ms, 60ms stagger"}</span>
    </div>
    <div className={cx("j-demo-tile j-lift")}>
    <span className={cx("j-demo-name")}>{"Grow · a bar reaching a measured value"}</span>
    <div className={cx("j-demo-stage")}><div className={cx("j-anim-grow")}><span style={{ "width": "64%" } as CSSProperties}></span></div></div>
    <span className={cx("j-demo-spec")}>{"scaleX(0) → 1 from the left, 560ms enter curve"}</span>
    </div>
    <div className={cx("j-demo-tile j-lift")}>
    <span className={cx("j-demo-name")}>{"Columns · sparkline and trend sets"}</span>
    <div className={cx("j-demo-stage")}><div className={cx("j-anim-bars")}><span style={{ "--i": "0", "height": "38%" } as CSSProperties}></span><span style={{ "--i": "1", "height": "54%" } as CSSProperties}></span><span style={{ "--i": "2", "height": "44%" } as CSSProperties}></span><span style={{ "--i": "3", "height": "72%" } as CSSProperties}></span><span style={{ "--i": "4", "height": "61%" } as CSSProperties}></span><span style={{ "--i": "5", "height": "88%" } as CSSProperties}></span></div></div>
    <span className={cx("j-demo-spec")}>{"scaleY from the baseline, 500ms, 45ms stagger, last bar full strength"}</span>
    </div>
    <div className={cx("j-demo-tile j-lift")}>
    <span className={cx("j-demo-name")}>{"Count · a figure arriving"}</span>
    <div className={cx("j-demo-stage")}><span className={cx("j-anim-count")} data-count-to="48200" data-count-dur="900">{"0"}</span></div>
    <span className={cx("j-demo-spec")}>{"900ms ease-out cubic, tabular numerals so width never shifts"}</span>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Content arrives for the first time, or a real value has been measured. Never on a re-render, a filter change or a tab switch."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Stagger caps at eight items. Beyond that the ninth item onwards enters with the eighth, so a long list never feels slow."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"A number counts up only from zero to a known value. Never animate towards a value that is still loading."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Ambient loops" search="ambient loop sheen pulse shimmer attention breathing">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Ambient loops"}</span>
    <span className={cx("j-status")}>{"R02 reference"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-motion-grid")}>
    <div className={cx("j-demo-tile")}>
    <span className={cx("j-demo-name")}>{"Sheen · the briefing surface only"}</span>
    <div className={cx("j-demo-stage")}><div className={cx("j-anim-sheen")}><span></span></div></div>
    <span className={cx("j-demo-spec")}>{"34% wide, skewX(-18deg), 7s ease-in-out infinite"}</span>
    </div>
    <div className={cx("j-demo-tile")}>
    <span className={cx("j-demo-name")}>{"Pulse · one item genuinely waiting"}</span>
    <div className={cx("j-demo-stage")} style={{ "gap": "10px" } as CSSProperties}><span className={cx("j-anim-pulse")}></span><span className={cx("j-meta-body")} style={{ "fontSize": "12px" } as CSSProperties}>{"Approval overdue"}</span></div>
    <span className={cx("j-demo-spec")}>{"Expanding ring, 2.6s ease-in-out infinite, one per view"}</span>
    </div>
    <div className={cx("j-demo-tile")}>
    <span className={cx("j-demo-name")}>{"Shimmer · loading placeholder"}</span>
    <div className={cx("j-demo-stage")}><div className={cx("j-stagger")}><span className={cx("j-skel")} style={{ "height": "12px" } as CSSProperties}></span><span className={cx("j-skel")} style={{ "height": "12px", "width": "70%" } as CSSProperties}></span></div></div>
    <span className={cx("j-demo-spec")}>{"220% gradient, 1.4s linear infinite"}</span>
    </div>
    <div className={cx("j-demo-tile j-lift")}>
    <span className={cx("j-demo-name")}>{"Lift · hover on an interactive card"}</span>
    <div className={cx("j-demo-stage")}><span className={cx("j-meta-body")} style={{ "fontSize": "12px" } as CSSProperties}>{"Hover this tile"}</span></div>
    <span className={cx("j-demo-spec")}>{"translateY(-2px) + border to 14%, 160ms enter curve"}</span>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"A loop must mean something is waiting or working. Decorative loops are not permitted, which is why the sheen belongs to the one surface that speaks."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"One pulsing element per view. Two competing pulses read as an alarm."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Reduced motion"}</div><p className={cx("j-meta-body")}><code>{"prefers-reduced-motion: reduce"}</code>{" removes every animation and transition, hides the sheen, flattens shimmers to "}<code>{"#101014"}</code>{" and prints counted figures at their final value. No behaviour is lost."}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"Keyframes as implemented"}</summary>
    <pre className={cx("j-code")}>{"@keyframes jrise  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }\n@keyframes jgrow  { from { transform:scaleX(0) } to { transform:scaleX(1) } }\n@keyframes jgrowY { from { transform:scaleY(0) } to { transform:scaleY(1) } }\n@keyframes jpulse { 0%,100% { box-shadow:0 0 0 0 rgba(74,222,128,.45) } 50% { box-shadow:0 0 0 7px rgba(74,222,128,0) } }\n@keyframes jsheen { 0% { transform:translateX(-120%) } 55%,100% { transform:translateX(120%) } }\n\n@media (prefers-reduced-motion: reduce) {\n  .root * { animation: none !important; transition: none !important; }\n}"}</pre>
    </details>
    </Specimen>
    <Specimen name="Arrivals and departures" search="transition drawer toast overlay motion arrival departure">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Arrivals and departures"}</span>
    <span className={cx("j-status")}>{"Drawer current · toast proposed"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-row")}>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-drawer-toggle="#j-drawer">{"Slide the drawer (section 05)"}</button>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-toast="Motion demo" data-toast-body="Toast rises 10px over 280ms and leaves after 3.2s.">{"Rise a toast"}</button>
    <button className={cx("j-btn")} data-variant="secondary" data-size="sm" type="button" data-load-demo="#j-load-target">{"Run a loading pass (section 06)"}</button>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Enter"}</div><p className={cx("j-meta-body")}>{"Overlays move on "}<code>{"transform"}</code>{" only, 340ms, "}<code>{"cubic-bezier(.2,.8,.2,1)"}</code>{", with the scrim fading at 280ms."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Exit"}</div><p className={cx("j-meta-body")}>{"Exits reverse the same transform at the same duration. Nothing scales, nothing bounces."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Never animate layout properties (width, height, top). Transform and opacity only, so a slow machine drops frames instead of reflowing."}</p></div>
    </div>
    </Specimen>
    </section>

    <section className={cx("j-section")} data-group="patterns" id="composition"><span id="patterns"/><span id="build"/>
    <div className={cx("j-section-head")}>
    <span className={cx("j-section-num")}>{"08"}</span>
    <h2 className={cx("j-section-title")}>{"Page composition"}</h2>
    <span className={cx("j-section-rule")}></span>
    <span className={cx("j-ghost-num")} aria-hidden="true">{"/08"}</span>
    </div>
    <p className={cx("j-section-lede")}>{"Seven rules produce a page that looks like Jarvis. They are the reason a new screen does not need a new design decision."}</p>
    <div className={cx("j-stack")} style={{ "marginBottom": "26px", "gap": "16px", "maxWidth": "74ch" } as CSSProperties}>
    <div className={cx("j-principle")}><p className={cx("j-principle-body")}>{"A Jarvis page is "}<b>{"quiet until something needs a decision."}</b>{" Emphasis is spent once, on the thing that is waiting."}</p></div>
    <div className={cx("j-principle")}><p className={cx("j-principle-body")}>{"Every surface reports "}<b>{"what is true"}</b>{", including that a value is unknown. Nothing is filled in to look finished."}</p></div>
    <div className={cx("j-principle")}><p className={cx("j-principle-body")}>{"The grid, the hairlines and the texture are "}<b>{"felt rather than seen."}</b>{" Structure should not need to announce itself."}</p></div>
    </div>
    <Specimen name="The page rules" search="rules grammar page composition seven">
    <div className={cx("j-spec-head")}><span className={cx("j-spec-name")}>{"The page rules"}</span><span className={cx("j-status")} data-kind="proposed">{"Proposed as standard"}</span></div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-table-wrap")}>
    <table className={cx("j-table")}>
    <thead><tr><th style={{ "width": "34px" } as CSSProperties}>{"#"}</th><th>{"Rule"}</th><th>{"Why"}</th></tr></thead>
    <tbody>
    <tr><td className={cx("j-num")}>{"1"}</td><td>{"Numbered sections: mono green number, title, gradient rule, controls right."}</td><td>{"Gives long pages a spine and makes any section referable in conversation."}</td></tr>
    <tr><td className={cx("j-num")}>{"2"}</td><td>{"One loud element per view — the green briefing surface."}</td><td>{"Emphasis only works if it is scarce."}</td></tr>
    <tr><td className={cx("j-num")}>{"3"}</td><td>{"Colour means product state; chrome and documentation stay neutral."}</td><td>{"Amber always means attention, never decoration."}</td></tr>
    <tr><td className={cx("j-num")}>{"4"}</td><td>{"Mono for labels, IDs, dates and figures-as-data; sans for prose."}</td><td>{"Scanning and reading are different jobs."}</td></tr>
    <tr><td className={cx("j-num")}>{"5"}</td><td>{"Hairlines separate; shadows only float."}</td><td>{"Keeps a dark page calm at any density."}</td></tr>
    <tr><td className={cx("j-num")}>{"6"}</td><td>{"Radius follows element size, stepping down when nested."}</td><td>{"Removes per-component corner guesses."}</td></tr>
    <tr><td className={cx("j-num")}>{"7"}</td><td>{"Reserve space for unknown data and label it."}</td><td>{"No layout shift, no invented numbers."}</td></tr>
    </tbody>
    </table>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Shell"}</div><p className={cx("j-meta-body")}>{"The app shell owns the sidebar rail and mobile header. A page renders a content column only and never adds its own rail or second header."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Widths"}</div><p className={cx("j-meta-body")}>{"Content column 30px gutters at ≥768px, 24px at 430–768, 20px at ≤390. Guide content caps at 1180px; Home stays fluid."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Long labels"}</div><p className={cx("j-meta-body")}>{"Names ellipsis at a max character width, meta rows wrap, numeric cells never wrap."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Section architecture" search="section architecture hierarchy subsection heading levels rhythm anatomy structure organisation">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Section architecture"}</span>
    <span className={cx("j-paren")}>{"three levels, no more"}</span>
    <span className={cx("j-status")} data-kind="proposed">{"Proposed as standard"}</span>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-anatomy")}>
    <div className={cx("j-anno")}><span className={cx("j-anno-tag")}>{"page top · 34px"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "16px" } as CSSProperties}>
    <span className={cx("j-level")} data-depth="0">{"L0 · page header"}</span>
    <div className={cx("j-eyebrow")} style={{ "marginTop": "10px" } as CSSProperties}>{"Operate / Clients"}</div>
    <div className={cx("j-t-greeting")} style={{ "fontSize": "30px", "marginTop": "6px" } as CSSProperties}>{"Good morning, "}<b>{"Calvin."}</b></div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "8px", "maxWidth": "56ch" } as CSSProperties}>{"One eyebrow, one greeting or page title, one optional lede. Never two headings at this level."}</p>
    </div>
    <div className={cx("j-anno")} style={{ "marginTop": "22px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"22px"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "14px" } as CSSProperties}>
    <span className={cx("j-level")} data-depth="0">{"L0 · briefing slot"}</span>
    <div className={cx("j-wire")} style={{ "marginTop": "10px", "height": "52px", "borderColor": "rgba(74,222,128,.22)", "background": "rgba(34,197,94,.06)" } as CSSProperties}></div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "8px" } as CSSProperties}>{"Reserved for the one recommendation. Absent when there is nothing to recommend — the slot collapses, it does not sit empty."}</p>
    </div>
    <div className={cx("j-anno")} style={{ "marginTop": "26px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"34px + hairline"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "20px" } as CSSProperties}>
    <span className={cx("j-level")}>{"L1 · section"}</span>
    <div className={cx("j-section-head")} style={{ "paddingBottom": "0", "marginTop": "12px" } as CSSProperties}>
    <span className={cx("j-section-num")}>{"01"}</span>
    <h4 className={cx("j-section-title")} style={{ "fontSize": "19px" } as CSSProperties}>{"Finance"}</h4>
    <span className={cx("j-section-rule")}></span>
    <button className={cx("j-link")} type="button">{"All transactions"}</button>
    </div>
    <div className={cx("j-anno")} style={{ "marginTop": "20px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"18px"}</span><span className={cx("j-anno-line")}></span></div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "14px", "maxWidth": "60ch" } as CSSProperties}>{"Numbered, titled, ruled, with at most one action on the right. A section answers one question."}</p>
    <div className={cx("j-anno")} style={{ "marginTop": "24px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"26px"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "16px" } as CSSProperties}>
    <span className={cx("j-level")} data-depth="2">{"L2 · subsection"}</span>
    <div className={cx("j-sub")} style={{ "marginTop": "10px" } as CSSProperties}>{"This month"}</div>
    <div style={{ "display": "grid", "gridTemplateColumns": "repeat(3,minmax(0,1fr))", "gap": "12px" } as CSSProperties}>
    <div className={cx("j-wire")} style={{ "height": "58px" } as CSSProperties}></div>
    <div className={cx("j-wire")} style={{ "height": "58px" } as CSSProperties}></div>
    <div className={cx("j-wire")} style={{ "height": "58px" } as CSSProperties}></div>
    </div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "10px" } as CSSProperties}>{"A mono uppercase label. No number, no rule, no action — otherwise it competes with the section above it."}</p>
    </div>
    <div className={cx("j-anno")} style={{ "marginTop": "24px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"12px"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "12px" } as CSSProperties}>
    <span className={cx("j-level")} data-depth="3">{"L3 · group inside a component"}</span>
    <div className={cx("j-lane")} data-state="in-progress" style={{ "marginTop": "10px" } as CSSProperties}>
    <span className={cx("j-lane-accent")} aria-hidden="true"></span>
    <div className={cx("j-lane-head")}><span className={cx("j-lane-dot")} aria-hidden="true"></span><span className={cx("j-lane-name")}>{"Awaiting approval"}</span><span className={cx("j-lane-count")}>{"2"}</span></div>
    <div style={{ "padding": "12px 15px", "display": "flex", "flexDirection": "column", "gap": "8px" } as CSSProperties}>
    <span className={cx("j-wire-row")}></span><span className={cx("j-wire-row")} style={{ "width": "72%" } as CSSProperties}></span>
    </div>
    </div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "10px" } as CSSProperties}>{"Grouping that belongs to a component, not to the page. This is the deepest level; there is no L4."}</p>
    </div>
    </div>
    <div className={cx("j-anno")} style={{ "marginTop": "26px" } as CSSProperties}><span className={cx("j-anno-tag")}>{"34px + hairline"}</span><span className={cx("j-anno-line")}></span></div>
    <div style={{ "paddingTop": "18px" } as CSSProperties}>
    <span className={cx("j-level")}>{"L1 · next section"}</span>
    <div className={cx("j-section-head")} style={{ "paddingBottom": "0", "marginTop": "12px" } as CSSProperties}>
    <span className={cx("j-section-num")}>{"02"}</span>
    <h4 className={cx("j-section-title")} style={{ "fontSize": "19px" } as CSSProperties}>{"Tasks"}</h4>
    <span className={cx("j-section-rule")}></span>
    </div>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Depth limit"}</div><p className={cx("j-meta-body")}>{"Page header, section, subsection, in-component group. Four levels, and only three of them are headings. If content needs a fifth, it is a separate route."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Numbering"}</div><p className={cx("j-meta-body")}>{"Only L1 is numbered, sequentially from 01, in mono green. Numbers describe reading order on that page — they are not stable identifiers and must not appear in links or copy."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Actions"}</div><p className={cx("j-meta-body")}>{"One action per section header, right-aligned, as a link rather than a button. Subsections get none. Item-level actions live inside the component."}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"Levels, at a glance"}</summary>
    <pre className={cx("j-code")}>{"LEVEL  ELEMENT              TYPE                     SPACE ABOVE   DIVIDER  NUMBERED\nL0     eyebrow + greeting   mono 10 / sans 46-30     34px page top  —        no\nL0     briefing slot        component                22px           —        no\nL1     section              mono 11 + sans 22        34px           hairline  yes, 01..\nL2     subsection           mono 10 uppercase        26px           —        no\nL3     group in component   mono 9 uppercase + count 12px           hairline  no\n\nWRAPPING     Section titles never wrap at 1440-360; they are two to three words.\nEMPTY        An L1 with no content renders its empty state, never a bare header.\nCOLLAPSE     Below 768px nothing changes but the grid inside each level.\nSCROLL SPY   Only L1 is a scroll target and appears in navigation."}</pre>
    </details>
    </Specimen>
    <Specimen name="Navigation rail" search="sidebar rail navigation shell left nav groups operate system build mobile header">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Navigation rail"}</span>
    <span className={cx("j-paren")}>{"shell-owned"}</span>
    <span className={cx("j-status")}>{"Current, documented"}</span>
    </div>
    <div className={cx("j-spec-canvas")} data-tight="true">
    <div className={cx("j-shell-demo")}>
    <nav className={cx("j-rail")} aria-label="Sample application navigation">
    <div className={cx("j-rail-mark")}>{"JARVIS"}</div>
    <div>
    <div className={cx("j-rail-group")}>{"Operate"}</div>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 7.2 8 2.8l5.5 4.4V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z"></path></svg></span>{"Home"}</button>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="5.4" r="2.3"></circle><path d="M3.4 13.2c0-2.4 2.1-3.9 4.6-3.9s4.6 1.5 4.6 3.9"></path></svg></span>{"Clients"}<span className={cx("j-rail-chev")} aria-hidden="true">{"›"}</span></button>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3.2" width="11" height="9.6" rx="1.6"></rect><path d="M2.8 10.4 6 7.6l2.4 2.1 2-1.7 2.8 2.4"></path></svg></span>{"Content"}</button>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.6h10M3 8h10M3 11.4h6.4"></path></svg></span>{"Tasks"}</button>
    </div>
    <div>
    <div className={cx("j-rail-group")}>{"Build"}</div>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M9.6 3.4a3 3 0 1 0 3 5l-1.7-1.7 1-1z"></path><path d="M8.4 7.6 3.2 12.8"></path></svg></span>{"Tools"}</button>
    <button className={cx("j-rail-item")} type="button" aria-current="true"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1"></rect><rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1"></rect><rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1"></rect><circle cx="11.1" cy="11.1" r="2.3"></circle></svg></span>{"Design system"}</button>
    <button className={cx("j-rail-item")} type="button"><span className={cx("j-rail-glyph")} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3" width="11" height="4" rx="1.2"></rect><rect x="2.5" y="9" width="11" height="4" rx="1.2"></rect><path d="M5 5h.01M5 11h.01"></path></svg></span>{"System Operations"}</button>
    </div>
    <div className={cx("j-rail-foot")}>{"Dubai · 10:37"}</div>
    <div className={cx("j-rail-avatar")} aria-hidden="true">{"N"}</div>
    </nav>
    <div className={cx("j-shell-body")}>
    <div className={cx("j-eyebrow")}>{"Build / Internal reference"}</div>
    <p className={cx("j-duo")} style={{ "marginTop": "8px", "fontSize": "22px", "fontWeight": "200", "letterSpacing": "-.03em" } as CSSProperties}>{"The page owns "}<b>{"this column only."}</b></p>
    <p className={cx("j-meta-body")} style={{ "marginTop": "12px", "maxWidth": "46ch" } as CSSProperties}>{"The rail is rendered once by the shell. A page never draws a rail, a second header, or its own left offset."}</p>
    </div>
    </div>
    <div className={cx("j-shell-demo")} style={{ "marginTop": "12px", "minHeight": "0", "flexDirection": "column" } as CSSProperties}>
    <div className={cx("j-rail-mobile")}>
    <button className={cx("j-burger")} type="button" aria-label="Open navigation">{"≡"}</button>
    <span className={cx("j-rail-mark")} style={{ "padding": "0", "fontSize": "11px" } as CSSProperties}>{"JARVIS"}</span>
    </div>
    <div className={cx("j-shell-body")} style={{ "padding": "14px 16px" } as CSSProperties}><p className={cx("j-meta-body")}>{"Below 768px the rail becomes a drawer behind this header. The page content is unchanged; only the shell swaps."}</p></div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"216px wide, "}<code>{"--j-panel"}</code>{" ground, 1px right hairline. Wordmark mono 12px / .18em with a 6px green live dot. Group labels mono 9px / .18em in "}<code>{"--j-text-off"}</code>{". Items 13.5px, 8/18 padding, 15px glyph, 11px gap."}</p></div>
    <div><div className={cx("j-meta-label")}>{"States"}</div><p className={cx("j-meta-body")}>{"Rest "}<code>{"--j-text-4"}</code>{"; hover 3% wash and brighter ink; current is full ink, 5% wash and a 2px green left spine. Expandable items carry a right chevron. Nothing in the rail uses a signal colour except the current spine and the live dot."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rules"}</div><p className={cx("j-meta-body")}>{"Three groups — Operate, System, Build — in that order; a new route joins a group rather than starting a fourth. Labels are nouns, never verbs. Long routes ellipsis at one line. The footer clock and avatar are pinned to the bottom."}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"Offsets and responsibilities"}</summary>
    <pre className={cx("j-code")}>{"Shell owns : rail width, rail scroll, the mobile header, the drawer, and the\n             left offset of the content column.\nPage owns  : everything right of the rail. Top padding 34px, gutters 30 / 24 / 20.\n\nDo not     : add a second rail inside a page; re-apply the left offset; render a\n             page-level mobile header; put a signal colour on a nav item to mean\n             “new” or “beta” — use a neutral tag in the page instead.\n\nUnbuilt routes still appear in the rail. A route that has no screen yet must\nland on an honest empty state, not a blank column."}</pre>
    </details>
    </Specimen>
    <Specimen name="Do / don't" search="do dont examples guidance">
    <div className={cx("j-spec-head")}><span className={cx("j-spec-name")}>{"Do / don't"}</span><span className={cx("j-status")} data-kind="guide">{"Guide only"}</span></div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-grid-2")}>
    <div className={cx("j-rule-card")} data-kind="do">
    <div className={cx("j-rule-head")}>{"Do — one primary action"}</div>
    <div className={cx("j-rule-body")}><div className={cx("j-row")}><button className={cx("j-btn")} data-variant="primary" type="button">{"Approve change"}</button><button className={cx("j-btn")} data-variant="secondary" type="button">{"Open brief"}</button><button className={cx("j-btn")} data-variant="subtle" type="button">{"Later"}</button></div></div>
    <p className={cx("j-rule-note")}>{"The decision is obvious at a glance."}</p>
    </div>
    <div className={cx("j-rule-card")} data-kind="dont">
    <div className={cx("j-rule-head")}>{"Don't — three primaries"}</div>
    <div className={cx("j-rule-body")}><div className={cx("j-row")}><button className={cx("j-btn")} data-variant="primary" type="button">{"Approve"}</button><button className={cx("j-btn")} data-variant="primary" type="button">{"Open brief"}</button><button className={cx("j-btn")} data-variant="primary" type="button">{"Later"}</button></div></div>
    <p className={cx("j-rule-note")}>{"Equal weight removes the recommendation."}</p>
    </div>
    <div className={cx("j-rule-card")} data-kind="do">
    <div className={cx("j-rule-head")}>{"Do — label the unknown"}</div>
    <div className={cx("j-rule-body")}><div className={cx("j-card")}><span className={cx("j-card-title")}>{"Pipeline"}</span><div className={cx("j-card-empty-glyph")} aria-hidden="true"></div><p className={cx("j-card-note")}>{"Not tracked"}</p></div></div>
    <p className={cx("j-rule-note")}>{"Honest and stable in layout."}</p>
    </div>
    <div className={cx("j-rule-card")} data-kind="dont">
    <div className={cx("j-rule-head")}>{"Don't — fill with a zero"}</div>
    <div className={cx("j-rule-body")}><div className={cx("j-card")}><span className={cx("j-card-title")}>{"Pipeline"}</span><div className={cx("j-t-figure")}>{"0"}</div><p className={cx("j-card-note")}>{"AED · September"}</p></div></div>
    <p className={cx("j-rule-note")}>{"Reads as a measured result that nobody measured."}</p>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Use when"}</div><p className={cx("j-meta-body")}>{"Reach for a do/don't pair when a rule has been broken twice in real screens."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Rule"}</div><p className={cx("j-meta-body")}>{"Both halves show the same content so only the treatment differs."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Note"}</div><p className={cx("j-meta-body")}>{"The \"don't\" panels are deliberately wrong examples and must not be copied into product code."}</p></div>
    </div>
    </Specimen>
    <Specimen name="Page starter, assembled from the pieces above" search="starter page example composition mini">
    <div className={cx("j-spec-head")}>
    <span className={cx("j-spec-name")}>{"Page starter, assembled from the pieces above"}</span>
    <span className={cx("j-status")} data-kind="guide">{"Guide only"}</span>
    <div className={cx("j-spec-head-tools")}><button className={cx("j-btn")} data-variant="subtle" data-size="sm" type="button" data-copy="#code-starter" data-copy-label="Page starter copied.">{"Copy JSX"}</button></div>
    </div>
    <div className={cx("j-spec-canvas")}>
    <div className={cx("j-mini")}>
    <div className={cx("j-eyebrow")}>{"Operate / Clients"}</div>
    <div className={cx("j-t-greeting")} style={{ "marginTop": "6px", "fontSize": "32px" } as CSSProperties}>{"Good morning, "}<b>{"Calvin."}</b></div>
    <div className={cx("j-brief")} style={{ "marginTop": "18px" } as CSSProperties}>
    <span className={cx("j-brief-grain")} aria-hidden="true"></span>
    <span className={cx("j-brief-edge")} aria-hidden="true"></span>
    <div className={cx("j-brief-in")}>
    <div className={cx("j-brief-top")}><span className={cx("j-brief-eyebrow")}>{"JARVIS / RECOMMENDATION"}</span></div>
    <div className={cx("j-brief-stack")}><p className={cx("j-brief-body")} style={{ "fontSize": "16px" } as CSSProperties}><b>{"Start with Meridian."}</b>{" One approval and two reviews are waiting there."}</p></div>
    <div className={cx("j-row")}><button className={cx("j-btn")} data-variant="on-green" data-size="sm" type="button">{"Open Meridian"}</button></div>
    </div>
    </div>
    <div className={cx("j-section")} style={{ "marginTop": "26px" } as CSSProperties}>
    <div className={cx("j-section-head")} style={{ "paddingBottom": "14px" } as CSSProperties}><span className={cx("j-section-num")}>{"01"}</span><h3 className={cx("j-section-title")} style={{ "fontSize": "18px" } as CSSProperties}>{"Clients"}</h3><span className={cx("j-section-rule")}></span><button className={cx("j-link")} type="button">{"All clients"}</button></div>
    <div className={cx("j-grid-2")}>
    <div className={cx("j-card")} data-accent="true"><div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Meridian Group"}</span><span className={cx("j-pill")} data-signal="recommend">{"Active"}</span></div><p className={cx("j-card-note")}>{"3 items need you"}</p></div>
    <div className={cx("j-card")}><div className={cx("j-row")} data-gap="sm"><span className={cx("j-card-title")}>{"Northwind"}</span><span className={cx("j-pill")} data-signal="progress">{"Onboarding"}</span></div><p className={cx("j-card-note")}>{"Kickoff on 2026-09-09"}</p></div>
    </div>
    </div>
    </div>
    </div>
    <div className={cx("j-spec-meta")}>
    <div><div className={cx("j-meta-label")}>{"Order"}</div><p className={cx("j-meta-body")}>{"Eyebrow, greeting, briefing, numbered sections, footer meta. Nothing above the greeting except shell chrome."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Anatomy"}</div><p className={cx("j-meta-body")}>{"34px top padding, 22px to the briefing, 34px between sections, 26px section top padding above a hairline."}</p></div>
    <div><div className={cx("j-meta-label")}>{"Source"}</div><p className={cx("j-meta-body")}>{"Matches the Home column rhythm in "}<code>{"home-dashboard-view.module.css"}</code>{"."}</p></div>
    </div>
    <details className={cx("j-disclose")}>
    <summary>{"JSX"}</summary>
    <pre className={cx("j-code")} id="code-starter">{pageStarter}</pre>
    </details>
    </Specimen>
    </section>

    <DesignSystemR03 />
    <LiveDesignAudit />
    <footer className={cx("j-section")} data-group="all" style={{ "marginTop": "34px" } as CSSProperties}>
    <div className={cx("j-row")}>
    <span className={cx("j-eyebrow")}>{"Jarvis design system · r02 foundations + r03 patterns · 6 September 2026"}</span>
    <span className={cx("j-status")} style={{ "marginLeft": "auto" } as CSSProperties}>{"Internal · owner-only"}</span>
    </div>
    <p className={cx("j-meta-body")} style={{ "marginTop": "10px", "maxWidth": "74ch" } as CSSProperties}>{"Read with "}<code>{"DESIGN-DECISIONS.md"}</code>{", "}<code>{"COMPONENTS.md"}</code>{", "}<code>{"TOKEN-PROPOSALS.json"}</code>{" and "}<code>{"CHANGE-MAP.md"}</code>{". The library demos are implemented locally. Shared component evidence is recorded in the R03 adoption section; backend-dependent patterns remain guide-only."}</p>
    </footer>
    </div>
    <div className={cx("j-toast-host")} id="j-toast-host" aria-live="polite"></div>
    <button className={cx("j-top")} id="j-top" type="button" aria-label="Back to top">{"↑"}</button>
    <div className={cx("j-palette-scrim")} id="j-palette" hidden={true}>
    <div className={cx("j-palette")}>
    <input id="j-palette-input" aria-label="Find a specimen" type="text" placeholder="Jump to a specimen, state or token…" autoComplete="off" spellCheck="false"/>
    <div className={cx("j-palette-list")} id="j-palette-list"></div>
    <div className={cx("j-palette-foot")}><span>{"↑↓ move"}</span><span>{"↵ open"}</span><span>{"esc close"}</span></div>
    </div>
    </div>

    </>;
}
