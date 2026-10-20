alter table public.social_monthly_plan_ai_executions
  add column if not exists failing_reference text;
