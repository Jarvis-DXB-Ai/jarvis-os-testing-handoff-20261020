-- Provenance is retained alongside each immutable Zernio snapshot so the UI
-- can explain scope and source without inventing a metric definition.
alter table public.social_performance_snapshots
  add column if not exists metric_provenance jsonb not null default '{}'::jsonb;

comment on column public.social_performance_snapshots.metric_provenance is
  'Source field and scope map for this immutable provider snapshot. No credentials or raw provider payloads.';
