-- Add human-readable model height for Character Studio body consistency.

alter table public.ai_models
  add column if not exists height text;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

