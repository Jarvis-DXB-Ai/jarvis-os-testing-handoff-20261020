-- A post observation is a historical metrics sample; an optional execution
-- link explains which Jarvis Planner dispatch created that provider identity.
alter table public.social_performance_post_observations
  add column if not exists social_provider_execution_id uuid references public.social_provider_executions(id) on delete set null,
  add column if not exists social_provider_execution_target_id uuid references public.social_provider_execution_targets(id) on delete set null;

create index if not exists social_performance_post_observations_execution_idx
  on public.social_performance_post_observations (social_provider_execution_id)
  where social_provider_execution_id is not null;
