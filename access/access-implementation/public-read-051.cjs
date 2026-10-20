'use strict';

// Shared, dependency-free policy: bundled into the bridge, COPY'd only to the server.
// This is a staged candidate. Never import it into a browser bundle.
const MODE = 'temporary-public-readonly-051';
const HEADER = 'x-jarvis-public-read-context';
const HARD_STOP = Date.parse('2026-10-21T12:30:00Z');
const CANONICAL_ORIGIN = 'https://jarvis-os.jarvisbotdxb.workers.dev';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Pages beyond this reviewed subset require separate loader/DTO review.
const PAGES = new Set(['/', '/clients', '/finance', '/office', '/office/demo', '/tasks', '/projects', '/roadmap',
  '/agents', '/build', '/skills', '/models', '/tools', '/tools/research', '/tools/finance', '/organisation-structure',
  '/research', '/learning', '/playbooks', '/executions', '/workflow', '/packages', '/queue', '/commands',
  '/audit-reviews', '/reviews', '/cycles', '/sandbox', '/pitch-deck', '/design-system', '/workspaces/social-media','/system-operations',
  '/agent-runs','/prompt-inspector','/clients/new','/cycles/new']);
const CLIENT_OVERVIEW = new RegExp('^/clients/' + UUID + '(?:/(?:brand-strategy|planner|social|visual-intelligence|ai-video|ai-content(?:/studio|/models)?|brain(?:/assets|/pinterest-inspiration)?|graphic-design|content-planning|production-orchestrator|blueprint|content-review))?$', 'i');
const BUSINESS_DETAIL = new RegExp('^/(?:(?:audit-reviews|cycles|deliverables|executions|reviews|sandbox|tasks|workflow)/'+UUID
  +'|clients/'+UUID+'/(?:ai-content/models|brain/products-offers)/'+UUID+')$', 'i');
const CLIENT_READ = new RegExp('^/api/clients/' + UUID + '/(.+)$', 'i');
const BUSINESS_CLIENT_READS = new Set(['overview','social-performance','social-workspace','social-intelligence',
  'blueprint','content-library','content-lineage','guest-models','intelligence-scanner','monthly-plans','social-connections',
  'brain-v2','brain-v2/selector-options','brain-v2/sources/options','brain-v2/sources/file',
  'brain-v2/staff/ai-assets','brain-v2/assets/library','brain-v2/asset-ingestion','pinterest-inspirations',
  'ai-content','ai-content/picker','crm/contacts','profile-image','social-performance/thumbnail']);
const DYNAMIC_CLIENT_READS = new RegExp('^(?:brain-v2/assets/'+UUID+'|brain-v2/(?:menus|activations)/'+UUID+'/document|'
  +'content/'+UUID+'/preview|monthly-plans/'+UUID+'(?:/executions|/concept-grids|/generate|/visual-direction|/items/'+UUID+'/(?:preview|production))?|'
  +'ai-content/'+UUID+'(?:/previews/'+UUID+')?|ai-content/generations/'+UUID+'/download|crm/contacts/'+UUID+')$', 'i');
