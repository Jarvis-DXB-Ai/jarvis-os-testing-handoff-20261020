-- Automatic Final Content Understanding V1. Analysis is cached per exact media
-- binary and remains explicitly separate from Client Brain factual truth.
alter table public.social_content_media
  add column if not exists content_sha256 text;

create table if not exists public.social_content_understanding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  social_content_item_id uuid not null references public.social_content_items(id) on delete cascade,
  social_content_media_id uuid not null references public.social_content_media(id) on delete cascade,
  content_sha256 text not null,
  status text not null check (status in ('pending', 'fixture', 'analyzed', 'needs_review', 'confirmed', 'corrected', 'unknown')),
  confidence text not null check (confidence in ('high', 'review', 'unknown')),
  inferred_context jsonb not null default '{}'::jsonb,
  match_candidates jsonb not null default '[]'::jsonb,
  requires_confirmation jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  provider_request_count integer not null default 0 check (provider_request_count >= 0),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'confirmed', 'corrected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (social_content_media_id)
);

create index if not exists social_content_understanding_client_item_idx
  on public.social_content_understanding (client_id, social_content_item_id);
create index if not exists social_content_understanding_hash_idx
  on public.social_content_understanding (client_id, content_sha256);

drop trigger if exists touch_social_content_understanding_updated_at on public.social_content_understanding;
create trigger touch_social_content_understanding_updated_at
  before update on public.social_content_understanding
  for each row execute function public.touch_social_publishing_updated_at();

alter table public.social_content_understanding enable row level security;
revoke all on public.social_content_understanding from anon, authenticated;
grant all on public.social_content_understanding to service_role;
