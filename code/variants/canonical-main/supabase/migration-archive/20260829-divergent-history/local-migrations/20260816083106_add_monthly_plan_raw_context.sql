-- Preserve one exact human monthly instruction alongside the earlier
-- structured fields. The legacy columns remain for backwards compatibility
-- and future AI-derived allocations; this field is the user-authored source.
alter table public.social_monthly_content_plans
  add column if not exists monthly_context text not null default '';
