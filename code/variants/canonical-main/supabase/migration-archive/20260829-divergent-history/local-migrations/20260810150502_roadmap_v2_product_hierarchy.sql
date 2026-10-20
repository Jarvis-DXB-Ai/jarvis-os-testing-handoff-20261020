-- Product Roadmap V2
-- Keeps the existing Roadmap domain intact while adding a product hierarchy:
-- Release (roadmap_phases) -> Capability (roadmap_items) -> implementation item.

alter table public.roadmap_phases
  add column if not exists release_status text not null default 'legacy',
  add column if not exists goal text,
  add column if not exists completion_condition text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.roadmap_phases
  drop constraint if exists roadmap_phases_release_status_check;
alter table public.roadmap_phases
  add constraint roadmap_phases_release_status_check
  check (release_status in ('active', 'upcoming', 'complete', 'future', 'archived', 'legacy'));

alter table public.roadmap_items
  add column if not exists parent_item_id uuid references public.roadmap_items(id) on delete set null;

alter table public.roadmap_items
  drop constraint if exists roadmap_items_item_type_check;
alter table public.roadmap_items
  add constraint roadmap_items_item_type_check
  check (item_type in ('milestone', 'feature', 'task', 'idea', 'technical_debt', 'capability', 'implementation'));

create index if not exists roadmap_items_parent_idx on public.roadmap_items(parent_item_id);
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.


with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
)
insert into public.roadmap_phases (
  project_id, slug, name, description, sort_order, weight,
  release_status, goal, completion_condition, metadata
)
select
  project_row.id,
  release.slug,
  release.name,
  release.description,
  release.sort_order,
  release.weight,
  release.release_status,
  release.goal,
  release.completion_condition,
  jsonb_build_object('release_key', release.release_key, 'roadmap_v2_release', true)
from project_row
cross join (values
  ('os1-create', 'OS 1 - CREATE', 'Social Media Engine', 100, 1, 'active', 'Jarvis can autonomously plan and produce a client''s monthly social media presence.', 'A configured client can be understood, planned into a 30-day social calendar, supplied with approved images, graphics and copy, routed through human approval, scheduled and published through connected Instagram/Facebook accounts.', 'os1_create'),
  ('os2-distribute', 'OS 2 - DISTRIBUTE', 'Content & Distribution Engine', 200, 1, 'upcoming', 'Expand creation into multi-format distribution, paid social, community assistance and basic measurement.', 'Jarvis can create, adapt, distribute and advertise multi-format marketing content while measuring basic organic and paid performance.', 'os2_distribute'),
  ('os3-grow', 'OS 3 - GROW', 'Growth & Customer Engine', 300, 1, 'future', 'Manage the customer journey from acquisition through communication, conversion and retention.', 'Jarvis can attract, communicate with, convert and retain customers while managing leads, reservations, reputation and the measurable customer journey.', 'os3_grow'),
  ('os4-operate', 'OS 4 - OPERATE', 'Autonomous Marketing OS', 400, 1, 'future', 'Connect the complete marketing service catalogue into an intelligent and continuously improving system.', 'Jarvis understands the business and market, creates and distributes campaigns, measures outcomes, learns from them, identifies opportunities and optimizes with configurable human autonomy.', 'os4_operate')
) as release(slug, name, description, sort_order, weight, release_status, goal, completion_condition, release_key)
on conflict (project_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  weight = excluded.weight,
  release_status = excluded.release_status,
  goal = excluded.goal,
  completion_condition = excluded.completion_condition,
  metadata = public.roadmap_phases.metadata || excluded.metadata;

-- Capabilities are product-level records. Mutable state remains on the same
-- roadmap_items table as engineering implementation work.
with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), releases as (
  select id, slug from public.roadmap_phases where project_id = (select id from project_row)
)
insert into public.roadmap_items (
  project_id, phase_id, slug, title, description, item_type, status,
  priority, weight, progress, completed_at, metadata
)
select
  project_row.id,
  releases.id,
  capability.slug,
  capability.title,
  capability.description,
  'capability',
  capability.status,
  capability.priority,
  capability.weight,
  capability.progress,
  case when capability.status = 'completed' then now() else null end,
  jsonb_build_object(
    'why_it_matters', capability.description,
    'completion_condition', capability.completion_condition,
    'is_addon', capability.is_addon,
    'roadmap_v2_capability', true
  )
