-- Roadmap V3: strategic Idea Vault. Ideas intentionally live outside
-- roadmap_items so uncommitted thinking cannot distort delivery progress.

create table if not exists public.roadmap_ideas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.roadmap_projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  description text,
  category text not null default 'other' check (category in (
    'content', 'social_growth', 'video', 'intelligence', 'competitor_research',
    'creator_influencer', 'customer_support', 'crm', 'retention', 'email',
    'whatsapp', 'paid_media', 'landing_pages', 'conversion',
    'customer_intelligence', 'menu_intelligence', 'hospitality_operations',
    'analytics', 'automation', 'other'
  )),
  potential_phase_id uuid references public.roadmap_phases(id) on delete set null,
  potential_value text not null default 'medium' check (potential_value in ('high', 'medium', 'low')),
  complexity text not null default 'medium' check (complexity in ('high', 'medium', 'low')),
  status text not null default 'idea' check (status in ('idea', 'researching', 'shortlisted', 'promoted_to_roadmap', 'parked', 'rejected')),
  dependency_notes text,
  notes text,
  promoted_roadmap_item_id uuid references public.roadmap_items(id) on delete set null,
  promotion_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_ideas_promoted_link_check check (
    status <> 'promoted_to_roadmap' or promoted_roadmap_item_id is not null
  )
);

create unique index if not exists roadmap_ideas_project_title_unique_idx
  on public.roadmap_ideas(project_id, lower(title));
create index if not exists roadmap_ideas_project_status_idx
  on public.roadmap_ideas(project_id, status, updated_at desc);
create index if not exists roadmap_ideas_project_phase_idx
  on public.roadmap_ideas(project_id, potential_phase_id, category);

create table if not exists public.roadmap_idea_capability_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete restrict,
  relationship_type text not null default 'related' check (relationship_type in ('related', 'dependency', 'candidate_for')),
  created_at timestamptz not null default now(),
  unique (idea_id, roadmap_item_id, relationship_type)
);

create table if not exists public.roadmap_idea_tool_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
  tool_id uuid not null references public.tool_registry(id) on delete restrict,
  relationship_type text not null default 'candidate_for' check (relationship_type in ('dependency', 'candidate_for', 'research_source')),
  created_at timestamptz not null default now(),
  unique (idea_id, tool_id, relationship_type)
);

create table if not exists public.roadmap_idea_agent_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  relationship_type text not null default 'candidate_for' check (relationship_type in ('owner', 'candidate_for', 'research_support')),
  created_at timestamptz not null default now(),
  unique (idea_id, agent_id, relationship_type)
);

create table if not exists public.roadmap_idea_skill_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
  agent_skill_id uuid not null references public.agent_skills(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (idea_id, agent_skill_id)
);

create table if not exists public.roadmap_idea_activity (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
  action_type text not null check (action_type in ('created', 'updated', 'promoted', 'parked', 'rejected', 'restored')),
  description text not null check (char_length(description) between 1 and 360),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists roadmap_idea_capability_links_idea_idx on public.roadmap_idea_capability_links(idea_id);
create index if not exists roadmap_idea_tool_links_idea_idx on public.roadmap_idea_tool_links(idea_id);
create index if not exists roadmap_idea_agent_links_idea_idx on public.roadmap_idea_agent_links(idea_id);
create index if not exists roadmap_idea_skill_links_idea_idx on public.roadmap_idea_skill_links(idea_id);
create index if not exists roadmap_idea_activity_idea_created_idx on public.roadmap_idea_activity(idea_id, created_at desc);

create or replace function public.roadmap_ideas_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roadmap_ideas_set_updated_at on public.roadmap_ideas;
create trigger roadmap_ideas_set_updated_at before update on public.roadmap_ideas
for each row execute function public.roadmap_ideas_set_updated_at();

alter table public.roadmap_ideas enable row level security;
alter table public.roadmap_idea_capability_links enable row level security;
alter table public.roadmap_idea_tool_links enable row level security;
alter table public.roadmap_idea_agent_links enable row level security;
alter table public.roadmap_idea_skill_links enable row level security;
alter table public.roadmap_idea_activity enable row level security;

revoke all on public.roadmap_ideas, public.roadmap_idea_capability_links, public.roadmap_idea_tool_links,
  public.roadmap_idea_agent_links, public.roadmap_idea_skill_links, public.roadmap_idea_activity from anon, authenticated;

-- Capability upserts deliberately cover the product-level commitments stated
-- in Roadmap V3. No implementation work, provider connection, or execution is
-- activated by these records.
with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
), phases as (
  select id, slug from public.roadmap_phases where project_id = (select id from project_row)
)
insert into public.roadmap_items (
  project_id, phase_id, slug, title, description, item_type, status, priority, weight, progress, metadata
)
select
  project_row.id, phases.id, seed.slug, seed.title, seed.description, 'capability',
  seed.status, seed.priority, seed.weight, 0,
  jsonb_build_object('roadmap_v3_capability', true, 'why_it_matters', seed.description, 'completion_condition', seed.completion_condition)
