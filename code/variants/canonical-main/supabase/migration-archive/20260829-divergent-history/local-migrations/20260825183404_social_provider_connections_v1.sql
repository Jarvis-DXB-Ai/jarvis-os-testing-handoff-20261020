-- Canonical, client-scoped mapping of verified social provider accounts.
-- Provider tokens and raw payloads deliberately remain outside this table.

create table if not exists public.social_provider_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  provider_profile_id text,
  provider_connection_id text,
  platform text not null check (platform in ('instagram', 'facebook', 'meta_ads')),
  platform_account_id text not null,
  account_name text,
  handle text,
  status text not null check (status in ('connected', 'needs_attention', 'expired', 'disconnected', 'not_mapped', 'not_connected', 'unsupported')),
  capabilities jsonb not null default '{}'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider, platform, platform_account_id),
  unique (provider, platform, platform_account_id)
);

create index if not exists social_provider_connections_client_idx on public.social_provider_connections (client_id, provider, status);

drop trigger if exists touch_social_provider_connections_updated_at on public.social_provider_connections;
create trigger touch_social_provider_connections_updated_at
before update on public.social_provider_connections
for each row execute function public.touch_social_publishing_updated_at();

alter table public.social_provider_connections enable row level security;
revoke all on public.social_provider_connections from anon, authenticated;
grant all on public.social_provider_connections to service_role;
