-- Social provider execution foundation.
--
-- Jarvis owns the canonical publishing item, media, final caption, approval and
-- planner placement. This table records one external provider side effect after
-- it is explicitly authorised; it never stores provider credentials or signed
-- media URLs. A future executor reserves a row before POSTing to Zernio and
-- sends the same idempotency key as x-request-id.

create table if not exists public.social_provider_executions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  idempotency_key uuid not null,
  publishing_payload_version integer not null check (publishing_payload_version > 0),
  status text not null default 'pending' check (status in ('pending', 'requesting', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  scheduled_for_local timestamp without time zone not null,
  timezone text not null default 'Asia/Dubai',
  final_caption_snapshot text not null,
  media_snapshot jsonb not null default '[]'::jsonb,
  target_snapshot jsonb not null default '[]'::jsonb,
  provider_post_id text,
  raw_provider_status text,
  provider_response_summary jsonb not null default '{}'::jsonb,
  failure_diagnostic text,
  requested_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, idempotency_key),
  unique (social_content_item_id, provider, publishing_payload_version)
);

create table if not exists public.social_provider_execution_targets (
  id uuid primary key default gen_random_uuid(),
  social_provider_execution_id uuid not null references public.social_provider_executions(id) on delete cascade,
  social_content_platform_target_id uuid not null references public.social_content_platform_targets(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider_connection_id uuid not null references public.social_provider_connections(id) on delete restrict,
  platform text not null check (platform in ('instagram', 'facebook')),
  provider_account_id text not null,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  raw_provider_status text,
  external_post_id text,
  external_post_url text,
  provider_response_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_provider_execution_id, social_content_platform_target_id),
  unique (social_provider_execution_id, provider_connection_id)
);

create table if not exists public.social_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('zernio')),
  provider_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  payload_summary jsonb not null default '{}'::jsonb,
  social_provider_execution_id uuid references public.social_provider_executions(id) on delete set null,
  processed_at timestamptz,
  processing_error text,
  unique (provider, provider_event_id)
);

create index if not exists social_provider_executions_client_status_idx
  on public.social_provider_executions (client_id, status, created_at desc);
create index if not exists social_provider_executions_item_idx
  on public.social_provider_executions (social_content_item_id, created_at desc);
create index if not exists social_provider_execution_targets_target_idx
  on public.social_provider_execution_targets (social_content_platform_target_id);
create index if not exists social_provider_webhook_events_execution_idx
  on public.social_provider_webhook_events (social_provider_execution_id, received_at desc);

drop trigger if exists touch_social_provider_executions_updated_at on public.social_provider_executions;
create trigger touch_social_provider_executions_updated_at
before update on public.social_provider_executions
for each row execute function public.touch_social_publishing_updated_at();

drop trigger if exists touch_social_provider_execution_targets_updated_at on public.social_provider_execution_targets;
create trigger touch_social_provider_execution_targets_updated_at
before update on public.social_provider_execution_targets
for each row execute function public.touch_social_publishing_updated_at();

alter table public.social_provider_executions enable row level security;
alter table public.social_provider_execution_targets enable row level security;
alter table public.social_provider_webhook_events enable row level security;

revoke all on public.social_provider_executions, public.social_provider_execution_targets, public.social_provider_webhook_events from anon, authenticated;
grant all on public.social_provider_executions, public.social_provider_execution_targets, public.social_provider_webhook_events to service_role;