from project_row
join phases on true
join (values
  ('os1-create', 'visual-menu-highlights-engine', 'Visual Menu & Highlights Engine', 'Creates branded, verified visual menu Stories from approved restaurant assets and menu truth, then organizes them into client-specific Highlights.', 'planned', 'high', 4, 'Approved product assets, verified menu truth and client branding can produce reviewable visual menu Stories and client-specific Highlight collections.'),
  ('os1-create', 'evergreen-menu-story-rotation', 'Evergreen Menu Story Rotation', 'Maintains a reusable library of approved menu Stories for a rotation that respects current products, offers and repetition limits.', 'planned', 'medium', 3, 'Approved visual menu Stories can be selected, scheduled and retired using current menu truth without excessive repetition.'),
  ('os2-distribute', 'reels-growth-engine', 'Reels Growth Engine', 'Builds learning-oriented short-form video workflows from approved media, with human review and no unsupported platform claims.', 'not_started', 'high', 4, 'Jarvis can create, review and measure compliant Reel variants from approved content and learn within the Reel format.'),
  ('os2-distribute', 'competitor-intelligence', 'Competitor Intelligence', 'Collects source-backed competitor changes and presents them for human review rather than fabricating market findings.', 'not_started', 'high', 4, 'Verified public-source changes can produce a reviewable competitor report with evidence and recommended actions.'),
  ('os2-distribute', 'audience-discovery', 'Audience Discovery', 'Finds responsible public demand signals and turns them into human-reviewed opportunity cards.', 'not_started', 'high', 3, 'Public, permitted sources can produce traceable opportunities without indiscriminate scraping or automated outreach.'),
  ('os2-distribute', 'creator-influencer-discovery', 'Creator and Influencer Discovery', 'Assesses potential local collaborators against client relevance, audience fit and human-approved commercial terms.', 'not_started', 'high', 3, 'A curated, reviewable creator shortlist and collaboration workflow exist without autonomous promises or outreach.'),
  ('os2-distribute', 'social-customer-support', 'Social Customer Support', 'Provides client-specific, approval-aware support for comments, messages and low-risk questions with escalation for sensitive cases.', 'not_started', 'high', 3, 'Client truth, support playbooks and escalation rules support reviewable social responses.'),
  ('os2-distribute', 'growth-experiments', 'Growth Experiments', 'Captures, evaluates and learns from compliant organic-growth hypotheses without treating untested tactics as strategy.', 'not_started', 'medium', 3, 'Experiments retain a hypothesis, approval, measurement and learning trail.'),
  ('os3-grow', 'unified-broadcast-campaigns', 'Unified Broadcast Campaigns', 'Uses one approved campaign object to coordinate channel-specific Instagram, email, WhatsApp and landing-page outputs.', 'not_started', 'high', 4, 'A shared campaign can be adapted across consented channels with connected reporting and human approval.'),
  ('os3-grow', 'personalized-communications', 'Personalized Communications', 'Uses consented customer context to prepare relevant communications without invasive or automatic targeting.', 'not_started', 'high', 3, 'Approved segmentation and preference rules can produce reviewable personalized campaigns.'),
  ('os3-grow', 'reservation-intelligence', 'Reservation Intelligence', 'Connects authorized reservation and CRM signals into privacy-aware guest and service context.', 'not_started', 'high', 4, 'Authorized booking data can produce concise, appropriate pre-service briefs with human controls.'),
  ('os3-grow', 'private-event-lead-engine', 'Private Event Lead Engine', 'Connects campaigns, landing pages and approved lead capture into measurable private-event acquisition.', 'not_started', 'medium', 3, 'An approved private-event journey can capture leads, route human follow-up and measure conversion.'),
  ('os3-grow', 'cross-channel-campaign-engine', 'Cross-Channel Campaign Engine', 'Coordinates one campaign across social, customer communication, landing pages and reporting while preserving channel rules.', 'not_started', 'high', 4, 'Approved campaign components can be linked across channels with clear ownership and attribution.'),
  ('os3-grow', 'customer-journey-tracking', 'Customer Journey Tracking', 'Connects lawful marketing, lead, booking, visit and follow-up signals into a measurable customer journey.', 'not_started', 'medium', 4, 'Authorized journey events can be represented without exposing unnecessary personal information.'),
  ('os3-grow', 'early-upsell-intelligence', 'Early Upsell Intelligence', 'Provides staff-facing, human-reviewed upsell recommendations from authorized preference and booking context.', 'not_started', 'medium', 3, 'Recommendations remain assistive, transparent and controllable by hospitality staff.'),
  ('os4-operate', 'menu-performance-intelligence', 'Menu Performance Intelligence', 'Analyzes authorized POS, order, delivery and menu data for sales, margin, pairing and timing insights.', 'not_started', 'high', 4, 'Source-backed menu performance can generate reviewable recommendations without automatic menu changes.'),
  ('os4-operate', 'menu-recommendations', 'Menu Recommendations', 'Suggests actions such as promote, reprice, reposition, remove, replace or keep from verified menu-performance evidence.', 'not_started', 'high', 3, 'Recommendations include source evidence and remain subject to chef and client approval.'),
  ('os4-operate', 'new-dish-ideation', 'New Dish Ideation', 'Suggests potential menu opportunities from approved menu gaps, customer signals, trends and brand positioning.', 'not_started', 'medium', 3, 'Chef and client can review evidenced concepts; Jarvis never alters a menu autonomously.'),
  ('os4-operate', 'smart-upsell-intelligence', 'Smart Upsell Intelligence', 'Uses authorized customer, booking and menu context to propose assistive service recommendations.', 'not_started', 'high', 3, 'Staff can review recommendations without automated selling or unnecessary personal-data exposure.'),
  ('os4-operate', 'business-intelligence', 'Business Intelligence', 'Brings approved marketing, customer, booking, menu, campaign and market signals into executive decision support.', 'not_started', 'high', 5, 'Traceable data sources can support executive recommendations and controlled optimization.'),
  ('os4-operate', 'compounding-data-loop', 'Compounding Data Loop', 'Architectural principle: each approved system should strengthen the next, from audience through relationships, performance and learning.', 'not_started', 'high', 2, 'New systems expose reusable, governed signals that improve downstream strategy without duplicating source truth.')
) as seed(phase_slug, slug, title, description, status, priority, weight, completion_condition) on phases.slug = seed.phase_slug
on conflict (project_id, slug) do update set
  phase_id = excluded.phase_id,
  title = excluded.title,
  description = excluded.description,
  item_type = 'capability',
  priority = excluded.priority,
  weight = excluded.weight,
  metadata = public.roadmap_items.metadata || excluded.metadata;

