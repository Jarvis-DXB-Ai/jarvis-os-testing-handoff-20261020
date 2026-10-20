-- Canonical Agent Runtime V1
--
-- This is intentionally separate from the legacy execution_queue/execution_runs
-- sandbox flow. The legacy tables remain the historical AI-sandbox ledger; this
-- runtime owns durable, permissioned, browser-independent agent executions.

create table if not exists public.agent_runtime_settings (
  singleton boolean primary key default true check (singleton),
  autonomous_execution_enabled boolean not null default true,
  external_mutations_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_note text not null default 'Agent Runtime V1 bootstrap'
);

create table if not exists public.agent_runtime_definitions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete restrict,
  agent_key text not null unique check (agent_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  purpose text not null check (char_length(purpose) between 1 and 1000),
  definition_version text not null default 'v1',
  operational_status text not null default 'active' check (operational_status in ('active', 'paused', 'blocked', 'deprecated')),
  allowed_triggers text[] not null default '{manual}'::text[] check (allowed_triggers <@ array['manual', 'scheduled', 'event', 'delegated']::text[]),
  allowed_tool_keys text[] not null default '{}'::text[],
  allowed_data_scopes text[] not null default '{}'::text[],
  client_scope_requirement text not null default 'optional' check (client_scope_requirement in ('none', 'optional', 'required')),
  model_policy jsonb not null default '{"mode":"deterministic_only","allowed_models":[]}'::jsonb,
  cost_policy jsonb not null default '{"max_run_cost_usd":0,"ai_allowed":false}'::jsonb,
  mutation_policy jsonb not null default '{"read":true,"internal_write":false,"external_mutation":false}'::jsonb,
  approval_policy jsonb not null default '{"required_before_act":false,"approval_timeout_hours":168}'::jsonb,
  retry_policy jsonb not null default '{"max_attempts":1,"provider_uncertainty":"recovery_required"}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  memory_policy jsonb not null default '{"promotion_requires_approval":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runtime_definition_skills (
  id uuid primary key default gen_random_uuid(),
  agent_runtime_definition_id uuid not null references public.agent_runtime_definitions(id) on delete cascade,
  agent_skill_id uuid not null references public.agent_skills(id) on delete restrict,
  access_type text not null default 'allowed' check (access_type in ('allowed', 'required')),
  created_at timestamptz not null default now(),
  unique (agent_runtime_definition_id, agent_skill_id)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_runtime_definition_id uuid not null references public.agent_runtime_definitions(id) on delete restrict,
  legacy_execution_queue_id uuid references public.execution_queue(id) on delete set null,
  parent_run_id uuid references public.agent_runs(id) on delete set null,
  client_id uuid references public.clients(id) on delete restrict,
  trigger_type text not null check (trigger_type in ('manual', 'scheduled', 'event', 'delegated')),
  trigger_reference text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  resource_key text not null check (char_length(resource_key) between 1 and 240),
  goal text not null check (char_length(goal) between 1 and 2000),
  status text not null default 'queued' check (status in ('queued', 'observing', 'running', 'waiting_for_approval', 'waiting_for_external', 'recovery_required', 'completed', 'failed', 'cancelled')),
  current_stage text not null default 'queued' check (current_stage in ('queued', 'observe', 'think', 'act', 'observe_result', 'waiting_for_approval', 'waiting_for_external', 'recovery', 'completed', 'failed', 'cancelled')),
  approval_state text not null default 'not_required' check (approval_state in ('not_required', 'pending', 'approved', 'rejected', 'expired')),
  workflow_instance_id text unique,
  context_manifest jsonb not null default '{}'::jsonb,
  decision_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  result_reference jsonb not null default '{}'::jsonb,
  retry_state jsonb not null default '{"attempt":0,"max_attempts":1}'::jsonb,
  cost_limit_usd numeric(12,6) not null default 0 check (cost_limit_usd >= 0),
  cost_actual_usd numeric(12,6) not null default 0 check (cost_actual_usd >= 0),
  error_diagnostic jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_runtime_definition_id, idempotency_key)
);

create unique index if not exists agent_runtime_active_resource_lock
  on public.agent_runs(agent_runtime_definition_id, resource_key)
  where status in ('queued', 'observing', 'running', 'waiting_for_approval', 'waiting_for_external', 'recovery_required');
create index if not exists agent_runs_definition_created_idx on public.agent_runs(agent_runtime_definition_id, created_at desc);
create index if not exists agent_runs_client_created_idx on public.agent_runs(client_id, created_at desc) where client_id is not null;
create index if not exists agent_runs_parent_created_idx on public.agent_runs(parent_run_id, created_at asc) where parent_run_id is not null;

create table if not exists public.agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  stage text not null check (stage in ('observe', 'think', 'act', 'observe_result', 'approval', 'recovery')),
  action_key text not null check (action_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null check (status in ('started', 'completed', 'waiting', 'failed', 'blocked', 'skipped')),
  evidence jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  diagnostic text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agent_run_id, sequence_no),
  unique (agent_run_id, action_key)
);

