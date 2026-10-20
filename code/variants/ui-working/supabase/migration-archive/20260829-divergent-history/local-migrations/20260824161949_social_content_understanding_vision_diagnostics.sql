alter table public.social_content_understanding
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists latency_ms integer,
  add column if not exists cost numeric,
  add column if not exists diagnostics jsonb not null default '{}'::jsonb;