-- Keep one legacy roadmap-item idea as history, while surfacing the strategic
-- thought through the new vault. It remains queryable in its original record.
with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os'),
phase_row as (select id from public.roadmap_phases where project_id = (select id from project_row) and slug = 'os3-grow'),
legacy as (
  select id, title, description from public.roadmap_items where project_id = (select id from project_row) and slug = 'whatsapp-client-agent' and status = 'idea'
)
insert into public.roadmap_ideas (project_id, title, description, category, potential_phase_id, potential_value, complexity, status, dependency_notes, metadata)
select project_row.id, legacy.title, legacy.description, 'whatsapp', phase_row.id, 'high', 'high', 'idea',
  'Requires consented WhatsApp infrastructure, client communication rules and human approval boundaries.',
  jsonb_build_object('roadmap_v3_seed', true, 'legacy_roadmap_item_id', legacy.id)
from project_row cross join phase_row cross join legacy
on conflict (project_id, lower(title)) do update set metadata = public.roadmap_ideas.metadata || excluded.metadata;

with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os'),
legacy as (select id from public.roadmap_items where project_id = (select id from project_row) and slug = 'whatsapp-client-agent' and status = 'idea')
update public.roadmap_items
set status = 'deferred', metadata = metadata || jsonb_build_object('legacy_idea_migrated_to_vault', true)
where id in (select id from legacy);

