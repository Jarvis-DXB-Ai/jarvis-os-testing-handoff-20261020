-- Jarvis OS Command Center / Roadmap
-- This domain is product-management truth. It references operating systems but
-- does not duplicate Client Brain, Social, or execution records.

create table if not exists public.roadmap_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 180),
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.roadmap_projects(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  sort_order integer not null default 0,
  weight smallint not null default 1 check (weight between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug),
  unique (project_id, sort_order)
);

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.roadmap_projects(id) on delete cascade,
  phase_id uuid references public.roadmap_phases(id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 240),
  description text,
  item_type text not null default 'feature' check (item_type in ('milestone', 'feature', 'task', 'idea', 'technical_debt')),
  status text not null default 'planned' check (status in ('not_started', 'planned', 'in_progress', 'blocked', 'needs_review', 'completed', 'deferred', 'idea')),
  priority text not null default 'medium' check (priority in ('critical', 'high', 'medium', 'low')),
  weight smallint not null default 2 check (weight between 1 and 10),
  progress smallint not null default 0 check (progress between 0 and 100),
  is_focus boolean not null default false,
  blocker_type text check (blocker_type in ('internal', 'external', 'waiting')),
  blocker_reason text,
  related_links jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  target_date date,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug),
  check ((status <> 'blocked') or blocker_reason is not null),
  check ((status <> 'completed') or completed_at is not null)
);

create table if not exists public.roadmap_dependencies (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.roadmap_items(id) on delete cascade,
  depends_on_item_id uuid not null references public.roadmap_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, depends_on_item_id),
  check (item_id <> depends_on_item_id)
);

create table if not exists public.roadmap_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.roadmap_projects(id) on delete cascade,
  item_id uuid references public.roadmap_items(id) on delete set null,
  action_type text not null check (action_type in ('created', 'updated', 'started', 'completed', 'blocked', 'focus_set', 'dependency_added', 'dependency_removed', 'idea_promoted', 'archived')),
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists roadmap_phases_project_sort_idx on public.roadmap_phases(project_id, sort_order);
create index if not exists roadmap_items_project_status_idx on public.roadmap_items(project_id, status);
create index if not exists roadmap_items_phase_status_idx on public.roadmap_items(phase_id, status);
create index if not exists roadmap_items_priority_idx on public.roadmap_items(project_id, priority, target_date);
create index if not exists roadmap_items_focus_idx on public.roadmap_items(project_id, is_focus) where is_focus;
create index if not exists roadmap_dependencies_item_idx on public.roadmap_dependencies(item_id);
create index if not exists roadmap_dependencies_dependency_idx on public.roadmap_dependencies(depends_on_item_id);
create index if not exists roadmap_activity_project_created_idx on public.roadmap_activity(project_id, created_at desc);

create or replace function public.roadmap_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roadmap_projects_set_updated_at on public.roadmap_projects;
create trigger roadmap_projects_set_updated_at before update on public.roadmap_projects
for each row execute function public.roadmap_set_updated_at();

drop trigger if exists roadmap_phases_set_updated_at on public.roadmap_phases;
create trigger roadmap_phases_set_updated_at before update on public.roadmap_phases
for each row execute function public.roadmap_set_updated_at();

drop trigger if exists roadmap_items_set_updated_at on public.roadmap_items;
create trigger roadmap_items_set_updated_at before update on public.roadmap_items
for each row execute function public.roadmap_set_updated_at();

-- Internal server-only RPC. It provides optimistic concurrency plus one atomic
-- activity entry whenever an item changes state.
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
  next_status text;
  next_progress smallint;
  next_completed_at timestamptz;
  next_started_at timestamptz;
  next_phase_id uuid;
  action_name text := 'updated';
begin
  select * into current_item from public.roadmap_items where id = p_item_id for update;
  if not found then raise exception 'ROADMAP_ITEM_NOT_FOUND'; end if;
  if current_item.updated_at <> p_expected_updated_at then raise exception 'ROADMAP_ITEM_STALE'; end if;

  next_phase_id := coalesce(nullif(p_patch->>'phase_id', '')::uuid, current_item.phase_id);
  if next_phase_id is not null and not exists (
    select 1 from public.roadmap_phases where id = next_phase_id and project_id = current_item.project_id
  ) then raise exception 'ROADMAP_PHASE_MISMATCH'; end if;

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

create or replace function public.roadmap_add_dependency(p_item_id uuid, p_depends_on_item_id uuid)
returns public.roadmap_dependencies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.roadmap_items;
  dependency_item public.roadmap_items;
  result public.roadmap_dependencies;
