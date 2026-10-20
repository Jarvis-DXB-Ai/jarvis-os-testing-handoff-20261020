-- Durable post and audience observations created only by an explicit Social
-- Insights refresh. These tables contain no credentials and no provider media
-- URLs; normal dashboard rendering is entirely local/cache-only.

create table if not exists public.social_performance_post_observations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.social_performance_snapshots(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  platform text not null check (platform in ('instagram', 'facebook')),
  provider_post_id text not null,
  published_at timestamptz,
  post_type text not null,
  title text,
  caption_excerpt text,
  thumbnail_path text,
  post_url text,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  views bigint,
  impressions bigint,
  reach bigint,
  interactions bigint,
  engagement_rate numeric,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, provider_post_id)
);

create index if not exists social_performance_post_observations_client_date_idx
  on public.social_performance_post_observations (client_id, platform, published_at desc);

create table if not exists public.social_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('zernio')),
  provider_account_id text not null,
  period_start date not null,
  period_end date not null,
  views bigint,
  reach bigint,
  accounts_engaged bigint,
  total_interactions bigint,
  data_delay text,
  timeframe text,
  top_cities jsonb not null default '[]'::jsonb,
  top_countries jsonb not null default '[]'::jsonb,
  age_distribution jsonb not null default '[]'::jsonb,
  gender_distribution jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create index if not exists social_audience_snapshots_latest_idx
  on public.social_audience_snapshots (client_id, provider, fetched_at desc);

alter table public.social_performance_post_observations enable row level security;
alter table public.social_audience_snapshots enable row level security;
revoke all on public.social_performance_post_observations, public.social_audience_snapshots from anon, authenticated;
grant all on public.social_performance_post_observations, public.social_audience_snapshots to service_role;