-- Seed product-brief ideas as uncommitted strategic memory, never as work.
with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os'),
phases as (select id, slug from public.roadmap_phases where project_id = (select id from project_row))
insert into public.roadmap_ideas (
  project_id, title, description, category, potential_phase_id, potential_value, complexity, status, dependency_notes, notes, metadata
)
select project_row.id, seed.title, seed.description, seed.category, phases.id, seed.value, seed.complexity, seed.status, seed.dependencies, seed.notes,
  jsonb_build_object('roadmap_v3_seed', true, 'source', 'roadmap_v3_idea_vault_brief')
from project_row
join phases on true
join (values
  ('os2-distribute', 'New Follower Welcome Experience', 'Explore a consented, human-approved welcome for genuine new followers, potentially with a small restaurant-specific perk.', 'social_growth', 'high', 'medium', 'idea', 'Requires platform/API feasibility, consent, offer governance and measurement.', 'Do not assume direct-message availability or algorithm impact.'),
  ('os2-distribute', 'Follower Relationship Signal Experiment', 'Test whether meaningful, approved conversations correlate with useful engagement, visit or retention signals.', 'social_growth', 'medium', 'medium', 'researching', 'Requires a clear hypothesis, consent-aware measurement and a human-approved communication playbook.', 'Do not treat relationship signals as guaranteed algorithm behavior.'),
  ('os2-distribute', 'Public Intent Discovery Pilot', 'Evaluate public, permitted local dining conversations as a source of reviewable opportunity cards.', 'intelligence', 'high', 'high', 'researching', 'Requires source provenance, platform policy review and no private-group scraping.', 'Opportunity discovery only; never spam or unauthorized outreach.'),
  ('os2-distribute', 'Creator Collaboration Automation', 'Explore a human-approved workflow for creator discovery, outreach drafts, offer review and delivered-content tracking.', 'creator_influencer', 'high', 'high', 'idea', 'Requires Creator Discovery, CRM support, platform access and human approval of compensation.', 'No autonomous commercial promises or outreach.'),
  ('os2-distribute', 'Niche Engagement Discovery', 'Explore recommendations for relevant local accounts or public conversations that may warrant human-led engagement.', 'social_growth', 'medium', 'high', 'idea', 'Requires compliant public-source research and a client-specific engagement policy.', 'No mass actions, likes, comments or follows.'),
  ('os2-distribute', 'Follow and Unfollow Automation Safety Assessment', 'Document safer alternatives before considering competitor-audience following, mass interactions or reciprocal follow/unfollow patterns.', 'social_growth', 'low', 'high', 'parked', 'Requires platform policy, account-safety and legal review before any promotion.', 'Not approved strategy. Do not automate follow/unfollow, mass liking or mass commenting.'),
  ('os3-grow', 'Automated Landing Page Experimentation', 'Explore controlled landing-page variants and learning loops after approved conversion tracking is available.', 'landing_pages', 'medium', 'high', 'idea', 'Requires Landing Page Engine, analytics, human review and controlled traffic allocation.', 'No automatic public-page changes until safeguards are defined.'),
  ('os4-operate', 'Guest Upsell Recommendation Experiment', 'Explore carefully bounded recommendations for likely add-ons using authorized preference, booking and menu context.', 'customer_intelligence', 'high', 'high', 'idea', 'Requires consented CRM/reservation data, staff approval and privacy controls.', 'Assist staff; never make recommendations feel invasive or automatic.'),
  ('os4-operate', 'Advanced Menu Creation Exploration', 'Explore assisted menu-concept creation from verified menu gaps, customer preference signals and chef direction.', 'menu_intelligence', 'medium', 'high', 'idea', 'Requires Menu Intelligence, market sources and chef/client review.', 'Never alter dishes or menus without chef/client approval.')
) as seed(phase_slug, title, description, category, value, complexity, status, dependencies, notes) on phases.slug = seed.phase_slug
on conflict (project_id, lower(title)) do update set
  description = excluded.description,
  category = excluded.category,
  potential_phase_id = excluded.potential_phase_id,
  potential_value = excluded.potential_value,
  complexity = excluded.complexity,
  dependency_notes = excluded.dependency_notes,
  notes = excluded.notes,
  metadata = public.roadmap_ideas.metadata || excluded.metadata;

