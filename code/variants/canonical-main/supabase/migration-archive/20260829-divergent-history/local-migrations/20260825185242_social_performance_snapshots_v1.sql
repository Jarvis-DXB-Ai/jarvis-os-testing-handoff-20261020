-- Immutable, client-scoped operational snapshots from explicit Zernio reads.
-- No tokens, captions, or provider credentials are retained here.

create table if not exists public.social_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  platform text not null check (platform in ('instagram', 'facebook')),
  provider_account_id text not null,
  period_key text not null check (period_key in ('current_30d', 'previous_30d')),
  period_start date not null,
  period_end date not null,
  followers integer,
  post_reach bigint,
  impressions bigint,
  views bigint,
  engagements bigint,
  engagement_rate numeric,
  link_clicks bigint,
  posts_count integer not null default 0,
  top_posts jsonb not null default '[]'::jsonb,
  provider_summary jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create index if not exists social_performance_snapshots_latest_idx
  on public.social_performance_snapshots (client_id, platform, period_key, synced_at desc);

alter table public.social_performance_snapshots enable row level security;
revoke all on public.social_performance_snapshots from anon, authenticated;
grant all on public.social_performance_snapshots to service_role;
