-- Explicitly distinguish a confirmed provider failure from the dangerous case
-- where the request may have been accepted but Jarvis did not receive a result.
alter table public.social_provider_executions
  drop constraint if exists social_provider_executions_status_check;

alter table public.social_provider_executions
  add constraint social_provider_executions_status_check
  check (status in ('pending', 'requesting', 'recovery_required', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled'));

alter table public.social_provider_executions
  add column if not exists scheduled_for_utc timestamptz,
  add column if not exists provider_request_id text,
  add column if not exists dispatch_attempt_count integer not null default 0 check (dispatch_attempt_count >= 0),
  add column if not exists recovery_poll_count integer not null default 0 check (recovery_poll_count >= 0),
  add column if not exists last_recovery_polled_at timestamptz;

alter table public.social_provider_execution_targets
  drop constraint if exists social_provider_execution_targets_status_check;

alter table public.social_provider_execution_targets
  add constraint social_provider_execution_targets_status_check
  check (status in ('pending', 'requesting', 'recovery_required', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'));

create index if not exists social_provider_executions_recovery_idx
  on public.social_provider_executions (status, updated_at asc)
  where status = 'recovery_required';
