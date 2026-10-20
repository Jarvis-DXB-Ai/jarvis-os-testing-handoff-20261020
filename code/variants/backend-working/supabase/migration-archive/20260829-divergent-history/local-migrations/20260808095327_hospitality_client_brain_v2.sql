-- Hospitality Client Brain v2 foundations.
--
-- This is a backward-compatible extension. Existing clients remain on the
-- legacy Client Brain unless their clients.brain_architecture_version is set
-- to hospitality_v2. The DemoClientC source client is read only here.

alter table public.clients
  add column if not exists brain_architecture_version text not null default 'legacy_v1';

create table if not exists public.client_brain_v2_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  stable_key text not null,
  top_section text not null check (top_section in (
    'intelligence',
    'products_offers',
    'assets',
    'brand_guidelines',
    'sources',
    'learnings'
  )),
  subsection text not null,
  record_type text not null,
  title text not null,
  summary text,
  content text,
  knowledge_class text not null check (knowledge_class in (
    'stable',
    'dynamic',
    'operational',
    'temporal',
    'commercial',
    'asset',
    'brand_guideline',
    'source',
    'learning',
    'knowledge_gap'
  )),
  status text not null default 'draft' check (status in (
    'draft',
    'needs_review',
    'approved',
    'active',
    'resolved',
    'current',
    'unverified',
    'conflicting',
    'contradicted',
    'superseded',
    'historical',
    'restricted',
    'archived'
  )),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  priority smallint not null default 3 check (priority between 1 and 5),
  effective_date date,
  last_verified_at timestamptz,
  valid_until date,
  review_at date,
  source_type text,
  provenance jsonb not null default '{}'::jsonb,
  superseded_by_id uuid references public.client_brain_v2_records(id) on delete set null,
  legacy_client_knowledge_id uuid references public.client_knowledge(id) on delete set null,
  legacy_client_brain_id uuid references public.client_brain(id) on delete set null,
  legacy_asset_upload_id uuid references public.asset_uploads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, stable_key),
  unique (client_id, id)
);

create table if not exists public.client_brain_v2_record_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  record_id uuid not null,
  version_snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  foreign key (client_id, record_id)
    references public.client_brain_v2_records(client_id, id)
    on delete cascade
);

create table if not exists public.client_brain_v2_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  from_record_id uuid not null,
  to_record_id uuid not null,
  relation_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (client_id, from_record_id)
    references public.client_brain_v2_records(client_id, id)
    on delete cascade,
  foreign key (client_id, to_record_id)
    references public.client_brain_v2_records(client_id, id)
    on delete cascade,
  unique (client_id, from_record_id, to_record_id, relation_type),
  check (from_record_id <> to_record_id)
);

create table if not exists public.client_brain_file_objects (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null,
  storage_path text not null,
  preview_path text,
  optimized_path text,
  file_name text not null,
  file_type text,
  file_size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table if not exists public.client_brain_v2_record_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  record_id uuid not null,
  file_object_id uuid not null references public.client_brain_file_objects(id) on delete restrict,
  semantic_role text not null check (semantic_role in (
    'truth_reference',
    'creative_reference',
    'approved_marketing_asset',
    'generated_asset',
    'raw_asset',
    'archived_asset',
    'source_document'
  )),
  approval_status text not null default 'draft' check (approval_status in (
    'draft',
    'needs_review',
    'approved',
    'restricted',
    'archived'
  )),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (client_id, record_id)
    references public.client_brain_v2_records(client_id, id)
    on delete cascade,
  unique (client_id, record_id, file_object_id)
);

create table if not exists public.client_brain_v2_commercial_details (
  record_id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  object_type text not null check (object_type in (
    'product',
    'collection',
    'offer',
    'experience_event',
    'package'
  )),
  price_amount numeric(12,2),
  currency text,
  pricing_mechanism text,
  availability text,
  schedule jsonb not null default '{}'::jsonb,
  restrictions text,
  capacity integer,
  booking_requirements text,
  ingredients text[] not null default '{}'::text[],
  allergens text[] not null default '{}'::text[],
  key_selling_points text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, record_id)
    references public.client_brain_v2_records(client_id, id)
    on delete cascade
);

create index if not exists client_brain_v2_records_client_section_idx
  on public.client_brain_v2_records (client_id, top_section, subsection, status);
create index if not exists client_brain_v2_records_client_type_idx
  on public.client_brain_v2_records (client_id, record_type, status);
create index if not exists client_brain_v2_records_review_idx
  on public.client_brain_v2_records (client_id, review_at)
  where review_at is not null and status not in ('archived', 'superseded');