-- Seed only relationship hints that map to existing canonical records. They are
-- candidate links, not assertions that the integrations are operational.
with ideas as (select id, title from public.roadmap_ideas), tools as (select id, slug from public.tool_registry)
insert into public.roadmap_idea_tool_links(idea_id, tool_id, relationship_type)
select ideas.id, tools.id, 'candidate_for'
from ideas join tools on (ideas.title, tools.slug) in (
  ('Public Intent Discovery Pilot', 'ultimate-web-scraper'),
  ('Public Intent Discovery Pilot', 'apify'),
  ('Creator Collaboration Automation', 'meta'),
  ('Creator Collaboration Automation', 'sevenrooms'),
  ('Automated Landing Page Experimentation', 'posthog'),
  ('Guest Upsell Recommendation Experiment', 'sevenrooms')
)
on conflict do nothing;

with ideas as (select id, title from public.roadmap_ideas), agents as (select id, agent_name from public.agents)
insert into public.roadmap_idea_agent_links(idea_id, agent_id, relationship_type)
select ideas.id, agents.id, 'candidate_for'
from ideas join agents on (ideas.title, agents.agent_name) in (
  ('Public Intent Discovery Pilot', 'Research & Intelligence Agent'),
  ('Creator Collaboration Automation', 'Customer CRM Agent'),
  ('Guest Upsell Recommendation Experiment', 'Customer CRM Agent'),
  ('Advanced Menu Creation Exploration', 'Strategy Agent')
)
on conflict do nothing;

with ideas as (select id, title from public.roadmap_ideas), items as (select id, slug from public.roadmap_items where item_type = 'capability')
insert into public.roadmap_idea_capability_links(idea_id, roadmap_item_id, relationship_type)
select ideas.id, items.id, 'candidate_for'
from ideas join items on (ideas.title, items.slug) in (
  ('New Follower Welcome Experience', 'growth-experiments'),
  ('Follower Relationship Signal Experiment', 'growth-experiments'),
  ('Public Intent Discovery Pilot', 'audience-discovery'),
  ('Creator Collaboration Automation', 'creator-influencer-discovery'),
  ('Niche Engagement Discovery', 'audience-discovery'),
  ('Automated Landing Page Experimentation', 'website-landing-pages'),
  ('Guest Upsell Recommendation Experiment', 'early-upsell-intelligence'),
  ('Advanced Menu Creation Exploration', 'new-dish-ideation')
)
on conflict do nothing;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