begin
  select * into current_item from public.roadmap_items where id = p_item_id for update;
  select * into dependency_item from public.roadmap_items where id = p_depends_on_item_id;
  if not found or current_item.id is null then raise exception 'ROADMAP_ITEM_NOT_FOUND'; end if;
  if current_item.id = dependency_item.id then raise exception 'ROADMAP_SELF_DEPENDENCY'; end if;
  if current_item.project_id <> dependency_item.project_id then raise exception 'ROADMAP_CROSS_PROJECT_DEPENDENCY'; end if;
  if exists (
    with recursive dependency_path as (
      select item_id, depends_on_item_id from public.roadmap_dependencies where item_id = p_depends_on_item_id
      union all
      select dependency.item_id, dependency.depends_on_item_id
      from public.roadmap_dependencies dependency
      join dependency_path path on dependency.item_id = path.depends_on_item_id
    ) select 1 from dependency_path where depends_on_item_id = p_item_id
  ) then raise exception 'ROADMAP_CIRCULAR_DEPENDENCY'; end if;

  insert into public.roadmap_dependencies(item_id, depends_on_item_id)
  values (p_item_id, p_depends_on_item_id)
  returning * into result;
  insert into public.roadmap_activity(project_id, item_id, action_type, description, metadata)
  values (current_item.project_id, current_item.id, 'dependency_added',
    'Added dependency for ' || current_item.title,
    jsonb_build_object('depends_on_item_id', dependency_item.id, 'depends_on_title', dependency_item.title));
  return result;
exception when unique_violation then
  raise exception 'ROADMAP_DUPLICATE_DEPENDENCY';
end;
$$;

alter table public.roadmap_projects enable row level security;
alter table public.roadmap_phases enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.roadmap_dependencies enable row level security;
alter table public.roadmap_activity enable row level security;