create table if not exists public.agent_run_model_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  provider text not null,
  model text not null,
  purpose text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  provider_request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_run_approvals (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  proposed_action jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_run_id)
);

create or replace function public.agent_runtime_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_runtime_settings_set_updated_at on public.agent_runtime_settings;
create trigger agent_runtime_settings_set_updated_at before update on public.agent_runtime_settings
for each row execute function public.agent_runtime_set_updated_at();
drop trigger if exists agent_runtime_definitions_set_updated_at on public.agent_runtime_definitions;
create trigger agent_runtime_definitions_set_updated_at before update on public.agent_runtime_definitions
for each row execute function public.agent_runtime_set_updated_at();
drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at before update on public.agent_runs
for each row execute function public.agent_runtime_set_updated_at();
drop trigger if exists agent_run_approvals_set_updated_at on public.agent_run_approvals;
create trigger agent_run_approvals_set_updated_at before update on public.agent_run_approvals
for each row execute function public.agent_runtime_set_updated_at();

alter table public.agent_runtime_settings enable row level security;
alter table public.agent_runtime_definitions enable row level security;
alter table public.agent_runtime_definition_skills enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_steps enable row level security;
alter table public.agent_run_model_calls enable row level security;
alter table public.agent_run_approvals enable row level security;

revoke all on public.agent_runtime_settings, public.agent_runtime_definitions, public.agent_runtime_definition_skills, public.agent_runs, public.agent_run_steps, public.agent_run_model_calls, public.agent_run_approvals from anon, authenticated;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


with orchestrator as (
  select id from public.agents where agent_name = 'Jarvis Orchestrator' limit 1
), seeded_skill as (
  insert into public.agent_skills (agent_id, name, category, description, status, model_recommendation, instructions, metadata)
  select id, 'System Health Snapshot', 'operations', 'Read-only production-health inspection that writes one internal runtime report.', 'active', null,
    'Observe app health, database connectivity, provider connection cache, failed execution counts and unresolved Finance review counts. Do not call providers, alter Client Brain, alter Finance truth, or mutate social content.',
    jsonb_build_object('runtime_skill_key', 'system-health-snapshot', 'mutation_class', 'internal_write_only')
  from orchestrator
  where not exists (select 1 from public.agent_skills skill where skill.agent_id = orchestrator.id and skill.name = 'System Health Snapshot')
  returning id
), existing_skill as (
  select id from seeded_skill
  union all
  select skill.id from public.agent_skills skill join orchestrator on skill.agent_id = orchestrator.id where skill.name = 'System Health Snapshot'
  limit 1
), definition as (
  insert into public.agent_runtime_definitions (
    agent_id, agent_key, display_name, purpose, operational_status, allowed_triggers, allowed_tool_keys, allowed_data_scopes,
    client_scope_requirement, model_policy, cost_policy, mutation_policy, approval_policy, retry_policy, output_contract, memory_policy
  )
  select orchestrator.id, 'system-health', 'System Health Agent',
    'Safely inspects Jarvis production health and persists an internal operational report without AI or provider calls.',
    'active', array['manual']::text[], array['supabase-read', 'internal-report-write']::text[],
    array['system-health', 'provider-connection-cache', 'social-execution-ledger', 'finance-review-summary']::text[],
    'none',
    '{"mode":"deterministic_only","allowed_models":[]}'::jsonb,
    '{"max_run_cost_usd":0,"ai_allowed":false}'::jsonb,
    '{"read":true,"internal_write":true,"external_mutation":false}'::jsonb,
    '{"required_before_act":false,"approval_timeout_hours":168}'::jsonb,
    '{"max_attempts":1,"provider_uncertainty":"recovery_required"}'::jsonb,
    '{"report_type":"system_health","visibility":"internal"}'::jsonb,
    '{"promotion_requires_approval":true,"auto_promote":false}'::jsonb
  from orchestrator
  on conflict (agent_key) do update set
    display_name = excluded.display_name,
    purpose = excluded.purpose,
    operational_status = excluded.operational_status,
    allowed_triggers = excluded.allowed_triggers,
    allowed_tool_keys = excluded.allowed_tool_keys,
    allowed_data_scopes = excluded.allowed_data_scopes,
    model_policy = excluded.model_policy,
    cost_policy = excluded.cost_policy,
    mutation_policy = excluded.mutation_policy,
    approval_policy = excluded.approval_policy,
    retry_policy = excluded.retry_policy,
    output_contract = excluded.output_contract,
    memory_policy = excluded.memory_policy
  returning id
)
insert into public.agent_runtime_definition_skills (agent_runtime_definition_id, agent_skill_id, access_type)
select definition.id, existing_skill.id, 'required' from definition cross join existing_skill
on conflict (agent_runtime_definition_id, agent_skill_id) do update set access_type = excluded.access_type;