create or replace function public.roadmap_create_idea(
  p_project_id uuid,
  p_payload jsonb
)
returns public.roadmap_ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.roadmap_ideas;
begin
  if not exists (select 1 from public.roadmap_projects where id = p_project_id) then raise exception 'ROADMAP_PROJECT_NOT_FOUND'; end if;
  insert into public.roadmap_ideas(
    project_id, title, description, category, potential_phase_id, potential_value, complexity, status, dependency_notes, notes, metadata
  ) values (
    p_project_id,
    nullif(trim(p_payload->>'title'), ''),
    nullif(trim(p_payload->>'description'), ''),
    coalesce(nullif(p_payload->>'category', ''), 'other'),
    nullif(p_payload->>'potential_phase_id', '')::uuid,
    coalesce(nullif(p_payload->>'potential_value', ''), 'medium'),
    coalesce(nullif(p_payload->>'complexity', ''), 'medium'),
    coalesce(nullif(p_payload->>'status', ''), 'idea'),
    nullif(trim(p_payload->>'dependency_notes'), ''),
    nullif(trim(p_payload->>'notes'), ''),
    coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into created;
  if created.potential_phase_id is not null and not exists (select 1 from public.roadmap_phases where id = created.potential_phase_id and project_id = p_project_id) then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata) values (created.id, 'created', 'Captured ' || created.title || ' in the Idea Vault.', '{}'::jsonb);
  return created;
exception when check_violation then raise exception 'ROADMAP_IDEA_VALUE_INVALID';
when unique_violation then raise exception 'ROADMAP_IDEA_DUPLICATE';
end;
$$;

create or replace function public.roadmap_update_idea(
  p_idea_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns public.roadmap_ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  current_idea public.roadmap_ideas;
  next_status text;
begin
  select * into current_idea from public.roadmap_ideas where id = p_idea_id for update;
  if not found then raise exception 'ROADMAP_IDEA_NOT_FOUND'; end if;
  if current_idea.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_IDEA_STALE'; end if;
  next_status := coalesce(nullif(p_payload->>'status', ''), current_idea.status);
  if next_status not in ('idea', 'researching', 'shortlisted', 'promoted_to_roadmap', 'parked', 'rejected') then raise exception 'ROADMAP_IDEA_STATUS_INVALID'; end if;
  if next_status = 'promoted_to_roadmap' and current_idea.promoted_roadmap_item_id is null then raise exception 'ROADMAP_IDEA_PROMOTION_REQUIRED'; end if;
  update public.roadmap_ideas set
    title = coalesce(nullif(trim(p_payload->>'title'), ''), title),
    description = case when p_payload ? 'description' then nullif(trim(p_payload->>'description'), '') else description end,
    category = coalesce(nullif(p_payload->>'category', ''), category),
    potential_phase_id = case when p_payload ? 'potential_phase_id' then nullif(p_payload->>'potential_phase_id', '')::uuid else potential_phase_id end,
    potential_value = coalesce(nullif(p_payload->>'potential_value', ''), potential_value),
    complexity = coalesce(nullif(p_payload->>'complexity', ''), complexity),
    status = next_status,
    dependency_notes = case when p_payload ? 'dependency_notes' then nullif(trim(p_payload->>'dependency_notes'), '') else dependency_notes end,
    notes = case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else notes end,
    metadata = coalesce(p_payload->'metadata', metadata)
  where id = p_idea_id returning * into current_idea;
  if current_idea.potential_phase_id is not null and not exists (select 1 from public.roadmap_phases where id = current_idea.potential_phase_id and project_id = current_idea.project_id) then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata)
  values (current_idea.id, case next_status when 'parked' then 'parked' when 'rejected' then 'rejected' else 'updated' end,
    case next_status when 'parked' then 'Parked ' || current_idea.title when 'rejected' then 'Rejected ' || current_idea.title else 'Updated ' || current_idea.title end,
    jsonb_build_object('status', current_idea.status));
  return current_idea;
exception when check_violation then raise exception 'ROADMAP_IDEA_VALUE_INVALID';
when unique_violation then raise exception 'ROADMAP_IDEA_DUPLICATE';
end;
$$;

