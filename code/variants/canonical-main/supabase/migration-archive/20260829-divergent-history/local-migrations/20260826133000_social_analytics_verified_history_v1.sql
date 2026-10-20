create table if not exists public.social_follower_observations (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')), provider_account_id text not null,
  platform text not null check (platform in ('instagram','facebook')), observation_date date not null,
  followers bigint not null, followers_gained bigint, followers_lost bigint, observed_at timestamptz not null,
  created_at timestamptz not null default now(), unique (client_id, provider, provider_account_id, observation_date)
);
create index if not exists social_follower_observations_client_date_idx on public.social_follower_observations (client_id, platform, observation_date);
create table if not exists public.social_posting_frequency_snapshots (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')), platform text not null check (platform in ('instagram','facebook')),
  posts_per_week integer not null, average_engagement_rate numeric, average_engagement numeric, weeks_count integer not null,
  observed_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists social_posting_frequency_latest_idx on public.social_posting_frequency_snapshots (client_id, provider, observed_at desc);
alter table public.social_follower_observations enable row level security;
alter table public.social_posting_frequency_snapshots enable row level security;
revoke all on public.social_follower_observations, public.social_posting_frequency_snapshots from anon, authenticated;
grant all on public.social_follower_observations, public.social_posting_frequency_snapshots to service_role;
