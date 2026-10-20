-- Agents V2: a system-level company organization layered over the existing
-- legacy agents and agent_skills records. This deliberately preserves legacy
-- agent IDs so execution history, skills and existing screens remain intact.

create table if not exists public.agent_departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  purpose text not null check (char_length(purpose) between 1 and 420),
  sort_order integer not null default 0,
  is_future boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_organization_profiles (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  department_id uuid not null references public.agent_departments(id) on delete restrict,
  manager_agent_id uuid references public.agents(id) on delete set null,
  role_title text not null check (char_length(role_title) between 1 and 160),
  operational_status text not null default 'planned' check (operational_status in ('active', 'experimental', 'planned', 'blocked', 'deprecated')),
  purpose text not null check (char_length(purpose) between 1 and 720),
  responsibilities text[] not null default '{}'::text[],
  boundaries text[] not null default '{}'::text[],
  input_requirements text[] not null default '{}'::text[],
  output_responsibilities text[] not null default '{}'::text[],
  context_access text[] not null default '{}'::text[],
  approval_requirements text,
  escalation_path text,
  os_release_overrides text[] not null default '{}'::text[] check (os_release_overrides <@ array['os1-create', 'os2-distribute', 'os3-grow', 'os4-operate']::text[]),
  is_executive boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_tool_links (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  tool_id uuid not null references public.tool_registry(id) on delete restrict,
  access_type text not null default 'allowed' check (access_type in ('allowed', 'required')),
  created_at timestamptz not null default now(),
  unique (agent_id, tool_id, access_type)
);

create table if not exists public.agent_capability_links (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete restrict,
  relationship_type text not null default 'supports' check (relationship_type in ('owns', 'supports', 'candidate_for')),
  created_at timestamptz not null default now(),
  unique (agent_id, roadmap_item_id, relationship_type)
);

create table if not exists public.agent_organization_activity (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  action_type text not null check (action_type in ('seeded', 'created', 'updated', 'status_changed', 'organization_changed')),
  description text not null check (char_length(description) between 1 and 360),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_organization_profiles_department_idx on public.agent_organization_profiles(department_id, operational_status, sort_order);
create index if not exists agent_organization_profiles_manager_idx on public.agent_organization_profiles(manager_agent_id);
create index if not exists agent_tool_links_agent_idx on public.agent_tool_links(agent_id);
create index if not exists agent_tool_links_tool_idx on public.agent_tool_links(tool_id);
create index if not exists agent_capability_links_agent_idx on public.agent_capability_links(agent_id);
create index if not exists agent_capability_links_capability_idx on public.agent_capability_links(roadmap_item_id);
create index if not exists agent_organization_activity_agent_created_idx on public.agent_organization_activity(agent_id, created_at desc);

create or replace function public.agent_organization_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_departments_set_updated_at on public.agent_departments;
create trigger agent_departments_set_updated_at before update on public.agent_departments
for each row execute function public.agent_organization_set_updated_at();

drop trigger if exists agent_organization_profiles_set_updated_at on public.agent_organization_profiles;
create trigger agent_organization_profiles_set_updated_at before update on public.agent_organization_profiles
for each row execute function public.agent_organization_set_updated_at();

alter table public.agent_departments enable row level security;
alter table public.agent_organization_profiles enable row level security;
alter table public.agent_tool_links enable row level security;
alter table public.agent_capability_links enable row level security;
alter table public.agent_organization_activity enable row level security;

revoke all on public.agent_departments, public.agent_organization_profiles, public.agent_tool_links, public.agent_capability_links, public.agent_organization_activity from anon, authenticated;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


with departments as (select id, slug from public.agent_departments),
openclaw as (select id from public.agents where agent_name = 'OpenClaw')
insert into public.agent_organization_profiles (
  agent_id, department_id, manager_agent_id, role_title, operational_status, purpose,
  responsibilities, boundaries, input_requirements, output_responsibilities, context_access,
  approval_requirements, escalation_path, os_release_overrides, is_executive, sort_order
)
select a.id, d.id,
  case when a.agent_name = 'OpenClaw' then null else (select id from openclaw) end,
  seed.role_title, seed.operational_status, seed.purpose, seed.responsibilities, seed.boundaries,
  seed.input_requirements, seed.output_responsibilities, seed.context_access, seed.approval_requirements,
  seed.escalation_path, seed.os_release_overrides, seed.is_executive, seed.sort_order
from (values
  ('OpenClaw', 'operations-delivery', 'Chief Operating Officer / Chief Orchestrator', 'experimental', 'Coordinates bounded specialist work and escalation paths across the Jarvis operating model without replacing specialist accountability.', array['Coordinate specialist handoffs', 'Maintain operational visibility', 'Escalate decisions requiring human authority']::text[], array['Does not become the creative, research or publishing specialist', 'Does not bypass human approval', 'Does not claim an app-native autonomous execution path']::text[], array['Approved brief or operational request', 'Available specialist and tool state']::text[], array['Delegated work plan', 'Escalation or decision request', 'Accountable routing recommendation']::text[], array['System-level operating context', 'Non-secret tool and roadmap state']::text[], 'Human approval is required for client-impacting, financial or publishing decisions.', 'Escalate to Calvin / MC Studios for final authority.', array['os1-create','os2-distribute','os3-grow','os4-operate']::text[], true, 1),
  ('Jarvis Orchestrator', 'operations-delivery', 'Workflow Orchestrator', 'active', 'Routes known command patterns and keeps task flow visible across the legacy Jarvis execution system.', array['Route known commands', 'Create bounded plans', 'Delegate named legacy agent tasks']::text[], array['Does not approve client-facing work', 'Does not perform specialist creative production', 'Does not override canonical source truth']::text[], array['Command text', 'Known task routing pattern']::text[], array['Assigned task or plan', 'Execution status update']::text[], array['System task and execution context']::text[], 'Escalate unclear requests and client-impacting decisions.', 'Escalate through OpenClaw to Calvin / MC Studios.', array['os1-create']::text[], false, 10),
  ('Strategy Agent', 'strategy-intelligence', 'Strategy & Intelligence Agent', 'active', 'Builds evidence-led content strategy, campaign framing and planning direction.', array['Develop strategy briefs', 'Plan campaigns', 'Interpret trends and research']::text[], array['Does not invent client facts', 'Does not publish or approve final work']::text[], array['Client intelligence', 'Approved sources', 'Performance context']::text[], array['Strategy brief', 'Campaign plan', 'Decision-ready recommendations']::text[], array['Approved Client Brain intelligence', 'Source-backed research']::text[], 'Human review for client-facing strategy and commercial decisions.', 'Escalate unresolved evidence gaps to Calvin / MC Studios.', array['os1-create','os4-operate']::text[], false, 20),
  ('Copywriting Agent', 'creative', 'Copywriting Agent', 'active', 'Produces platform-aware copy from approved strategy, brand guidance and verified business truth.', array['Write captions and copy', 'Adapt voice by channel', 'Create scripts and headlines']::text[], array['Does not set commercial facts', 'Does not publish', 'Does not fabricate offers, prices or operating details']::text[], array['Approved brief', 'Brand rules', 'Verified offer or product truth']::text[], array['Draft copy', 'Caption variants', 'Channel-ready text']::text[], array['Approved brand guidance', 'Verified client operations and offers']::text[], 'Human approval is required before external publishing.', 'Escalate factual ambiguity to Strategy or Data Librarian.', array['os1-create']::text[], false, 30),
  ('AI Image Agent', 'creative', 'AI Photography Agent', 'active', 'Assembles grounded visual-generation direction from approved assets, prompt rules and selected provider paths.', array['Assemble image prompts', 'Use selected asset truth', 'Create generation-ready visual direction']::text[], array['Does not invent source truth', 'Does not approve outputs', 'Does not bypass provider availability']::text[], array['Approved assets', 'Prompt instruction', 'Creative direction']::text[], array['Generation prompt', 'Reference-grounded visual output request']::text[], array['Approved client assets', 'Visual DNA', 'Prompt V2 truth rules']::text[], 'Human review is required before client use.', 'Escalate provider failure to Operations and visual-quality concerns to Creative Quality.', array['os1-create']::text[], false, 40),
  ('AI Video Agent', 'creative', 'AI Video Agent', 'planned', 'Will coordinate bounded video-generation workflows when an approved provider and OS 2 delivery path are operational.', array['Plan video prompts', 'Coordinate reel production', 'Manage video asset handoff']::text[], array['No live autonomous video execution is claimed', 'Does not publish']::text[], array['Approved visual brief', 'Provider-ready source assets']::text[], array['Video generation plan', 'Video-ready output package']::text[], array['Approved visual assets', 'Approved creative direction']::text[], 'Human approval required for provider selection and final output.', 'Escalate provider or budget decisions to Calvin / MC Studios.', array['os2-distribute']::text[], false, 50),
  ('Creative Director Agent', 'creative-quality', 'Creative Director', 'active', 'Directs and reviews creative work against brand principles, composition, realism and intended audience response.', array['Set visual direction', 'Review creative fit', 'Protect brand consistency']::text[], array['Does not replace human final approval', 'Does not alter verified business truth']::text[], array['Approved brief', 'Brand and visual guidance', 'Creative output']::text[], array['Creative direction', 'Review notes', 'Revision recommendation']::text[], array['Brand guidance', 'Visual DNA', 'Approved creative assets']::text[], 'Human approval required for client-facing final approvals.', 'Escalate client-sensitive interpretation to Calvin / MC Studios.', array['os1-create']::text[], false, 60),
  ('QC Agent', 'creative-quality', 'Quality Control Agent', 'active', 'Checks output completeness, brand alignment and factual-risk signals before human review.', array['Perform quality checks', 'Detect output gaps', 'Flag factual and brand risks']::text[], array['Does not approve client work alone', 'Does not generate source facts']::text[], array['Draft output', 'Brand and source constraints']::text[], array['QC result', 'Flagged issues', 'Review checklist']::text[], array['Approved brand rules', 'Verified client truth']::text[], 'All client-facing work still requires a human approval state.', 'Escalate failed checks to the responsible specialist and Creative Director.', array['os1-create']::text[], false, 70),
  ('Data Librarian Agent', 'operations-delivery', 'Data & Asset Intelligence Agent', 'active', 'Maintains structured asset and knowledge retrieval discipline for reusable client truth.', array['Classify metadata', 'Maintain retrieval hygiene', 'Protect source provenance']::text[], array['Does not infer menu truth without evidence', 'Does not delete source records without approval']::text[], array['Uploaded assets', 'Sources', 'Metadata review instruction']::text[], array['Structured metadata', 'Retrieval-ready truth', 'Review flags']::text[], array['Client Brain sources', 'Asset metadata', 'Menu knowledge']::text[], 'Review is required before uncertain metadata becomes canonical.', 'Escalate conflicts to the responsible client intelligence owner.', array['os1-create','os4-operate']::text[], false, 80),
  ('Reporting Agent', 'learning-optimization', 'Reporting & Insights Agent', 'active', 'Summarizes verified performance data into readable reporting without inventing causal claims.', array['Create performance reports', 'Summarize analytics', 'Surface evidence limits']::text[], array['Does not compare formats unfairly', 'Does not claim causal strategy proof without evidence']::text[], array['Connected analytics', 'Published content metrics', 'Approved comparison grouping']::text[], array['Performance summary', 'Evidence notes', 'Low-confidence warnings']::text[], array['Connected social analytics', 'Approved reporting data']::text[], 'Human review is required before external reporting.', 'Escalate missing or mixed account data to Operations.', array['os2-distribute','os3-grow','os4-operate']::text[], false, 90),
  ('Paid Ads Agent', 'growth', 'Paid Media Agent', 'planned', 'Will manage approved paid-media planning and measurement after Meta and Google Ads connections are intentionally authorized.', array['Prepare paid-media plans', 'Support audience targeting', 'Interpret paid performance']::text[], array['No live spend changes', 'No campaign launch without human approval', 'No provider connection is claimed']::text[], array['Approved campaign brief', 'Connected account data', 'Human budget authorization']::text[], array['Media plan', 'Creative brief', 'Performance interpretation']::text[], array['Approved campaign and audience context']::text[], 'Human approval is mandatory for budgets, launches and edits.', 'Escalate all spend decisions to Calvin / MC Studios.', array['os2-distribute','os3-grow']::text[], false, 100),
  ('Social Distribution Agent', 'social-distribution', 'Social Distribution Agent', 'planned', 'Will prepare approved content for scheduling and controlled multi-platform delivery when live publishing is intentionally enabled.', array['Validate schedule packages', 'Coordinate publishing handoff', 'Track platform delivery state']::text[], array['No publishing without explicit human approval', 'No direct provider mutation while dry-run mode is active']::text[], array['Approved content', 'Connected account', 'Validated hosted media', 'Schedule']::text[], array['Platform schedule package', 'Publishing status', 'Failure handoff']::text[], array['Approved planner content', 'Connected social account data']::text[], 'Explicit final approval is required before schedule mutation.', 'Escalate any provider mutation or failure to Calvin / MC Studios.', array['os1-create','os2-distribute']::text[], false, 110),
  ('Customer CRM Agent', 'customer-crm', 'Customer & CRM Agent', 'planned', 'Will support consented guest intelligence, reservation and retention workflows after client-specific CRM connections are authorized.', array['Interpret guest preferences', 'Support retention workflows', 'Prepare approved service intelligence']::text[], array['No outreach without consent and approval', 'No access to guest data without authorized connection']::text[], array['Authorized CRM data', 'Consent state', 'Approved workflow']::text[], array['Guest insight', 'Retention recommendation', 'Approved outreach draft']::text[], array['Authorized guest and reservation data only']::text[], 'Human approval and consent validation are mandatory.', 'Escalate privacy, consent or service-risk issues to Calvin / MC Studios.', array['os3-grow']::text[], false, 120),
  ('Research & Intelligence Agent', 'strategy-intelligence', 'Research & Intelligence Agent', 'planned', 'Will acquire and route source-backed market evidence for reviewable strategic intelligence.', array['Collect source-backed research', 'Preserve provenance', 'Surface market evidence']::text[], array['Does not treat acquisition as confirmed truth', 'Does not publish research without review']::text[], array['Research brief', 'Approved source constraints']::text[], array['Evidence pack', 'Source records', 'Confidence and gap flags']::text[], array['Public sources', 'Approved client research context']::text[], 'Review is required before research changes client truth.', 'Escalate ambiguous or conflicting evidence to Strategy and human authority.', array['os4-operate']::text[], false, 130),
  ('Learning & Optimization Agent', 'learning-optimization', 'Learning & Optimization Agent', 'planned', 'Will turn verified cross-channel evidence into controlled improvement recommendations once learning infrastructure is operational.', array['Group fair comparisons', 'Extract reusable learnings', 'Recommend measured improvements']::text[], array['Does not regenerate or change live work automatically', 'Does not make unsupported performance claims']::text[], array['Validated performance data', 'Defined comparison groups', 'Human learning objective']::text[], array['Learning record', 'Optimization recommendation', 'Confidence note']::text[], array['Approved analytics and learning records']::text[], 'Human review is required before any change to strategy or live workflows.', 'Escalate low-confidence findings to Reporting and human authority.', array['os4-operate']::text[], false, 140)
) as seed(agent_name, department_slug, role_title, operational_status, purpose, responsibilities, boundaries, input_requirements, output_responsibilities, context_access, approval_requirements, escalation_path, os_release_overrides, is_executive, sort_order)
join public.agents a on a.agent_name = seed.agent_name
join departments d on d.slug = seed.department_slug
on conflict (agent_id) do update set
  department_id = excluded.department_id, manager_agent_id = excluded.manager_agent_id, role_title = excluded.role_title,
  operational_status = excluded.operational_status, purpose = excluded.purpose, responsibilities = excluded.responsibilities,
  boundaries = excluded.boundaries, input_requirements = excluded.input_requirements, output_responsibilities = excluded.output_responsibilities,
  context_access = excluded.context_access, approval_requirements = excluded.approval_requirements, escalation_path = excluded.escalation_path,
  os_release_overrides = excluded.os_release_overrides, is_executive = excluded.is_executive, sort_order = excluded.sort_order;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

