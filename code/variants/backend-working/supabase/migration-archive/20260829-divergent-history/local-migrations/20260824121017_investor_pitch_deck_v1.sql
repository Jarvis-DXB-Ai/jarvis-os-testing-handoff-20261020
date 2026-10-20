-- Investor Pitch Deck V1. System-level, investor-safe narrative data only.
-- Canonical Finance, Packages and Roadmap records remain the source of truth
-- for live operating metrics and product status.

create table if not exists public.pitch_deck_profiles (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  hero_headline text not null check (char_length(hero_headline) between 8 and 240),
  hero_thesis text not null check (char_length(hero_thesis) between 8 and 600),
  closing_headline text not null check (char_length(closing_headline) between 8 and 240),
  founder_name text not null check (char_length(founder_name) between 2 and 120),
  founder_bio text not null check (char_length(founder_bio) between 8 and 2400),
  founder_claimed_operating_revenue_eur numeric(14, 2) not null check (founder_claimed_operating_revenue_eur >= 0),
  proposed_pre_money_valuation_eur numeric(14, 2) not null check (proposed_pre_money_valuation_eur > 0),
  target_dilution_percent numeric(6, 3) not null check (target_dilution_percent between 0 and 100),
  target_clients_12m integer not null check (target_clients_12m between 0 and 1000000),
  target_ai_infrastructure_eur numeric(14, 2) not null check (target_ai_infrastructure_eur >= 0),
  projection_scenarios jsonb not null default '{}'::jsonb check (jsonb_typeof(projection_scenarios) = 'object'),
  market_assumptions jsonb not null default '{}'::jsonb check (jsonb_typeof(market_assumptions) = 'object'),
  use_of_funds jsonb not null default '[]'::jsonb check (jsonb_typeof(use_of_funds) = 'array'),
  risk_items jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_items) = 'array'),
  section_status jsonb not null default '{}'::jsonb check (jsonb_typeof(section_status) = 'object'),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pitch_deck_research_sources (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.pitch_deck_profiles(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 4 and 300),
  publisher text not null check (char_length(publisher) between 2 and 160),
  publication_date date,
  source_url text not null check (source_url ~ '^https://'),
  claim_supported text not null check (char_length(claim_supported) between 8 and 1200),
  methodology_note text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, slug)
);

create index if not exists pitch_deck_research_profile_idx
  on public.pitch_deck_research_sources(profile_id, active, sort_order);

create or replace function public.pitch_deck_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pitch_deck_profiles_set_updated_at on public.pitch_deck_profiles;
create trigger pitch_deck_profiles_set_updated_at before update on public.pitch_deck_profiles
for each row execute function public.pitch_deck_set_updated_at();

drop trigger if exists pitch_deck_research_set_updated_at on public.pitch_deck_research_sources;
create trigger pitch_deck_research_set_updated_at before update on public.pitch_deck_research_sources
for each row execute function public.pitch_deck_set_updated_at();

alter table public.pitch_deck_profiles enable row level security;
alter table public.pitch_deck_research_sources enable row level security;
revoke all on public.pitch_deck_profiles, public.pitch_deck_research_sources from anon, authenticated;
grant all on public.pitch_deck_profiles, public.pitch_deck_research_sources to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

