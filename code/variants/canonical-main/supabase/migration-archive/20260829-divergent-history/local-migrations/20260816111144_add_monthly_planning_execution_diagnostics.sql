-- Monthly-plan execution evidence is intentionally separate from the plan
-- transaction. Failed provider or validation attempts remain inspectable while
-- the current saved plan/provenance stays untouched.

create table if not exists public.social_monthly_plan_ai_executions (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  monthly_plan_id uuid not null,
  action_type text not null check (action_type in ('full_plan', 'strategy_only', 'feed_plan', 'single_concept')),
  prompt_version text not null,
  provider text not null,
  model text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  cost_usd_actual numeric,
  finish_reason text,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  structured_output_requested boolean not null default true,
  structured_tool_name text,
  structured_tool_invoked boolean not null default false,
  output_character_count integer,
  output_byte_count integer,
  validation_stage text not null default 'provider_request' check (validation_stage in (
    'provider_request', 'provider_response', 'tool_output_extracted',
    'schema_validation', 'item_count_validation', 'enum_validation',
    'asset_reference_validation', 'activation_reference_validation',
    'date_validation', 'business_rule_validation', 'atomic_apply', 'succeeded'
  )),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  failing_slot integer,
  failing_field text,
  failing_value text,
  execution_outcome text not null default 'running' check (execution_outcome in (
    'running', 'provider_failed', 'provider_succeeded', 'structured_output_missing',
    'schema_failed', 'count_failed', 'enum_failed', 'reference_failed',
    'date_failed', 'business_rule_failed', 'atomic_apply_failed', 'succeeded'
  )),
  sanitized_debug_payload jsonb not null default '{}'::jsonb,
  debug_payload_truncated boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (client_id, monthly_plan_id)
    references public.social_monthly_content_plans(client_id, id) on delete cascade
);

create index if not exists social_monthly_plan_ai_executions_client_plan_started_idx
  on public.social_monthly_plan_ai_executions (client_id, monthly_plan_id, started_at desc);

alter table public.social_monthly_plan_ai_executions enable row level security;
revoke all on public.social_monthly_plan_ai_executions from anon, authenticated;
grant all on public.social_monthly_plan_ai_executions to service_role;