from project_row
cross join (values
  ('os1-create', 'core-product-foundation', 'Core Product Foundation', 'Client isolation, navigation and operational foundations that make the Social Media Engine dependable.', 'A client-scoped internal product shell and the supporting operational foundation work reliably.', 'completed', 'high', 2, 100, false),
  ('os1-create', 'client-brain', 'Client Brain', 'Trusted client intelligence, source-backed assets, menus and retrieval context for downstream marketing work.', 'Jarvis can maintain source-aware client truth, approved assets and retrieval-ready context safely.', 'in_progress', 'critical', 5, 0, false),
  ('os1-create', 'social-media-strategy', 'Social Media Strategy', 'Client-specific pillars, channel strategy, monthly objectives and campaign priorities.', 'Jarvis can produce a reviewable client-specific social strategy from verified Client Brain truth.', 'not_started', 'high', 4, 0, false),
  ('os1-create', 'monthly-content-planning-capability', 'Monthly Content Planning', 'Monthly content mix, campaign placement, activation placement and feed/story allocation.', 'Jarvis can create a reviewable monthly content plan from strategy, current activations and client truth.', 'planned', 'high', 5, 0, false),
  ('os1-create', 'thirty-day-content-calendar', '30-Day Content Calendar', 'Date-level content planning with platform, format and approval state.', 'Jarvis can produce and retain a client-scoped 30-day calendar ready for human review.', 'in_progress', 'high', 5, 0, false),
  ('os1-create', 'ai-photography', 'AI Photography', 'Truth-grounded image generation, asset ingestion, QA and approval.', 'Jarvis can select approved truth references, execute an approved provider, store outputs, route them for approval and make approved assets available to content planning.', 'in_progress', 'critical', 5, 0, false),
  ('os1-create', 'graphic-design', 'Graphic Design', 'Brand-guideline-aware offer, story and feed graphics.', 'Jarvis can generate reviewable brand-aligned graphics using approved design and offer truth.', 'not_started', 'medium', 4, 0, false),
  ('os1-create', 'caption-copy', 'Caption and Copy', 'Fact-checked platform-specific captions, CTAs and hashtags.', 'Jarvis can generate platform-appropriate copy from current client truth and route approved copy into the content workflow.', 'not_started', 'high', 4, 0, false),
  ('os1-create', 'stories-feed', 'Stories and Feed', 'Format planning, feed composition and story sequencing.', 'Jarvis can prepare approved story and feed content in the appropriate platform format.', 'not_started', 'medium', 3, 0, false),
  ('os1-create', 'campaigns-activations', 'Campaigns and Activations', 'Current activation retrieval, campaign planning, creative and copy with freshness safety.', 'Jarvis can use only current, verified activation truth in campaign planning and execution.', 'in_progress', 'high', 3, 0, false),
  ('os1-create', 'human-approval', 'Human Approval', 'Review, revision, approval and final content state.', 'All planned content and generated creative can be reviewed, revised, approved or rejected before scheduling.', 'not_started', 'critical', 4, 0, false),
  ('os1-create', 'scheduling', 'Social Scheduling', 'Client-scoped platform/date/time scheduling with observable status.', 'Approved content can be assigned to a platform and time and reliably queued for publishing with observable status.', 'planned', 'critical', 4, 0, false),
  ('os1-create', 'publishing', 'Publishing', 'Connected Instagram/Facebook publishing with safe retry and published records.', 'Jarvis can publish approved content through connected platform APIs and record success, failure and retry state safely.', 'not_started', 'critical', 5, 0, false),
  ('os1-create', 'basic-platform-management', 'Basic Platform Management', 'Connected Instagram and Facebook account visibility, analytics and basic operational state.', 'Jarvis can safely manage connected Instagram/Facebook account context and verified basic platform data.', 'in_progress', 'medium', 2, 0, false),

  ('os2-distribute', 'ai-video', 'AI Video and Image-to-Video', 'AI video, image-to-video and short-form execution workflows.', 'Jarvis can create approved short-form video from trusted client content and assets.', 'not_started', 'high', 5, 0, false),
  ('os2-distribute', 'multi-platform-distribution', 'Multi-Platform Distribution', 'Adapt approved content across additional social accounts and platforms.', 'Jarvis can adapt and distribute approved content across relevant supported platforms.', 'not_started', 'high', 4, 0, false),
  ('os2-distribute', 'meta-ads', 'Meta Ads', 'Paid Meta campaign creation, targeting, creative, budget and basic optimization.', 'Jarvis can safely create, manage and measure reviewable Meta advertising campaigns.', 'not_started', 'high', 5, 0, true),
  ('os2-distribute', 'community-management', 'Community Management', 'DM and comment assistance under explicit human controls.', 'Jarvis can prepare or manage basic community responses with safety controls and review.', 'not_started', 'medium', 3, 0, false),
  ('os2-distribute', 'basic-analytics-reporting', 'Basic Analytics and Reporting', 'Channel-level performance, creative variants and campaign reporting.', 'Jarvis can report reliable basic distribution and paid performance for supported channels.', 'not_started', 'medium', 3, 0, false),

  ('os3-grow', 'email-marketing', 'Email Marketing and Automation', 'Campaigns, automations and customer communication through email.', 'Jarvis can safely create, approve, send and measure client email marketing.', 'not_started', 'medium', 4, 0, true),
  ('os3-grow', 'whatsapp-reservations', 'WhatsApp and Reservations', 'WhatsApp marketing, reservations and customer communication automation.', 'Jarvis can support approved WhatsApp customer communication and reservation workflows safely.', 'not_started', 'high', 4, 0, true),
  ('os3-grow', 'crm-leads', 'CRM and Lead Management', 'Customer profiles, private event leads and conversion workflows.', 'Jarvis can maintain client-scoped CRM truth and route leads through a measurable process.', 'not_started', 'high', 5, 0, true),
  ('os3-grow', 'retention-loyalty', 'Retention and Loyalty', 'Customer retention, loyalty and automated follow-up.', 'Jarvis can run approved retention programs using consented customer data.', 'not_started', 'medium', 4, 0, true),
  ('os3-grow', 'reputation-google-business', 'Reputation and Google Business', 'Review monitoring, response preparation and Google Business Profile management.', 'Jarvis can monitor reputation and prepare approved responses across supported review surfaces.', 'not_started', 'medium', 4, 0, true),
  ('os3-grow', 'seo-local-search', 'SEO and Local Search', 'Search visibility, local discovery and technically sound recommendations.', 'Jarvis can assess and improve verified local-search and SEO work.', 'not_started', 'medium', 4, 0, true),
  ('os3-grow', 'website-landing-pages', 'Website and Landing Pages', 'Website content, landing pages and conversion tracking.', 'Jarvis can create, publish and measure approved conversion-focused web experiences.', 'not_started', 'medium', 4, 0, true),
  ('os3-grow', 'google-advanced-paid-media', 'Google and Advanced Paid Media', 'Google Ads and additional paid-media distribution.', 'Jarvis can safely operate approved advanced paid-media campaigns with reporting.', 'not_started', 'medium', 5, 0, true),
  ('os3-grow', 'customer-segmentation', 'Customer Segmentation and Follow-Ups', 'Customer segmentation and automated follow-ups across approved channels.', 'Jarvis can segment consented customer data and drive reviewable follow-up workflows.', 'not_started', 'medium', 3, 0, true),
  ('os3-grow', 'advanced-analytics', 'Advanced Analytics', 'Customer-journey and growth analytics.', 'Jarvis can measure growth across customer acquisition, conversion and retention.', 'not_started', 'medium', 4, 0, true),

  ('os4-operate', 'research-monitoring', 'Research and Monitoring', 'Automated source, competitor, offer, pricing and reputation monitoring.', 'Jarvis continuously collects source-backed market changes with reviewable provenance.', 'not_started', 'high', 5, 0, true),
  ('os4-operate', 'market-intelligence', 'Intelligence', 'Cross-client market, competitor and business intelligence.', 'Jarvis can turn monitored evidence into approved strategic intelligence.', 'not_started', 'high', 5, 0, true),
  ('os4-operate', 'marketing-strategy', 'Strategy', 'Quarterly, annual, campaign and customer-journey strategy.', 'Jarvis can formulate reviewable cross-channel marketing strategy from verified intelligence.', 'not_started', 'high', 5, 0, false),
  ('os4-operate', 'cross-channel-measurement', 'Measurement and Attribution', 'Cross-channel performance, attribution, ROI and ROAS.', 'Jarvis can measure reliable performance and attribution across supported channels.', 'not_started', 'high', 5, 0, true),
  ('os4-operate', 'performance-learning', 'Learning', 'Winning creative, hooks, audience response and campaign learning.', 'Jarvis can produce evidence-backed learning from measured performance.', 'not_started', 'high', 4, 0, false),
  ('os4-operate', 'optimization-autonomy', 'Optimization and Autonomy', 'Recommendations, opportunity detection and rule-bound autonomous optimization.', 'Jarvis can identify opportunities and apply configured, reviewable optimization controls.', 'not_started', 'high', 5, 0, false),
  ('os4-operate', 'multi-brand-operations', 'Multi-Location and Multi-Brand Operations', 'Multi-location, multi-brand and multilingual operating controls.', 'Jarvis can apply approved marketing operations consistently across locations and brands.', 'not_started', 'medium', 4, 0, true),
  ('os4-operate', 'governance-controls', 'Autonomy and Governance Controls', 'Advanced human-approval, permission and autonomy controls.', 'Jarvis can operate with explicit, auditable autonomy levels and human controls.', 'not_started', 'high', 4, 0, false)
) as capability(release_slug, slug, title, description, completion_condition, status, priority, weight, progress, is_addon)
join releases on releases.slug = capability.release_slug
on conflict (project_id, slug) do update set
  phase_id = excluded.phase_id,
  title = excluded.title,
  description = excluded.description,
  item_type = 'capability',
  status = excluded.status,
  priority = excluded.priority,
  weight = excluded.weight,
  progress = excluded.progress,
  completed_at = coalesce(public.roadmap_items.completed_at, excluded.completed_at),
  metadata = public.roadmap_items.metadata || excluded.metadata;