revoke all on public.roadmap_projects, public.roadmap_phases, public.roadmap_items, public.roadmap_dependencies, public.roadmap_activity from anon, authenticated;
revoke all on function public.roadmap_update_item(uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.roadmap_add_dependency(uuid, uuid) from public, anon, authenticated;
grant execute on function public.roadmap_update_item(uuid, timestamptz, jsonb) to service_role;
grant execute on function public.roadmap_add_dependency(uuid, uuid) to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os')
insert into public.roadmap_phases (project_id, slug, name, description, sort_order, weight)
select project_row.id, phase.slug, phase.name, phase.description, phase.sort_order, phase.weight
from project_row
cross join (values
  ('foundation', 'Foundation', 'Core application, client isolation, operational shell, and cost visibility.', 10, 2),
  ('client-intelligence', 'Client Intelligence', 'Source-aware hospitality client truth, assets, evidence, and editing.', 20, 4),
  ('retrieval-reasoning', 'Retrieval & Reasoning', 'Selective context retrieval, deterministic prompt assembly, and inspection.', 30, 3),
  ('content-operations', 'Content Operations', 'Social planning, content lifecycle, approvals, and client execution workflow.', 40, 3),
  ('execution', 'Execution', 'Safe generation routing, provider adapters, execution history, and output storage.', 50, 4),
  ('automation', 'Automation', 'Batch and monthly planning operations under explicit controls.', 60, 3),
  ('measurement-learning', 'Measurement & Learning', 'Analytics ingestion, outcome attribution, and evidence-backed feedback.', 70, 3),
  ('autonomous-operations', 'Autonomous Operations', 'Rule-bound recurring operations that improve from verified performance.', 80, 4)
) as phase(slug, name, description, sort_order, weight)
on conflict (project_id, slug) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, weight = excluded.weight;

with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os'), phase_rows as (select id, slug from public.roadmap_phases where project_id = (select id from project_row))
insert into public.roadmap_items (project_id, phase_id, slug, title, description, item_type, status, priority, weight, progress, is_focus, blocker_type, blocker_reason, related_links, started_at, completed_at)
select project_row.id, phase_rows.id, item.slug, item.title, item.description, item.item_type, item.status, item.priority, item.weight, item.progress, item.is_focus, item.blocker_type, item.blocker_reason, item.related_links::jsonb,
  case when item.status in ('in_progress', 'completed') then now() else null end,
  case when item.status = 'completed' then now() else null end
from project_row
cross join (values
  ('foundation', 'core-foundation', 'Core client system and operating shell', 'Clients, client scoping, navigation, and the internal MC Studios shell are established.', 'milestone', 'completed', 'high', 5, 100, false, null, null, '["/clients"]'),
  ('foundation', 'ai-cost-tracking', 'AI usage and cost tracking', 'Actual Anthropic usage logging and dashboard aggregation are in place.', 'feature', 'completed', 'medium', 3, 100, false, null, null, '["/api/ai/usage"]'),
  ('client-intelligence', 'hospitality-client-brain-v2', 'Hospitality Client Brain V2', 'Restaurant intelligence, menus, activations, assets, sources, learnings, and source-aware editing are established.', 'milestone', 'completed', 'critical', 5, 100, false, null, null, '["/clients/8d771fc0-2914-57cc-90f1-9ab90f4611fd/brain"]'),
  ('client-intelligence', 'asset-truth-safety', 'Human asset classification and guarded deletion', 'Manual semantic classification and safe deletion preserve client asset truth.', 'feature', 'completed', 'high', 3, 100, false, null, null, '["/clients/8d771fc0-2914-57cc-90f1-9ab90f4611fd/brain"]'),
  ('retrieval-reasoning', 'selective-retrieval', 'Selective retrieval layer', 'Client Brain V2 retrieval returns scoped, source-aware context for downstream work.', 'feature', 'completed', 'critical', 4, 100, false, null, null, '["/prompt-inspector"]'),
  ('retrieval-reasoning', 'prompt-assembly-v1', 'Prompt Assembly V1 and Prompt Inspector', 'Deterministic assembly can be inspected before execution; it does not invoke a provider.', 'milestone', 'completed', 'critical', 5, 100, false, null, null, '["/prompt-inspector"]'),
  ('content-operations', 'shared-social-management', 'Shared Social Media Management', 'One client-scoped Dashboard and Planner is available for DemoClientD and DemoClientB.', 'feature', 'in_progress', 'high', 4, 65, false, null, null, '["/clients/8d771fc0-2914-57cc-90f1-9ab90f4611fd/social"]'),
  ('content-operations', 'durable-social-content', 'Durable social content objects', 'Move local planner drafts to durable client-scoped execution records before automation.', 'technical_debt', 'planned', 'critical', 5, 0, false, null, null, '["/clients/8d771fc0-2914-57cc-90f1-9ab90f4611fd/social"]'),
  ('execution', 'execution-layer-v1', 'Execution Layer V1', 'Manual sandbox-gated text execution and run history exist; provider routing remains the current focus.', 'milestone', 'in_progress', 'critical', 5, 40, true, null, null, '["/queue"]'),
  ('execution', 'generation-provider-access', 'Resolve image generation provider access', 'Generation requests need a project/provider path that is permitted and observable before product execution can rely on it.', 'technical_debt', 'blocked', 'critical', 4, 0, false, 'external', 'Provider access must be resolved before dependable image generation can be enabled.', '["/system-operations"]'),
  ('execution', 'generated-asset-storage', 'Generated asset storage and approval links', 'Persist generated outputs with client-scoped source references and approval state.', 'feature', 'planned', 'high', 4, 0, false, null, null, '[]'),
  ('automation', 'monthly-content-planning', 'Monthly content planning workflow', 'Generate a reviewable monthly strategy and content calendar from verified client truth.', 'feature', 'planned', 'high', 5, 0, false, null, null, '[]'),
  ('automation', 'social-scheduling', 'Live social scheduling and publishing controls', 'Enable provider scheduling only after durable content, stable media storage, and explicit approvals are in place.', 'feature', 'planned', 'high', 4, 0, false, null, null, '[]'),
  ('measurement-learning', 'analytics-ingestion', 'Reliable social analytics ingestion', 'Bring connected social performance into durable client-scoped records.', 'feature', 'needs_review', 'high', 4, 20, false, null, null, '["/clients/b29c0cbf-48fa-5e12-b7aa-8848365e66d8/social"]'),
  ('measurement-learning', 'performance-learning-loop', 'Performance-to-learning feedback loop', 'Use verified performance data to create evidence-backed Client Brain learnings.', 'feature', 'planned', 'medium', 4, 0, false, null, null, '[]'),
  ('autonomous-operations', 'autonomous-monthly-operations', 'Autonomous monthly content operations', 'Rule-bound recurring strategy, creation, approval, scheduling, and learning operations.', 'milestone', 'planned', 'medium', 5, 0, false, null, null, '[]'),
  ('automation', 'whatsapp-client-agent', 'WhatsApp client communication agent', 'Capture and evaluate a future client communication workflow without committing it to delivery.', 'idea', 'idea', 'low', 2, 0, false, null, null, '[]')
) as item(phase_slug, slug, title, description, item_type, status, priority, weight, progress, is_focus, blocker_type, blocker_reason, related_links)
join phase_rows on phase_rows.slug = item.phase_slug
on conflict (project_id, slug) do update set
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  status = excluded.status,
  priority = excluded.priority,
  weight = excluded.weight,
  progress = excluded.progress,
  is_focus = excluded.is_focus,
  blocker_type = excluded.blocker_type,
  blocker_reason = excluded.blocker_reason,
  related_links = excluded.related_links,
  started_at = case when excluded.status in ('in_progress', 'completed') then coalesce(public.roadmap_items.started_at, now()) else public.roadmap_items.started_at end,
  completed_at = case when excluded.status = 'completed' then coalesce(public.roadmap_items.completed_at, now()) else public.roadmap_items.completed_at end;

with project_row as (select id from public.roadmap_projects where slug = 'jarvis-os'), items as (select id, slug from public.roadmap_items where project_id = (select id from project_row))
insert into public.roadmap_dependencies(item_id, depends_on_item_id)
select dependent.id, prerequisite.id
from items dependent
join items prerequisite on true
where (dependent.slug, prerequisite.slug) in (
  ('durable-social-content', 'shared-social-management'),
  ('social-scheduling', 'durable-social-content'),
  ('social-scheduling', 'generated-asset-storage'),
  ('monthly-content-planning', 'prompt-assembly-v1'),
  ('performance-learning-loop', 'analytics-ingestion'),
  ('autonomous-monthly-operations', 'monthly-content-planning'),
  ('autonomous-monthly-operations', 'social-scheduling'),
  ('autonomous-monthly-operations', 'performance-learning-loop')
)
on conflict (item_id, depends_on_item_id) do nothing;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

