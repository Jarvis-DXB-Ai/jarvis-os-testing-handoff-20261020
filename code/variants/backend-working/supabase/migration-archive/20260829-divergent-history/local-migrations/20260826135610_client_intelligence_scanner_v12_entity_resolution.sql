-- V1.2 keeps V1.1 scans immutable while separating discovered results from admitted evidence.
alter table public.client_intelligence_scans
  add column if not exists entity_resolution_version text,
  add column if not exists discovered_result_count integer not null default 0,
  add column if not exists admitted_evidence_count integer not null default 0,
  add column if not exists rejected_result_count integer not null default 0,
  add column if not exists ambiguous_result_count integer not null default 0,
  add column if not exists duplicate_result_count integer not null default 0;

-- V1 evidence retained only legacy source labels. V1.2 needs a classification
-- vocabulary that is independent from quality tier; old rows remain valid.
alter table public.client_intelligence_evidence drop constraint if exists client_intelligence_evidence_source_type_check;
alter table public.client_intelligence_evidence add constraint client_intelligence_evidence_source_type_check check (source_type in ('official_website','official_social','reviews','market','competitor','press','directory','other','official_client','official_competitor','government','market_research','review_platform','social'));
alter table public.client_intelligence_evidence drop constraint if exists client_intelligence_evidence_source_quality_check;
alter table public.client_intelligence_evidence add constraint client_intelligence_evidence_source_quality_check check (source_quality in ('official','government','reputable','review_platform','competitor','directory','low','tier_1','tier_2','tier_3','tier_4'));

create table if not exists public.client_intelligence_discoveries (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  research_source_id uuid references public.jarvis_research_sources(id) on delete set null,
  area text not null,
  source_url text not null,
  source_title text,
  excerpt text,
  classification text not null check (classification in ('CLIENT_OFFICIAL','CLIENT_CONFIRMED_EXTERNAL','REVIEW_PLATFORM_CLIENT_MATCH','COMPETITOR','MARKET','RELATED_ENTITY_MISMATCH','AMBIGUOUS','UNRELATED')),
  admitted boolean not null default false,
  rejection_reason text,
  source_type text not null,
  source_quality text not null check (source_quality in ('tier_1','tier_2','tier_3','tier_4')),
  created_at timestamptz not null default now(),
  unique(scan_id, source_url)
);
create index if not exists client_intelligence_discoveries_scan_idx on public.client_intelligence_discoveries(scan_id, created_at desc);
alter table public.client_intelligence_discoveries enable row level security;
revoke all on public.client_intelligence_discoveries from anon, authenticated;
grant all on public.client_intelligence_discoveries to service_role;

create table if not exists public.client_intelligence_public_discrepancies (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  scan_id uuid not null references public.client_intelligence_scans(id) on delete cascade,
  evidence_id uuid references public.client_intelligence_evidence(id) on delete set null,
  category text not null check (category in ('contact','address','opening_hours','menu','offer','service','booking_link','social_handle','other')),
  public_value text not null, verified_value text not null, confidence text not null check (confidence in ('high','medium','low')),
  status text not null default 'needs_attention' check (status in ('needs_attention','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create unique index if not exists client_intelligence_public_discrepancy_once_idx
  on public.client_intelligence_public_discrepancies(scan_id, evidence_id, category)
  where evidence_id is not null;
alter table public.client_intelligence_public_discrepancies enable row level security;
revoke all on public.client_intelligence_public_discrepancies from anon, authenticated;
grant all on public.client_intelligence_public_discrepancies to service_role;