-- Move the existing 17 records beneath their defensible product capability.
-- IDs, activity, timestamps and current implementation state are retained.
with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), target as (
  select
    existing.slug as existing_slug,
    capability.id as capability_id,
    capability.phase_id as release_id
  from public.roadmap_items existing
  join project_row on project_row.id = existing.project_id
  join public.roadmap_items capability on capability.project_id = existing.project_id
  join (values
    ('core-foundation', 'core-product-foundation'),
    ('ai-cost-tracking', 'core-product-foundation'),
    ('hospitality-client-brain-v2', 'client-brain'),
    ('asset-truth-safety', 'client-brain'),
    ('selective-retrieval', 'client-brain'),
    ('prompt-assembly-v1', 'client-brain'),
    ('shared-social-management', 'thirty-day-content-calendar'),
    ('durable-social-content', 'thirty-day-content-calendar'),
    ('execution-layer-v1', 'ai-photography'),
    ('generation-provider-access', 'ai-photography'),
    ('generated-asset-storage', 'ai-photography'),
    ('monthly-content-planning', 'monthly-content-planning-capability'),
    ('social-scheduling', 'scheduling'),
    ('analytics-ingestion', 'basic-platform-management'),
    ('performance-learning-loop', 'performance-learning'),
    ('autonomous-monthly-operations', 'optimization-autonomy'),
    ('whatsapp-client-agent', 'whatsapp-reservations')
  ) as mapping(existing_slug, capability_slug) on mapping.existing_slug = existing.slug
    and capability.slug = mapping.capability_slug
  where existing.parent_item_id is null
    and existing.item_type <> 'capability'
)
update public.roadmap_items item
set phase_id = target.release_id,
    parent_item_id = target.capability_id,
    metadata = item.metadata || jsonb_build_object(
      'roadmap_v2_remapped', true,
      'legacy_phase_id', item.phase_id,
      'legacy_item_type', item.item_type
    )