create or replace function public.roadmap_promote_idea(
  p_idea_id uuid,
  p_expected_updated_at timestamptz,
  p_phase_id uuid,
  p_parent_item_id uuid,
  p_item_type text,
  p_priority text,
  p_title text,
  p_description text,
  p_dependency_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_idea public.roadmap_ideas;
  target_phase public.roadmap_phases;
  parent_capability public.roadmap_items;
  created_item public.roadmap_items;
  dependency_id uuid;
  next_slug text;
begin
  select * into current_idea from public.roadmap_ideas where id = p_idea_id for update;
  if not found then raise exception 'ROADMAP_IDEA_NOT_FOUND'; end if;
  if current_idea.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_IDEA_STALE'; end if;
  if current_idea.status in ('promoted_to_roadmap', 'rejected') then raise exception 'ROADMAP_IDEA_NOT_PROMOTABLE'; end if;
  select * into target_phase from public.roadmap_phases where id = p_phase_id and project_id = current_idea.project_id;
  if not found or target_phase.release_status in ('archived', 'legacy') then raise exception 'ROADMAP_IDEA_PHASE_MISMATCH'; end if;
  if p_item_type not in ('capability', 'implementation') then raise exception 'ROADMAP_IDEA_PROMOTION_TYPE_INVALID'; end if;
  if p_priority not in ('critical', 'high', 'medium', 'low') then raise exception 'ROADMAP_PRIORITY_INVALID'; end if;
  if p_item_type = 'implementation' then
    select * into parent_capability from public.roadmap_items where id = p_parent_item_id and project_id = current_idea.project_id and phase_id = p_phase_id and item_type = 'capability';
    if not found then raise exception 'ROADMAP_IDEA_PARENT_REQUIRED'; end if;
  end if;
  next_slug := substring(regexp_replace(lower(coalesce(nullif(trim(p_title), ''), current_idea.title)), '[^a-z0-9]+', '-', 'g') from 1 for 42) || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);
  insert into public.roadmap_items(project_id, phase_id, parent_item_id, slug, title, description, item_type, status, priority, weight, progress, metadata)
  values (
    current_idea.project_id, p_phase_id, case when p_item_type = 'capability' then null else p_parent_item_id end,
    next_slug, coalesce(nullif(trim(p_title), ''), current_idea.title), coalesce(nullif(trim(p_description), ''), current_idea.description),
    p_item_type, 'planned', p_priority, case when p_item_type = 'capability' then 3 else 2 end, 0,
    jsonb_build_object('idea_vault_origin_id', current_idea.id, 'origin', 'idea_vault', 'idea_category', current_idea.category, 'why_it_matters', current_idea.description)
  ) returning * into created_item;
  for dependency_id in select value::text::uuid from jsonb_array_elements_text(coalesce(p_dependency_ids, '[]'::jsonb)) loop
    if dependency_id = created_item.id or not exists (select 1 from public.roadmap_items where id = dependency_id and project_id = current_idea.project_id) then raise exception 'ROADMAP_IDEA_DEPENDENCY_INVALID'; end if;
    insert into public.roadmap_dependencies(item_id, depends_on_item_id) values (created_item.id, dependency_id) on conflict do nothing;
  end loop;
  update public.roadmap_ideas set status = 'promoted_to_roadmap', promoted_roadmap_item_id = created_item.id,
    promotion_metadata = jsonb_build_object('promoted_at', now(), 'item_type', p_item_type, 'phase_id', p_phase_id)
  where id = current_idea.id returning * into current_idea;
  insert into public.roadmap_idea_activity(idea_id, action_type, description, metadata)
  values (current_idea.id, 'promoted', 'Promoted ' || current_idea.title || ' to the Roadmap.', jsonb_build_object('roadmap_item_id', created_item.id));
  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (created_item.project_id, created_item.id, 'idea_promoted', 'Promoted from Idea Vault: ' || current_idea.title, jsonb_build_object('idea_id', current_idea.id));
  return jsonb_build_object('idea_id', current_idea.id, 'roadmap_item_id', created_item.id);
end;
$$;

revoke all on function public.roadmap_create_idea(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.roadmap_update_idea(uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.roadmap_promote_idea(uuid, timestamptz, uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.roadmap_create_idea(uuid, jsonb) to service_role;
grant execute on function public.roadmap_update_idea(uuid, timestamptz, jsonb) to service_role;
grant execute on function public.roadmap_promote_idea(uuid, timestamptz, uuid, uuid, text, text, text, text, jsonb) to service_role;
