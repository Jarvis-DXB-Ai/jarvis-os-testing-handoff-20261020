-- Social Intelligence Agent V1
--
-- Deterministic, client-scoped Social performance artifacts. These records
-- are deliberately separate from approved Client Brain truth. They retain the
-- calculation evidence needed to audit a recommendation without creating a
-- promotion path into Client Brain.

create table if not exists public.social_intelligence_artifacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  artifact_version text not null default 'v1',
  data_revision text not null check (data_revision ~ '^[a-f0-9]{64}$'),
  period_start date,
  period_end date,
  deterministic boolean not null default true,
  model_provider text,
  model_name text,
  model_cost_usd numeric(12,6) not null default 0 check (model_cost_usd >= 0),
  executive_summary jsonb not null default '[]'::jsonb,
  working jsonb not null default '[]'::jsonb,
  needs_attention jsonb not null default '[]'::jsonb,
  recommended_next_moves jsonb not null default '[]'::jsonb,
  experiments jsonb not null default '[]'::jsonb,
  data_gaps jsonb not null default '[]'::jsonb,
  source_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, artifact_version, data_revision)
);

create index if not exists social_intelligence_artifacts_client_created_idx
  on public.social_intelligence_artifacts (client_id, created_at desc);

create index if not exists social_intelligence_artifacts_run_idx
  on public.social_intelligence_artifacts (agent_run_id) where agent_run_id is not null;

alter table public.social_intelligence_artifacts enable row level security;
revoke all on public.social_intelligence_artifacts from anon, authenticated;
grant all on public.social_intelligence_artifacts to service_role;

drop trigger if exists social_intelligence_artifacts_set_updated_at on public.social_intelligence_artifacts;
create trigger social_intelligence_artifacts_set_updated_at before update on public.social_intelligence_artifacts
for each row execute function public.agent_runtime_set_updated_at();

with orchestrator as (
  select id from public.agents where agent_name = 'Jarvis Orchestrator' limit 1
), seeded_skill as (
  insert into public.agent_skills (agent_id, name, category, description, status, model_recommendation, instructions, metadata)
  select id, 'Social Performance Evidence', 'social',
    'Calculates client-scoped deterministic signals from retained Social performance evidence and writes one internal recommendation artifact.',
    'active', null,
    'Read only cached Social performance, approved Client Brain context and prior Social Intelligence artifacts for the scoped client. Calculate evidence in code. Do not refresh Zernio, call a model, publish, schedule, alter provider content, change Finance, or promote any Client Brain truth.',
    jsonb_build_object('runtime_skill_key', 'social-performance-evidence', 'mutation_class', 'internal_write_only')
  from orchestrator
  where not exists (select 1 from public.agent_skills skill where skill.agent_id = orchestrator.id and skill.name = 'Social Performance Evidence')
  returning id
), existing_skill as (
  select id from seeded_skill
  union all
  select skill.id from public.agent_skills skill join orchestrator on skill.agent_id = orchestrator.id where skill.name = 'Social Performance Evidence'
  limit 1
), definition as (
  insert into public.agent_runtime_definitions (
    agent_id, agent_key, display_name, purpose, definition_version, operational_status, allowed_triggers, allowed_tool_keys, allowed_data_scopes,
    client_scope_requirement, model_policy, cost_policy, mutation_policy, approval_policy, retry_policy, output_contract, memory_policy
  )
  select orchestrator.id, 'social-intelligence', 'Social Intelligence Agent',
    'Analyses retained client Social performance evidence and writes evidence-backed recommendations for the next planning cycle without provider or Client Brain mutation.',
    'v1', 'active', array['manual']::text[], array['supabase-read', 'deterministic-social-analysis', 'internal-recommendation-write']::text[],
    array['client-brain-approved-context', 'social-performance-cache', 'social-post-observations', 'social-audience-cache', 'social-follower-history', 'social-posting-frequency', 'social-intelligence-history']::text[],
    'required',
    '{"mode":"deterministic_only","allowed_models":[]}'::jsonb,
    '{"max_run_cost_usd":0,"ai_allowed":false}'::jsonb,
    '{"read":true,"internal_write":true,"external_mutation":false}'::jsonb,
    '{"required_before_act":false,"approval_timeout_hours":168}'::jsonb,
    '{"max_attempts":1,"provider_uncertainty":"recovery_required"}'::jsonb,
    '{"artifact_type":"social_intelligence","visibility":"internal","evidence_required":true,"max_recommendations":5}'::jsonb,
    '{"promotion_requires_approval":true,"auto_promote":false,"writes_client_brain":false}'::jsonb
  from orchestrator
  on conflict (agent_key) do update set
    display_name = excluded.display_name,
    purpose = excluded.purpose,
    definition_version = excluded.definition_version,
    operational_status = excluded.operational_status,
    allowed_triggers = excluded.allowed_triggers,
    allowed_tool_keys = excluded.allowed_tool_keys,
    allowed_data_scopes = excluded.allowed_data_scopes,
    client_scope_requirement = excluded.client_scope_requirement,
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