from target
where item.slug = target.existing_slug
  and item.project_id = (select id from project_row);

-- Add one verified child for the official menu work now used in Client Brain
-- asset truth. This is a factual completion, not a proxy for generation.
with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), capability as (
  select id, phase_id from public.roadmap_items where project_id = (select id from project_row) and slug = 'client-brain'
)
insert into public.roadmap_items (
  project_id, phase_id, parent_item_id, slug, title, description, item_type,
  status, priority, weight, progress, completed_at, metadata
)
select
  project_row.id,
  capability.phase_id,
  capability.id,
  'official-menu-intelligence',
  'Official menu intelligence and asset enrichment',
  'Official DemoClientB menus are source-indexed and deterministic menu truth constrains asset enrichment and pricing semantics.',
  'implementation',
  'completed',
  'high',
  3,
  100,
  now(),
  jsonb_build_object('roadmap_v2_seed', true, 'verified_scope', 'official menu intelligence and guarded asset enrichment')
from project_row
cross join capability
on conflict (project_id, slug) do update set
  parent_item_id = excluded.parent_item_id,
  phase_id = excluded.phase_id,
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  status = excluded.status,
  priority = excluded.priority,
  weight = excluded.weight,
  progress = excluded.progress,
  completed_at = coalesce(public.roadmap_items.completed_at, excluded.completed_at),
  metadata = public.roadmap_items.metadata || excluded.metadata;

