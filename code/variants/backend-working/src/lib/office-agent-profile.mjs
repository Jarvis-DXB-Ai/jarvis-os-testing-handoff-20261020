import roleSkills from './office-role-skills.json' with {type:'json'};
export const roleDescriptions={
 coo:'Turns your brief into a focused team, assigns work, resolves dependencies and combines department reports into a complete result for your review.',
 cmo:'Owns social strategy, coordinates the channel managers and copywriter, and reports the department’s results back to your COO.',
 cfo:'Coordinates financial records, billing, pricing and profitability analysis, then brings the department’s findings to your COO.',
 cto:'Coordinates website design, engineering, research and audits, and checks the handoff from design to implementation.',
 delivery:'Tracks deliverables, deadlines, dependencies and handoffs so agreed client work moves through the right review stages.',
 success:'Keeps client goals, feedback, expectations and service scope aligned across the team.',
 'brand-strategist':'Develops positioning, audience priorities, offers and content pillars from the client’s evidence and business goals.',
 voice:'Defines the brand’s tone of voice and adapts writing rules for different channels and audiences.',
 competitors:'Compares competitors using dated sources, identifies useful patterns and highlights opportunities without copying their work.',
 'creative-director':'Sets the visual direction for graphic design, coordinates the designers and reviews the department’s creative decisions.',
 'design-system':'Organises typography, colour, layout, components and brand rules into a consistent visual system.',
 'grid-planner':'Turns the strategy into content pillars, publishing themes and a coherent social calendar.',
 'image-prompts':'Plans photographic concepts, lighting, composition and image prompts around the supplied product and brand references.',
 copy:'Writes hooks, captions, calls to action and channel-specific copy grounded in the brief and approved facts.',
 video:'Directs the content department’s photography, video concepts and editing approach, then summarises the team’s work.',
 'creative-qc':'Reviews composition, typography, hierarchy, visual consistency and brand accuracy before design work reaches the department head.',
 scheduler:'Prepares calendars and publishing handoffs, checking timing, formats, approvals and the assets required for each post.',
 email:'Writes email campaigns and lifecycle sequences, including subject lines, body copy, calls to action and automation logic.',
 community:'Prepares replies to social messages, classifies customer requests and escalates cases that need a person’s decision.',
 analytics:'Uses supplied performance data to explain social results, identify patterns and recommend what to test next.',
 audit:'Audits website structure, search visibility, content quality and user journeys using the available evidence.',
 proposal:'Builds proposals around client needs, evidence, service scope, deliverables and consistent pricing.',
 bookkeeping:'Organises transaction records and supporting documents, prepares entries and flags missing or inconsistent evidence.',
 billing:'Tracks invoices, payment records and billing exceptions, and prepares clear follow-up actions.',
 pricing:'Compares service scope, costs and commercial assumptions to prepare evidence-based pricing options.',
 margin:'Analyses costs, margins and financial drivers using real supplied records and highlights unexplained changes.',
 subscriptions:'Tracks software and AI subscriptions, recurring costs and usage evidence to identify overlap and renewal decisions.',
 'workflow-architect':'Designs repeatable processes, task dependencies, automation specifications and clear acceptance checks.',
 implementation:'Builds and maintains the website’s application and backend behavior, following the approved design and technical requirements.',
 test:'Independently checks the assembled deliverable against your acceptance criteria before it reaches your review.',
 librarian:'Indexes sources and assets, maintains provenance and helps the team find the right approved material.',
 media:'Plans cuts, pacing, motion, audio and finishing, and prepares editing instructions or uses connected editing tools for the approved scope.',
 integrations:'Designs and verifies the connections between systems, including scoped access, error handling and integration evidence.',
 reliability:'Investigates failures, monitors execution evidence and recommends recovery steps that preserve saved work.',
 evaluation:'Evaluates reusable templates and methods against clear checks, and records improvements for future assignments.',
 knowledge:'Organises the shared Brain, approved lessons and research handoffs so agents use current, relevant evidence.',
 'paid-ads':'Develops campaign hypotheses, audiences, offers, creative angles and a measurement plan before channel execution.',
 instagram:'Adapts the social strategy for Instagram feeds, Reels, Stories and Highlights, with a clear calendar and publishing handoff.',
 linkedin:'Develops LinkedIn content for the target professional audience, including thought leadership, company posts and channel-specific copy.',
 facebook:'Adapts campaigns, posts and community content for Facebook audiences and prepares the approved publishing handoff.',
 'social-qa':'Checks social copy, facts, brand voice, channel fit, accessibility and calendar consistency before the head’s report.',
 videographer:'Develops video concepts, shot lists, camera direction and generation prompts from the approved visual references.',
 'content-qa':'Reviews photography and video direction for reference accuracy, continuity, composition, pacing and brand fit.',
 presentations:'Builds the story, slide structure and visual direction for proposals, pitch decks and brand-guideline presentations.',
 'web-designer':'Designs page structure, visual hierarchy and responsive interfaces around the brand and user journey.',
 'web-research':'Researches audiences, website references, content and technical requirements to inform the web team’s decisions.',
 'web-qa':'Checks website behavior, responsive layout, accessibility, technical quality and the evidence behind the implementation.',
 'ads-lead':'Coordinates paid-media strategy, channel specialists and measurement, then reports campaign decisions and results to your COO.',
 'ads-analyst':'Analyses advertising metrics, tracking quality and conversion patterns using the actual campaign data supplied.',
 'meta-ads':'Plans Meta campaign structure, audiences, placements and creative tests for the agreed objective.',
 'linkedin-ads':'Plans LinkedIn advertising around professional audiences, lead quality, offers and campaign measurement.',
 'youtube-ads':'Plans YouTube ad formats, audience targeting, video angles and measurement requirements.',
 'tiktok-ads':'Plans TikTok ad concepts, creative tests, audience assumptions and conversion measurement.',
 'ads-qa':'Checks ad claims, brand fit, creative quality, targeting logic and tracking evidence before campaign approval.',
 'email-lead':'Owns email strategy, coordinates copy, design and lifecycle logic, and summarises the department’s work for your COO.',
 'email-design':'Designs email layouts, hierarchy and reusable templates with mobile readability and clear calls to action.',
 'email-qa':'Checks email copy, brand, links, consent requirements, segments, mobile layout and send-readiness evidence.',
 'support-lead':'Coordinates customer support, WhatsApp, CRM and bookings, with consistent responses and clear escalation rules.',
 whatsapp:'Prepares WhatsApp responses and conversation flows, respecting approved business facts and escalation boundaries.',
 crm:'Organises lead and customer records, pipeline stages, follow-up requirements and the quality of CRM data.',
 bookings:'Organises booking requests, required details, availability evidence and follow-ups before a booking is confirmed.',
 'support-qa':'Checks reply accuracy, tone, privacy, escalation and consistency across customer conversations and CRM handoffs.',
 'finance-qa':'Checks financial completeness, reconciliation evidence, commercial assumptions and exceptions before the department’s report.',
 'operations-qa':'Checks onboarding, service scope, delivery handoffs and operational acceptance criteria for gaps or contradictions.',
 'research-qa':'Checks research sources, dates, attribution and conclusions, and distinguishes supported findings from assumptions.'
};
export const methodDescriptions={
 social:'Content pillars, channel adaptation, calendar planning and publishing handoffs.',ads:'Campaign hypotheses, targeting, creative testing and measurement plans.',copywriting:'Hooks, benefits, calls to action and brief-specific copy variants.','content-strategy':'Audience, positioning, content pillars and strategic acceptance checks.','design-critique':'Composition, typography, hierarchy and specific design feedback.','design-system':'Reusable brand foundations, visual tokens, components and guidelines.',reconciliation:'Matching records, identifying differences and documenting reconciliation exceptions.','journal-entry-prep':'Preparing supported journal entries and checking the necessary source documents.','higgsfield-generate':'Reference-led prompts, generation settings and review for connected image/video workflows.','higgsfield-brandkit':'Preparing brand-kit inputs and applying approved identity references.',humanizer:'Editing repetitive or unnatural prose while preserving meaning and factual constraints.','ffmpeg-video-editor':'Editing plans, cuts, audio and finishing through connected FFmpeg workflows.','mc-art-direction':'Client-specific creative direction, reference fidelity and visual quality review.','jarvis-office-protocol':'The agent’s own role playbook, handoff rules, scope and evidence requirements.','competitive-brief':'Source-backed competitor comparisons and opportunities.','performance-report':'Reporting results, interpreting source metrics and proposing useful next tests.','variance-analysis':'Financial changes, drivers, assumptions and supporting evidence.','client-onboarding':'Discovery, scope, required sources, brand confirmation and access gaps.','email-lifecycle':'Campaigns, sequences, segment logic and email production handoffs.','support-response':'Triage, accurate replies, escalation and customer-conversation boundaries.','web-production':'Brand-led page planning, responsive design and implementation handoffs.','web-accessibility':'Behavior, responsive quality, accessibility and technical review.','financial-close':'Billing records, close checklists, reconciliation and unresolved exceptions.','seo-website-audit':'Search visibility, information architecture and website content review.','ad-creative-review':'Checking claims, creative quality, offer consistency and performance-test readiness.','brand-voice-review':'Checking tone, brand consistency and supported claims across channels.'
};
Object.assign(methodDescriptions,{
 'jarvis-evidence-review':'Checks claims against the exact artifact revision and supplied sources; separates defects, optional recommendations and missing verification without granting tools or approving production.',
 'jarvis-content-chain':'Connects source facts, hooks, copy, distinct visual scenes, exported assets and review into the requested campaign package.',
 'jarvis-design-contract':'Applies the pinned client identity to component states and responsive layouts, with separate code, render and interaction evidence.',
 'jarvis-audience-lab':'Uses clearly labelled synthetic audience perspectives to propose objections and experiments; does not substitute for real customer research.',
 'jarvis-execution-checkpoint':'Preserves exact task and run state, avoids duplicate actions after uncertain outcomes and routes bounded recovery through the coordinator.',
 'jarvis-edit-profile':'Defines client-specific video pacing, captions, audio and exports using measured source timing, with plans and finished media checked separately.',
 'jarvis-spatial-review':'Reviews connected 3D office staging, circulation, Dubai surroundings and rendered legibility without treating decorative movement as agent work.',
 'jarvis-reference-led-production':'Keeps product truth and brand references separate from visual inspiration for controlled image edits, timed shots and content review.',
 'mc-delivery-loop':'Turns the existing brief into observable acceptance conditions, focused production and evidence-backed review with bounded repairs.',
 'mc-context-handoff':'Preserves task state, exact decisions, source versions and next steps across session boundaries without claiming unavailable memory.',
 'mc-decision-review':'Pressure-tests strategy and creative decisions through evidence, customer value, economics, brand and execution lenses.',
 'mc-file-library':'Curates selected files into client collections while preserving originals, source hashes, rights and review state.',
 'mc-video-edit-plan':'Uses measured transcript timing, edit decisions, visual beats and caption cues to plan and review real footage work.',
 'mc-operations-brief':'Summarises actual task, meeting, customer and document records into decisions, blockers and evidence-linked next actions.'
});
Object.assign(methodDescriptions,Object.fromEntries(roleSkills.roles.map(r=>['office-'+r.roleId,r.specialties.join(' · ')+'. '+r.workflow+' Output: '+r.deliverable+'. '+(r.decisionRules?.[0]??'')])));
const inputs={social:['Brand voice and approved facts','Audience, channels and objective','Calendar, references or performance data'],content:['Product or subject references','Brand direction and formats','Shot brief, footage or approved assets'],design:['Approved logo and brand guidelines','Audience and communication goal','Copy, content and visual references'],web:['Website URL or source checkout','Audience, goals and user journeys','Brand assets and technical requirements'],ads:['Offer, audience and campaign objective','Approved claims and creative assets','Budget scope and actual tracking data'],email:['Audience, segment and campaign goal','Approved offer and brand voice','Email assets, consent and lifecycle context'],support:['Approved business information','Customer message and channel','Response policy and escalation rules'],finance:['Actual invoices and transaction records','Reporting period and service scope','Reconciliation evidence and commercial assumptions'],knowledge:['Exact research question','Dated sources and client context','Approved reference material and prior lessons'],operations:['Outcome and service scope','Client context and owner decisions','Deadlines, dependencies and acceptance criteria']};
const questions={social:['Plan my content','Suggest a focused content plan for the channels and audience in my brief. Ask for the missing approved facts before drafting.'],content:['Plan a shoot','Help me define a photo/video concept and shot plan using my product references and brand direction. Ask for missing assets first.'],design:['Find a design direction','Suggest a visual direction grounded in my approved brand and references. Ask for the format, goal and assets you need first.'],web:['Improve my website','Help me prioritise improvements to my website journey and design. Ask for the URL, audience and goal; separate verified findings from suggestions.'],ads:['Plan a creative test','Suggest a focused advertising test within your specialty. Ask for the offer, audience, approved claims and measurement data first.'],email:['Plan an email sequence','Help me structure an email sequence. Ask for its objective, audience, approved offer and lifecycle context first.'],support:['Help with a reply','Help me draft an accurate customer reply. Ask for the message, approved business facts and escalation policy first.'],finance:['Check my records','Help me identify gaps or inconsistencies in the financial records I provide. Do not invent figures; ask for the reporting period and sources.'],knowledge:['Compare competitors','Help me structure an evidence-led competitor comparison. Ask for the companies, dated sources and strategic question first.'],operations:['Break down a brief','Help me turn my outcome into clear work, dependencies and acceptance criteria. Ask for missing scope or evidence first.']};
export function officeAgentProfile(agent,plan,qaMethods){
 const role=[...plan.executives,...plan.roles].find(r=>r.id===agent.blueprintRoleId);
 const qaDepartment=agent.clientSlot?.startsWith('qa:')?agent.clientSlot.slice(3):agent.qaDepartment;
 const department=[...plan.focusDepartments,...plan.supportDepartments].find(d=>qaDepartment?d.id===qaDepartment:d.roles.includes(agent.blueprintRoleId));
 const qaIds=qaDepartment?qaMethods[qaDepartment]??[]:[],qaRole=plan.skillLibrary.find(s=>qaIds.includes(s.id)&&s.kind==='workflow')?.roles[0];
 const methods=plan.skillLibrary.filter(s=>qaDepartment?qaIds.length>0&&(qaIds.includes(s.id)||s.kind==='supplement'&&s.roles.includes(qaRole??agent.blueprintRoleId)):s.roles.includes(agent.blueprintRoleId));
 const specialist=roleSkills.roles.find(r=>methods.some(s=>s.id==='office-'+r.roleId));
 const isQa=!!qaDepartment||department?.qaRoleId===agent.blueprintRoleId||agent.blueprintRoleId==='test';
 const id=department?.id??'operations',special=questions[id]??questions.operations;
 const purpose=qaDepartment?`Independently reviews ${department?.name??qaDepartment} work for completeness, accuracy, brand fit and evidence before the department’s head summarises it.`:(Object.hasOwn(roleDescriptions,agent.blueprintRoleId)?roleDescriptions[agent.blueprintRoleId]:undefined)??role?.output??'This desk has no configured role description yet.';
 return {roleName:role?.name??agent.name,purpose,departmentName:department?.name??'Coordination',inputs:specialist?.inputs??inputs[id]??inputs.operations,methods:methods.map(s=>({...s,description:(Object.hasOwn(methodDescriptions,s.id)?methodDescriptions[s.id]:undefined)??s.description??'Configured role guidance; inspect its pinned source for the exact method.'})),questions:[{label:'What can you do?',prompt:`Explain your ${agent.name} role, your configured methods and what you can actually deliver with the current connected tools.`},{label:'Inputs you need',prompt:`What exact inputs, sources and approvals do you need for a useful ${agent.name} assignment? Keep the answer specific to your role.`},isQa?{label:'What will you check?',prompt:`What checks would you apply as ${agent.name}? Explain your quality criteria and the evidence you need before approving the work.`}:agent.blueprintRoleId==='presentations'?{label:'Structure my deck',prompt:'Help me build a slide-by-slide narrative. Ask for the audience, goal, approved content and brand references before recommending a structure.'}:{label:special[0],prompt:special[1]},{label:'Review saved work',prompt:'Explain your latest saved work, the sources and methods recorded for it, and anything that still needs attention. State clearly if you have no saved work for this task.'}]};
}