create index if not exists client_brain_v2_records_legacy_knowledge_idx
  on public.client_brain_v2_records (legacy_client_knowledge_id)
  where legacy_client_knowledge_id is not null;
create index if not exists client_brain_v2_records_legacy_asset_idx
  on public.client_brain_v2_records (legacy_asset_upload_id)
  where legacy_asset_upload_id is not null;
create index if not exists client_brain_v2_versions_record_idx
  on public.client_brain_v2_record_versions (client_id, record_id, changed_at desc);
create index if not exists client_brain_v2_links_from_idx
  on public.client_brain_v2_links (client_id, from_record_id, relation_type);
create index if not exists client_brain_v2_links_to_idx
  on public.client_brain_v2_links (client_id, to_record_id, relation_type);
create index if not exists client_brain_v2_record_files_record_idx
  on public.client_brain_v2_record_files (client_id, record_id, approval_status);
create index if not exists client_brain_v2_commercial_client_type_idx
  on public.client_brain_v2_commercial_details (client_id, object_type);

create or replace function public.touch_client_brain_v2_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.capture_client_brain_v2_record_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.client_brain_v2_record_versions (
    client_id,
    record_id,
    version_snapshot
  ) values (
    old.client_id,
    old.id,
    to_jsonb(old)
  );
  return new;
end;
$$;

drop trigger if exists touch_client_brain_v2_records on public.client_brain_v2_records;
create trigger touch_client_brain_v2_records
before update on public.client_brain_v2_records
for each row execute function public.touch_client_brain_v2_updated_at();

drop trigger if exists version_client_brain_v2_records on public.client_brain_v2_records;
create trigger version_client_brain_v2_records
before update on public.client_brain_v2_records
for each row execute function public.capture_client_brain_v2_record_version();

drop trigger if exists touch_client_brain_file_objects on public.client_brain_file_objects;
create trigger touch_client_brain_file_objects
before update on public.client_brain_file_objects
for each row execute function public.touch_client_brain_v2_updated_at();

drop trigger if exists touch_client_brain_v2_commercial_details on public.client_brain_v2_commercial_details;
create trigger touch_client_brain_v2_commercial_details
before update on public.client_brain_v2_commercial_details
for each row execute function public.touch_client_brain_v2_updated_at();

alter table public.client_brain_v2_records enable row level security;
alter table public.client_brain_v2_record_versions enable row level security;
alter table public.client_brain_v2_links enable row level security;
alter table public.client_brain_file_objects enable row level security;
alter table public.client_brain_v2_record_files enable row level security;
alter table public.client_brain_v2_commercial_details enable row level security;

-- There is not yet a reusable authenticated user-to-client membership model.
-- Keep v2 behind server routes and service-role access, matching CRM safety.
revoke all on public.client_brain_v2_records from anon, authenticated;
revoke all on public.client_brain_v2_record_versions from anon, authenticated;
revoke all on public.client_brain_v2_links from anon, authenticated;
revoke all on public.client_brain_file_objects from anon, authenticated;
revoke all on public.client_brain_v2_record_files from anon, authenticated;
revoke all on public.client_brain_v2_commercial_details from anon, authenticated;
grant all on public.client_brain_v2_records to service_role;
grant all on public.client_brain_v2_record_versions to service_role;
grant all on public.client_brain_v2_links to service_role;
grant all on public.client_brain_file_objects to service_role;
grant all on public.client_brain_v2_record_files to service_role;
grant all on public.client_brain_v2_commercial_details to service_role;
revoke execute on function public.touch_client_brain_v2_updated_at() from public, anon, authenticated;
revoke execute on function public.capture_client_brain_v2_record_version() from public, anon, authenticated;
grant execute on function public.touch_client_brain_v2_updated_at() to service_role;
grant execute on function public.capture_client_brain_v2_record_version() to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


comment on table public.client_brain_v2_records is
  'Canonical, client-scoped Hospitality Client Brain v2 records across Intelligence, Products & Offers, Assets, Brand Guidelines, Sources, and Learnings.';
comment on table public.client_brain_v2_links is
  'Normalized same-client relationships between v2 records, including provenance and commercial relationships.';
comment on table public.client_brain_file_objects is
  'Reusable storage objects. A single binary may support multiple client-scoped Asset or Source records without copying the file.';
comment on table public.client_brain_v2_record_files is
  'Client-scoped semantic assignment of reusable file objects to Client Brain records.';
comment on table public.client_brain_v2_commercial_details is
  'Structured commercial details for Product, Collection, Offer, Experience/Event, and Package records.';