const BRAIN_SECTIONS = new Set(['intelligence','products_offers','brand_guidelines','assets','sources','learnings']);
// Existing normalized provider GET views only. No OAuth, health-token renewal,
// inbox/WhatsApp, mutation, generation, sync, reply or provider-control endpoint.
const PROVIDER_READS = new Map([
  ['/api/social/accounts',['client_id','clientId','client_name','clientName']],
  ['/api/social/analytics',['client_id','clientId','client_name','clientName','range']],
  ['/api/social/posts',['client_id','clientId','client_name','clientName']],
  ['/api/social/scheduled',['client_id','clientId','client_name','clientName']],
  ['/api/social/instagram-insights',['client_id','clientId','client_name','clientName']],
  ['/api/social/instagram-demographics',['client_id','clientId','client_name','clientName']],
  ['/api/social/profile',[]],['/api/social/highlights',[]],['/api/social/comments',[]],
  ['/api/pinterest/accounts',[]],['/api/pinterest/boards',[]],['/api/pinterest/group',[]],['/api/pinterest/moodboards',[]],
  ['/api/pinterest/pins',['boardId']],['/api/pinterest/direct/boards',[]],['/api/pinterest/direct/pins',['pinId','boardId','boardName']],
]);
const CONTROLLERS = new Map([
  ['/api/home', []], ['/api/navigation', []], ['/api/finance', ['month']],
  ['/api/home/finance', ['month']],
  ['/api/packages', []], ['/api/pitch-deck', []], ['/api/tools/finance', []], ['/api/tools/research', []], ['/api/clients/brain-v2/options', []],
  ['/api/agents', []], ['/api/agent-runs', []], ['/api/roadmap', []], ['/api/tools', []],
]);
// Explicit public columns from the existing 41-table browser boundary; no runtime schema wildcard.
const COLUMNS = Object.freeze({"agent_skills":["id","created_at","agent_id","name","category","description","status","model_recommendation","instructions","metadata"],"agent_task_outputs":["id","created_at","task_id","output_type","title","content","url","status","metadata"],"agent_tasks":["id","created_at","command_id","plan_id","deliverable_id","assigned_agent","title","description","status","priority","position","metadata"],"agents":["id","created_at","agent_name","agent_type","status","description","capabilities","default_model","metadata"],"ai_model_accessories":["id","client_id","model_id","category","name","description","prompt_fragment","status","created_at","updated_at"],"ai_model_assets":["id","model_id","client_id","asset_type","image_url","storage_path","prompt_used","negative_prompt_used","generation_settings","version_number","status","notes","created_at"],"ai_model_outfits":["id","model_id","client_id","outfit_name","occasion","outfit_description","styling_notes","jewelry_notes","hair_notes","makeup_notes","shoes_notes","prompt_fragment","status","created_at","updated_at","collection_style","mood","climate","garments","colour_palette","footwear","fashion_dna","allowed_silhouettes","allowed_materials","allowed_colour_families","footwear_direction"],"ai_model_prompts":["id","model_id","client_id","prompt_type","reference_slot","outfit_id","occasion","scene","camera_angle","lighting_style","format","realism_level","final_prompt","negative_prompt","generation_settings","status","created_at"],"ai_model_relationships":["id","client_id","model_id","related_model_id","relationship_type","relationship_label","future_use","notes","status","created_at","updated_at"],"ai_models":["id","client_id","model_name","model_role","age","gender","nationality","ethnicity_appearance_notes","hair_description","eye_description","skin_tone","body_type","personality","brand_role","approved_usage","restricted_usage","base_prompt","negative_prompt","realism_prompt","quality_prompt","status","created_at","updated_at","height"],"asset_uploads":["id","client_id","file_name","file_path","file_type","asset_category","file_size","uploaded_at","extracted_summary","extraction_status","proposals_count","status","original_size_bytes","optimized_size_bytes","ai_preview_size_bytes","compression_ratio","original_width","original_height","optimized_width","optimized_height","ai_preview_width","ai_preview_height","original_file_path","optimized_file_path","ai_preview_path","optimization_status","extraction_method","pages_processed","cost_usd","source_quality","superseded","superseded_by","metadata","metadata_status","has_metadata","metadata_success_count","metadata_fail_count"],"audit_findings":["id","created_at","audit_session_id","client_id","title","summary","source_ref","confidence","target_table","payload","status","reviewed_at","notes","metadata","original_payload","corrected_payload","final_payload","correction_note","promoted_record_id","review_history"],"audit_sessions":["id","created_at","client_id","title","audit_type","mode","status","raw_content","source_file","metadata"],"brain_update_proposals":["id","client_brain_id","asset_upload_id","client_id","question_key","proposed_answer","current_answer_snapshot","reasoning","confidence","status","reviewed_at","created_at"],"brand_playbooks":["id","created_at","updated_at","workspace_id","client_id","section","title","content_full","content_summary","content_essence","importance","status","metadata","applicable_platforms","applicable_deliverables","applicable_skills","applicable_agents","tags","priority_weight"],"client_brain":["id","client_id","question_key","question_text","answer","source","confidence","calvin_notes","status","created_at","updated_at","approved_at"],"client_knowledge":["id","created_at","client_id","category","title","content","importance","status","metadata"],"clients":["id","created_at","name","industry","status","primary_contact","instagram","website","notes","brain_architecture_version"],"command_plans":["id","created_at","command_id","assigned_agent","plan_title","plan_summary","steps","status","metadata"],"deliverable_activity":["id","created_at","deliverable_id","actor","action","summary","metadata"],"deliverable_assets":["id","created_at","deliverable_id","name","asset_type","file_url","thumbnail_url","prompt","model_used","status","version","metadata"],"deliverable_copy":["id","created_at","deliverable_id","copy_type","title","content","tone","platform","status","version","metadata"],"deliverable_revisions":["id","created_at","deliverable_id","revision_type","requested_by","note","status","metadata"],"deliverables":["id","created_at","client_id","workspace_id","monthly_cycle_id","title","type","platform","status","approval_status","description","content_type","priority","due_date","assigned_agent","position"],"execution_queue":["id","created_at","updated_at","task_id","sandbox_run_id","agent_id","skill_id","model_pricing_id","queue_type","status","priority","prompt_snapshot","output_snapshot","error_message","estimated_input_tokens","estimated_output_tokens","estimated_cost","metadata","command_id","via_sandbox","position"],"execution_reviews":["id","created_at","execution_queue_id","reviewer_agent_id","status","score","strengths","weaknesses","revision_notes","approval_notes","approved","requires_revision","metadata"],"execution_runs":["id","created_at","execution_queue_id","sandbox_run_id","agent_id","model_pricing_id","provider","model","status","prompt_used","raw_response","input_tokens","output_tokens","total_cost","duration_ms","error_message","metadata"],"learning_events":["id","created_at","event_type","source_type","source_ref","client_id","agent_id","skill_id","summary","status","metadata"],"model_pricing":["id","created_at","provider","model_name","display_name","input_price_per_million","output_price_per_million","status","metadata"],"monthly_cycles":["id","created_at","client_id","workspace_id","month","year","status","title","description","start_date","end_date","metadata"],"platform_rules":["id","created_at","platform","rule_type","title","content_full","content_summary","content_essence","importance","status","metadata"],"projects":["id","created_at","client_id","project_name","status","shoot_date","deliverables","notes"],"rejection_patterns":["id","created_at","execution_run_id","execution_review_id","client_id","agent_id","skill_id","issue_type","description","correction","severity","recurrence_count","status","metadata"],"research_library":["id","created_at","title","category","source_type","source_name","url","summary","key_insights","tags","importance","status","metadata"],"research_links":["id","created_at","research_id","client_id","skill_id","agent_id","monthly_cycle_id","link_type","notes","metadata"],"sandbox_runs":["id","created_at","task_id","agent_id","skill_id","run_type","model","status","prompt_preview","response_preview","notes","estimated_input_tokens","estimated_output_tokens","estimated_cost","metadata","command_id"],"skill_lessons":["id","created_at","skill_id","agent_id","source_type","source_ref","lesson","importance","status","promoted","metadata"],"successful_outputs":["id","created_at","execution_run_id","execution_review_id","client_id","agent_id","skill_id","output_type","title","content","why_successful","reusable_pattern","status","metadata"],"telegram_commands":["id","created_at","source","sender","raw_message","interpreted_intent","client_id","monthly_cycle_id","deliverable_id","status","priority","assigned_agent","result_summary","metadata"],"token_budgets":["id","created_at","agent_id","task_type","total_budget","allocation","metadata"],"workspaces":["id","created_at","client_id","name","type","status"]});
const forbidden = /^(?:upgrade|next-action|x-http-method-override|x-method-override|x-middleware-.*|x-nextjs-.*)$/i;
const fail = (status, reason) => ({ allowed: false, status, reason });

