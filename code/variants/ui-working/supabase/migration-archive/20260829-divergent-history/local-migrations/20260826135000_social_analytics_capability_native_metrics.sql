-- Retain provider-native post metrics without redefining them as shared
-- analytics. This column is service-role only alongside the observation data.
alter table public.social_performance_post_observations
  add column if not exists native_metrics jsonb not null default '{}'::jsonb;

alter table public.social_audience_snapshots
  add column if not exists native_metrics jsonb not null default '{}'::jsonb;

comment on column public.social_performance_post_observations.native_metrics is
  'Provider-native post metrics retained by Jarvis; never assumed cross-platform comparable.';

comment on column public.social_audience_snapshots.native_metrics is
  'Provider-native account metrics retained by Jarvis; never used as post aggregates.';
