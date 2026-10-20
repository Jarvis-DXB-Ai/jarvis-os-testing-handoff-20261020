-- Standard Factory V1 Phase B: client-scoped caption profile, immutable option payloads and intervention signals.
create table if not exists public.social_caption_profiles (
  id uuid primary key default gen_random_uuid(), client_id uuid not null unique references public.clients(id) on delete cascade,
  tone_of_voice text not null default '', caption_instructions text not null default '', footer text not null default '',
  fixed_hashtags jsonb not null default '[]'::jsonb, dynamic_hashtag_count integer not null default 3 check (dynamic_hashtag_count between 0 and 5),
  approved_phrases jsonb not null default '[]'::jsonb, avoid_phrases jsonb not null default '[]'::jsonb,
  client_brain_reference_ids jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.social_content_caption_options add column if not exists dynamic_hashtags jsonb not null default '[]'::jsonb;
alter table public.social_content_caption_options add column if not exists rendered_caption text;
alter table public.social_content_caption_options add column if not exists generation_id uuid;
alter table public.social_content_items add column if not exists caption_approved_at timestamptz;
create table if not exists public.social_caption_generations (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade, social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
 provider text not null, model text not null, prompt_version text not null, request_contract jsonb not null default '{}'::jsonb, status text not null, input_tokens integer, output_tokens integer, cost numeric, latency_ms integer, created_at timestamptz not null default now()
);
create table if not exists public.social_caption_intervention_events (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade, social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
 generation_id uuid references public.social_caption_generations(id) on delete set null, event_type text not null check (event_type in ('generated_without_edit','selected_generated_option','edited_generated_option','fully_manual_caption','regenerated_options')), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.social_caption_profiles enable row level security; alter table public.social_caption_generations enable row level security; alter table public.social_caption_intervention_events enable row level security;
revoke all on public.social_caption_profiles, public.social_caption_generations, public.social_caption_intervention_events from anon, authenticated;
grant all on public.social_caption_profiles, public.social_caption_generations, public.social_caption_intervention_events to service_role;
