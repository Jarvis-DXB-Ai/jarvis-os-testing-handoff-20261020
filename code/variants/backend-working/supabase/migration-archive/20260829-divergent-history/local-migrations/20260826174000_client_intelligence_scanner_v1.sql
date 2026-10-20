-- Client Intelligence Scanner V1: public evidence and reviewable proposals.
-- These tables deliberately do not write into Client Brain truth.
create table public.client_intelligence_scans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','queued','running','completed','failed','blocked')),
  source_inputs jsonb not null default '{}'::jsonb,
  request_budget_usd numeric(10,4) not null default 2 check (request_budget_usd >= 0 and request_budget_usd <= 25),
  max_provider_calls smallint not null default 5 check (max_provider_calls between 0 and 12),
  provider_calls_used smallint not null default 0 check (provider_calls_used >= 0),
  estimated_cost_usd numeric(10,4) not null default 0 check (estimated_cost_usd >= 0),
  actual_cost_usd numeric(10,4),
  blocked_reason text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (provider_calls_used <= max_provider_calls)
);
create table public.client_intelligence_evidence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  research_source_id uuid references public.jarvis_research_sources(id) on delete set null,
  source_type text not null check (source_type in ('official_website','official_social','reviews','market','competitor','press','directory','other')),
  source_url text not null, source_title text, excerpt text, normalized_evidence text,
  source_quality text not null check (source_quality in ('official','government','reputable','review_platform','competitor','directory','low')),
  published_at timestamptz, retrieved_at timestamptz not null default now(),
  freshness text not null default 'current' check (freshness in ('current','aging','stale','unknown')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(scan_id, source_url)
);
create table public.client_intelligence_claims (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  category text not null check (category in ('brand','reputation','audience','competitor','market','social','opportunity')),
  title text not null, claim text not null, interpretation text,
  confidence text not null check (confidence in ('high','medium','low')),
  confidence_reason text not null,
  truth_status text not null check (truth_status in ('verified','user_confirmed','strong_external_evidence','hypothesis','needs_confirmation')),
  change_status text not null default 'new' check (change_status in ('new','changed','unchanged','conflict','stale')),
  conflict_record_id uuid references public.client_brain_v2_records(id) on delete set null,
  last_checked_at timestamptz not null default now(), superseded_at timestamptz,
  promotion_record_id uuid references public.client_brain_v2_records(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.client_intelligence_claim_evidence (
  claim_id uuid not null references public.client_intelligence_claims(id) on delete cascade,
  evidence_id uuid not null references public.client_intelligence_evidence(id) on delete cascade,
  primary key (claim_id, evidence_id)
);
create table public.client_intelligence_competitors (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, website_url text, location_text text, relationship text not null default 'proposed' check (relationship in ('proposed','tracked','ignored')),
  latest_scan_id uuid references public.client_intelligence_scans(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb, last_checked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(client_id, name)
);
create table public.client_intelligence_opportunities (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  title text not null, observation text not null, why_it_matters text, hypothesis text not null,
  confidence text not null check (confidence in ('high','medium','low')), recommended_action text, metric_to_watch text, data_needed text,
  status text not null default 'proposed' check (status in ('proposed','tracking','dismissed','completed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index client_intelligence_scans_client_idx on public.client_intelligence_scans(client_id, created_at desc);
create index client_intelligence_claims_client_idx on public.client_intelligence_claims(client_id, category, created_at desc);
create index client_intelligence_evidence_scan_idx on public.client_intelligence_evidence(scan_id, retrieved_at desc);
alter table public.client_intelligence_scans enable row level security;
alter table public.client_intelligence_evidence enable row level security;
alter table public.client_intelligence_claims enable row level security;
alter table public.client_intelligence_claim_evidence enable row level security;
alter table public.client_intelligence_competitors enable row level security;
alter table public.client_intelligence_opportunities enable row level security;
revoke all on public.client_intelligence_scans, public.client_intelligence_evidence, public.client_intelligence_claims, public.client_intelligence_claim_evidence, public.client_intelligence_competitors, public.client_intelligence_opportunities from anon, authenticated;
grant all on public.client_intelligence_scans, public.client_intelligence_evidence, public.client_intelligence_claims, public.client_intelligence_claim_evidence, public.client_intelligence_competitors, public.client_intelligence_opportunities to service_role;