-- Keep the existing dependency graph and add only the verified provider gate.
with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), items as (
  select id, slug from public.roadmap_items where project_id = (select id from project_row)
)
insert into public.roadmap_dependencies (item_id, depends_on_item_id)
select dependent.id, prerequisite.id
from items dependent
join items prerequisite on true
where (dependent.slug, prerequisite.slug) in (
  ('generated-asset-storage', 'generation-provider-access')
)
on conflict (item_id, depends_on_item_id) do nothing;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


-- Preserve stale-write protection while allowing a child implementation item to
-- be moved between compatible capabilities.
create or replace function public.roadmap_update_item(
  p_item_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
returns public.roadmap_items
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.roadmap_items;
  parent_item public.roadmap_items;
  next_status text;
  next_progress smallint;
  next_completed_at timestamptz;
  next_started_at timestamptz;
  next_phase_id uuid;
  next_parent_item_id uuid;
  action_name text := 'updated';
begin
  select * into current_item from public.roadmap_items where id = p_item_id for update;
  if not found then raise exception 'ROADMAP_ITEM_NOT_FOUND'; end if;
  if current_item.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_ITEM_STALE'; end if;

  next_phase_id := coalesce(nullif(p_patch->>'phase_id', '')::uuid, current_item.phase_id);
  if next_phase_id is not null and not exists (
    select 1 from public.roadmap_phases where id = next_phase_id and project_id = current_item.project_id
  ) then raise exception 'ROADMAP_PHASE_MISMATCH'; end if;

  next_parent_item_id := case
    when p_patch ? 'parent_item_id' then nullif(p_patch->>'parent_item_id', '')::uuid
    else current_item.parent_item_id
  end;
  if next_parent_item_id is not null then
    select * into parent_item from public.roadmap_items where id = next_parent_item_id;
    if not found then raise exception 'ROADMAP_PARENT_NOT_FOUND'; end if;
    if parent_item.id = current_item.id then raise exception 'ROADMAP_PARENT_SELF'; end if;
    if parent_item.project_id <> current_item.project_id then raise exception 'ROADMAP_PARENT_PROJECT_MISMATCH'; end if;
    if parent_item.item_type <> 'capability' then raise exception 'ROADMAP_PARENT_MUST_BE_CAPABILITY'; end if;
    if parent_item.phase_id is distinct from next_phase_id then raise exception 'ROADMAP_PARENT_PHASE_MISMATCH'; end if;
  end if;

  next_status := coalesce(nullif(p_patch->>'status', ''), current_item.status);
  if next_status not in ('not_started', 'planned', 'in_progress', 'blocked', 'needs_review', 'completed', 'deferred', 'idea') then
    raise exception 'ROADMAP_STATUS_INVALID';
  end if;
  if next_status = 'blocked' and coalesce(nullif(p_patch->>'blocker_reason', ''), current_item.blocker_reason) is null then
    raise exception 'ROADMAP_BLOCKER_REASON_REQUIRED';
  end if;
  next_progress := coalesce(nullif(p_patch->>'progress', '')::smallint, current_item.progress);
  if next_status = 'completed' then next_progress := 100; end if;
  next_completed_at := case when next_status = 'completed' then coalesce(current_item.completed_at, now()) else null end;
  next_started_at := case when next_status = 'in_progress' then coalesce(current_item.started_at, now()) else current_item.started_at end;

  if next_status = 'completed' and current_item.status <> 'completed' then action_name := 'completed';
  elsif next_status = 'blocked' and current_item.status <> 'blocked' then action_name := 'blocked';
  elsif coalesce((p_patch->>'is_focus')::boolean, current_item.is_focus) and not current_item.is_focus then action_name := 'focus_set';
  elsif next_status = 'in_progress' and current_item.status <> 'in_progress' then action_name := 'started';
  end if;

  update public.roadmap_items
  set title = coalesce(nullif(p_patch->>'title', ''), title),
      description = case when p_patch ? 'description' then nullif(p_patch->>'description', '') else description end,
      phase_id = next_phase_id,
      parent_item_id = next_parent_item_id,
      item_type = coalesce(nullif(p_patch->>'item_type', ''), item_type),
      status = next_status,
      priority = coalesce(nullif(p_patch->>'priority', ''), priority),
      weight = coalesce(nullif(p_patch->>'weight', '')::smallint, weight),
      progress = next_progress,
      is_focus = coalesce((p_patch->>'is_focus')::boolean, is_focus),
      blocker_type = case when p_patch ? 'blocker_type' then nullif(p_patch->>'blocker_type', '') else blocker_type end,
      blocker_reason = case when p_patch ? 'blocker_reason' then nullif(p_patch->>'blocker_reason', '') else blocker_reason end,
      related_links = coalesce(p_patch->'related_links', related_links),
      metadata = coalesce(p_patch->'metadata', metadata),
      target_date = case when p_patch ? 'target_date' then nullif(p_patch->>'target_date', '')::date else target_date end,
      started_at = next_started_at,
      completed_at = next_completed_at
  where id = p_item_id
  returning * into current_item;

  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (current_item.project_id, current_item.id, action_name,
    case action_name
      when 'completed' then 'Completed ' || current_item.title
      when 'blocked' then 'Blocked ' || current_item.title
      when 'started' then 'Started ' || current_item.title
      when 'focus_set' then 'Set current focus: ' || current_item.title
      else 'Updated ' || current_item.title
    end,
    jsonb_build_object('status', current_item.status, 'progress', current_item.progress));
  return current_item;
end;
$$;

revoke all on function public.roadmap_update_item(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.roadmap_update_item(uuid, timestamptz, jsonb) to service_role;