function enabled(env, now = Date.now()) {
  const until = Date.parse(env.JARVIS_PUBLIC_READ_ONLY_UNTIL || '');
  return env.JARVIS_PUBLIC_READ_ONLY_MODE === MODE && Number.isFinite(until)
    && now < until && until <= HARD_STOP && now < HARD_STOP;
}
function configuredKey(env) {
  const key = env.JARVIS_PUBLIC_READ_CONTEXT_KEY;
  // Require a freshly generated 256-bit hex key, never an existing runtime token.
  return typeof key === 'string' && /^[a-f0-9]{64}$/.test(key) ? key : null;
}
function uniqueParameters(url) {
  const keys = [...url.searchParams.keys()];
  return new Set(keys).size === keys.length && url.search.length <= 4096;
}
function projectionFor(table, expression, rewriteStar, depth = 0) {
  if (depth > 4 || !Object.hasOwn(COLUMNS, table)) throw Error('Unreviewed relation.');
  let cursor = 0;
  function identifier() {
    const result = /^[a-z_][a-z0-9_]*/i.exec(expression.slice(cursor));
    if (!result) throw Error('Invalid projection identifier.');
    cursor += result[0].length; return result[0];
  }
  function spaces() { while (/\s/.test(expression[cursor] || '') && cursor < expression.length) cursor++; }
  const fields = [];
  while (cursor < expression.length) {
    spaces();
    if (expression[cursor] === '*') {
      if (!rewriteStar) throw Error('Unexpanded wildcard.');
      cursor++; fields.push(...COLUMNS[table]);
    } else {
      let name = identifier(), alias = '';
      if (expression[cursor] === ':' && expression[cursor + 1] !== ':') { alias = name + ':'; cursor++; name = identifier(); }
      let hint = '';
      if (expression[cursor] === '!') { cursor++; hint = '!' + identifier(); }
      if (expression[cursor] === '(') {
        if (!Object.hasOwn(COLUMNS, name)) throw Error('Unreviewed relation table.');
        const start = ++cursor; let nesting = 1;
        while (cursor < expression.length && nesting) {
          if (expression[cursor] === '(') nesting++;
          if (expression[cursor] === ')') nesting--;
          if (nesting) cursor++;
        }
        if (nesting) throw Error('Unclosed relation.');
        const nested = expression.slice(start, cursor++);
        fields.push(alias + name + hint + '(' + projectionFor(name, nested, rewriteStar, depth + 1) + ')');
      } else {
        if (hint || !COLUMNS[table].includes(name)) throw Error('Unreviewed column.');
        fields.push(alias + name);
      }
    }
    spaces();
    if (cursor === expression.length) break;
    if (expression[cursor++] !== ',' || cursor === expression.length) throw Error('Invalid projection grammar.');
  }
  if (!fields.length || new Set(fields).size !== fields.length) throw Error('Empty or duplicate projection.');
  return fields.join(',');
}
function publicFilter(value) {
  if (value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return false;
  if (/^(?:not\.)?in\.\([a-zA-Z0-9 _:@+.*"-]+(?:,[a-zA-Z0-9 _:@+.*"-]+)*\)$/.test(value)) return true;
  if (/^(?:not\.)?is\.(?:null|true|false|unknown)$/.test(value)) return true;
  return /^(?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike)\.[^()\x00-\x1f\x7f]{1,1024}$/.test(value);
}
function publicLogic(table, value, depth = 0) {
  if (depth > 3 || value.length > 2048 || value[0] !== '(' || !value.endsWith(')')) return false;
  const terms = []; let nesting = 0, start = 1;
  for (let i = 1; i < value.length - 1; i++) {
    if (value[i] === '(') nesting++;
    if (value[i] === ')') nesting--;
    if (nesting < 0) return false;
    if (value[i] === ',' && nesting === 0) { terms.push(value.slice(start,i)); start = i + 1; }
  }
  terms.push(value.slice(start,-1));
  return nesting === 0 && terms.every(term => {
    if (/^(?:and|or)\(/.test(term)) return publicLogic(table, term.slice(term.indexOf('(')), depth + 1);
    const index = term.indexOf('.');
    return index > 0 && COLUMNS[table].includes(term.slice(0,index)) && publicFilter(term.slice(index+1));
  });
}
function tablePolicy(url, rewriteStar) {
  const match = /^\/api\/owner-data\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (!match || !Object.hasOwn(COLUMNS, match[1])) return fail(403, 'Unreviewed public data table.');
  const table = match[1], columns = COLUMNS[table];
  try {
    const projection = projectionFor(table, url.searchParams.get('select') || (rewriteStar ? '*' : ''), rewriteStar);
    url.searchParams.set('select', projection);
  } catch { return fail(400, 'Unreviewed projection or relation.'); }
  for (const [name, value] of url.searchParams) {
    if (name === 'select') continue;
    if (name === 'order') {
      if (!value.split(',').every(x => {
        const [column, direction, nulls, ...extra] = x.split('.');
        return columns.includes(column) && (!direction || ['asc', 'desc'].includes(direction))
          && (!nulls || ['nullsfirst', 'nullslast'].includes(nulls)) && extra.length === 0;
      })) return fail(400, 'Unsupported public ordering.');
    } else if (name === 'limit' || name === 'offset') {
      if (!/^\d{1,6}$/.test(value) || Number(value) > (name === 'limit' ? 1000 : 100000))
        return fail(400, 'Public pagination exceeds its bound.');
    } else if (name === 'or' || name === 'and') {
      if (!publicLogic(table, value)) return fail(400, 'Unsupported public logic filter.');
    } else if (!columns.includes(name) || !publicFilter(value)) return fail(400, 'Unsupported public filter.');
  }
  if (rewriteStar && !url.searchParams.has('limit')) url.searchParams.set('limit', '1000');
  if (!url.searchParams.has('limit')) return fail(400, 'Explicit bounded limit required.');
  if (url.search.length > 4096) return fail(400, 'Expanded projection exceeds its bound.');
  return { allowed: true, kind: 'table', url: url.href };
}
function policy(request, { rewriteStar = false } = {}) {
  const url = new URL(request.url), path = url.pathname;
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Public access is read-only.');
  for (const [name] of request.headers) if (forbidden.test(name)) return fail(403, 'Protocol/action override denied.');
  if (request.headers.has('content-length') && request.headers.get('content-length') !== '0')
    return fail(400, 'Read bodies are unavailable.');
  // Existing media proxy limits access to these two buckets and sandboxes active
  // content. Permit encoded file names without accepting encoded path separators.
  if (path.startsWith('/api/owner-media/') && !url.search && !url.username && !url.password && !url.hash) {
    try {
      const parts = path.split('/').map(part => decodeURIComponent(part));
      if (['guest-models','thumbnails'].includes(parts[3]) && parts.length >= 5
        && parts.slice(4).every(part => part && !['.','..'].includes(part) && !/[\\/%?#\x00-\x1f]/.test(part)))
        return {allowed:true,kind:'file-view',url:url.href};
    } catch { /* Deny malformed encoding below. */ }
  }
  if (/[\\%\x00-\x20\x7f]/.test(path) || path.includes('//') || !uniqueParameters(url))
    return fail(400, 'Noncanonical request.');
  if (url.username || url.password || url.hash) return fail(400, 'Noncanonical URL.');
  if (path.startsWith('/api/owner-data/')) return tablePolicy(url, rewriteStar);
  if (PAGES.has(path) || CLIENT_OVERVIEW.test(path) || BUSINESS_DETAIL.test(path)) {
    for (const [name, value] of url.searchParams) {
      const rsc = name === '_rsc' && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
      const scalar = ['tab','view','section','subsection','plan','month','workflow','session','sessionId','model','modelId',
        'record','recordId','asset','assetId','folder','filter','status','search','category','clientId'].includes(name)
        && value.length <= 160 && !/[\x00-\x1f<>]/.test(value);
      if ((!rsc && !scalar) || (name === 'section' && value === 'logins')) return fail(400, 'Unsupported page parameter.');
    }
    return { allowed: true, kind: 'page', url: url.href };
  }
  const clientRead = CLIENT_READ.exec(path);
  if (clientRead && (BUSINESS_CLIENT_READS.has(clientRead[1]) || DYNAMIC_CLIENT_READS.test(clientRead[1]))) {
    const suffix = clientRead[1];
    const allowedNames = new Set(['view','section','record_id','file_id','slot','v','path','month_start','month','page','page_size',
      'filter','search','status','analysisState','category','shotScale','cameraAngle','composition','humanPresence','interaction','technique','lighting','correction','pinterest_reference_id']);
    for (const [name, value] of url.searchParams) {
      if (!allowedNames.has(name) || value.length > 512 || /[\x00-\x1f]/.test(value)) return fail(400, 'Unsupported client read parameter.');
      if (name === 'section' && !BRAIN_SECTIONS.has(value)) return fail(403, 'Credential sections are private.');
      if (['record_id','file_id','v'].includes(name) && !new RegExp('^'+UUID+'$', 'i').test(value)) return fail(400, 'Invalid record reference.');
    }
    if (suffix === 'profile-image' && !['avatar','cover'].includes(url.searchParams.get('slot'))) return fail(400, 'Invalid profile slot.');
    if (suffix === 'social-performance/thumbnail' && !/^social-thumbnails\/(?:instagram|facebook)\/[a-zA-Z0-9_-]+\.jpg$/.test(url.searchParams.get('path') || '')) return fail(400, 'Invalid cached thumbnail.');
    return { allowed: true, kind: suffix.includes('preview') || suffix.includes('thumbnail') ? 'file-view' : 'client-read', url: url.href };
  }
  if (new RegExp('^/api/finance/invoices/'+UUID+'/attachment/'+UUID+'$', 'i').test(path) && !url.search)
    return { allowed:true, kind:'client-read', url:url.href };
  if (new RegExp('^/api/tools/research/'+UUID+'$', 'i').test(path) && !url.search)
    return { allowed:true, kind:'controller', url:url.href };
  if (new RegExp('^/api/roadmap/ideas(?:/'+UUID+')?$', 'i').test(path) && !url.search)
    return { allowed:true, kind:'controller', url:url.href };
  if (['/api/ai/usage','/api/ai/models/available'].includes(path)) {
    for (const [name,value] of url.searchParams) {
      if (name === 'client_id' && new RegExp('^'+UUID+'$', 'i').test(value)) continue;
      if (path === '/api/ai/usage' && name === 'hours' && /^\d{1,3}$/.test(value) && +value <= 720) continue;
      return fail(400,'Unsupported model/usage query.');
    }
    return {allowed:true,kind:'controller',url:url.href};
  }
  if (PROVIDER_READS.has(path)) {
    for (const [name,value] of url.searchParams) {
      if (!PROVIDER_READS.get(path).includes(name) || !value || value.length > 160 || /[\x00-\x1f<>\\/]/.test(value))
        return fail(400,'Unsupported provider read query.');
      if (['client_id','clientId'].includes(name) && !new RegExp('^'+UUID+'$', 'i').test(value)) return fail(400,'Invalid client.');
      if (name === 'range' && !['30d','90d','all'].includes(value)) return fail(400,'Invalid analytics range.');
      if (['pinId','boardId'].includes(name) && !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) return fail(400,'Invalid provider record.');
    }
    return {allowed:true,kind:'provider-read',url:url.href};
  }
  if (CONTROLLERS.has(path)) {
    for (const [name, value] of url.searchParams) {
      if (!CONTROLLERS.get(path).includes(name) || (name === 'month' && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)))
        return fail(400, 'Unsupported controller parameter.');
    }
    return { allowed: true, kind: 'controller', url: url.href };
  }
  if (url.search) return fail(400, 'Static queries are unavailable.');
  if (/^\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|svg|ico)$/.test(path)
    || /^\/office-demo-static\/[a-z0-9/_.-]+\.(?:js|css|json|webp|jpg|jpeg|png|svg|wasm|glb|gltf|bin|woff2?)$/.test(path)
    || path === '/favicon.ico') return { allowed: true, kind: 'static', url: url.href };
  return fail(403, 'This public read route has not been reviewed.');
}
function utf8(value) { return new TextEncoder().encode(value); }
function hex(bytes) { return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function cryptoKey(env) {
  const key = configuredKey(env);
  if (!key) throw new Error('Public read context is not configured.');
  return crypto.subtle.importKey('raw', Uint8Array.from(key.match(/../g), x => parseInt(x, 16)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(request, env, now = Date.now()) {
  if (!enabled(env, now) || !policy(request).allowed) throw new Error('Public read context denied.');
  const url = new URL(request.url);
  if (url.origin !== CANONICAL_ORIGIN) throw new Error('Public read context origin denied.');
  const issued = Math.floor(now / 1000);
  const until = Math.floor(Math.min(Date.parse(env.JARVIS_PUBLIC_READ_ONLY_UNTIL), HARD_STOP) / 1000);
  const payload = JSON.stringify({ purpose: MODE, method: request.method, target: url.href,
    iat: issued, exp: Math.min(issued + 30, until) });
  // UTF-8 payload stays inside a single canonical base64url token.
  const encoded = btoa(String.fromCharCode(...utf8(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return encoded + '.' + hex(await crypto.subtle.sign('HMAC', await cryptoKey(env), utf8(encoded)));
}
async function verify(request, env, now = Date.now()) {
  if (!enabled(env, now) || !configuredKey(env) || !['GET', 'HEAD'].includes(request.method)) return false;
  const token = request.headers.get(HEADER) || '';
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) return false;
  try {
    const [encoded, mac] = token.split('.');
    const valid = await crypto.subtle.verify('HMAC', await cryptoKey(env),
      Uint8Array.from(mac.match(/../g), x => parseInt(x, 16)), utf8(encoded));
    if (!valid) return false;
    const claim = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), x => x.charCodeAt(0))));
    const seconds = Math.floor(now / 1000), target = new URL(claim.target);
    if (Object.keys(claim).sort().join(',') !== 'exp,iat,method,purpose,target'
      || claim.purpose !== MODE || !Number.isSafeInteger(claim.iat) || !Number.isSafeInteger(claim.exp)
      || claim.iat > seconds || claim.iat < seconds - 30 || claim.exp <= seconds
      || claim.exp > claim.iat + 30 || claim.exp * 1000 > Date.parse(env.JARVIS_PUBLIC_READ_ONLY_UNTIL)
      || claim.exp * 1000 > HARD_STOP || target.origin !== CANONICAL_ORIGIN) return false;
    const incoming = new URL(request.url);
    // Exact, bounded exception for Home's existing synthetic Request. No arbitrary forwarded URL.
    const homeSSR = incoming.href === 'http://jarvis-internal/' && request.method === 'GET'
      && target.pathname === '/' && ['GET', 'HEAD'].includes(claim.method);
    if (incoming.hostname === 'jarvis-internal' && !homeSSR) return false;
    // Node/Next may reconstruct an internal http://localhost:3000 origin after
    // the DO forwards a request. Authenticate the pinned origin in the signed
    // claim; bind the actual request method/path/query without trusting Host or
    // Forwarded headers to reconstruct its external origin.
    if (!homeSSR && (request.method !== claim.method || incoming.pathname !== target.pathname
      || incoming.search !== target.search || incoming.username || incoming.password || incoming.hash)) return false;
    const signedRequest = new Request(target, { method: claim.method, headers: request.headers });
    return policy(signedRequest).allowed;
  } catch { return false; }
}
async function ownerForPublicReadOrOwner(request, env, authorizeOriginalOwner) {
  if (!request.headers.has(HEADER)) return authorizeOriginalOwner();
  if (await verify(request, env)) return { subject: 'public-read-051', email: 'public-read@example.invalid' };
  return Response.json({ error: 'Public read context denied.' }, { status: 403, headers: { 'cache-control': 'no-store' } });
}
function upstreamHeaders(request) {
  const headers = new Headers();
  // Deliberately drop JWT/cookies/owner IDs/internal tokens, Origin, Prefer, schema,
  // ranges, forwarded host and Next router/middleware/revalidation override headers.
  for (const name of ['accept', 'accept-language', 'user-agent']) {
    const value = request.headers.get(name);
    if (value && value.length <= 1024) headers.set(name, value);
  }
  // Full route RSC rendering follows the URL; never accept a client-supplied router tree.
  if (request.headers.get('rsc') === '1') headers.set('rsc', '1');
  const prefer = request.headers.get('prefer');
  if (prefer && /^count=(?:exact|planned|estimated)$/.test(prefer)) headers.set('prefer', prefer);
  const range = request.headers.get('range');
  if (range && /^bytes=\d{1,12}-\d{0,12}$/.test(range)) headers.set('range', range);
  return headers;
}
module.exports = { MODE, HEADER, HARD_STOP, CANONICAL_ORIGIN, COLUMNS, enabled, configuredKey,
  policy, sign, verify, ownerForPublicReadOrOwner, upstreamHeaders };
