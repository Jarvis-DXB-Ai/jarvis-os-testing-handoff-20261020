-- Client Brain Logins + Content V1.
-- Secure credentials are deliberately outside client_brain_v2_records and are
-- never available to normal retrieval, prompt assembly, embeddings, or exports.

create table if not exists public.client_secure_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_name text not null,
  custom_service_name text,
  login_url text,
  username text,
  email text,
  secret_ciphertext text,
  account_id text,
  two_factor_enabled boolean not null default false,
  recovery_note text,
  owner_name text,
  notes text,
  last_verified_at timestamptz,
  status text not null default 'active' check (status in ('active', 'needs_review', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(service_name)) > 0)
);

create table if not exists public.client_secure_credential_audit_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  credential_id uuid references public.client_secure_credentials(id) on delete set null,
  event_type text not null check (event_type in ('created', 'updated', 'revealed', 'copied', 'archived', 'deleted', 'verified')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_content_months (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month_start),
  check (date_trunc('month', month_start::timestamp)::date = month_start)
);

create table if not exists public.client_content_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  client_content_month_id uuid not null references public.client_content_months(id) on delete cascade,
  content_type text not null check (content_type in ('feed', 'carousel', 'reel', 'story', 'graphic', 'ai_photography', 'video', 'other')),
  media_type text not null check (media_type in ('image', 'video', 'document', 'other')),
  source text not null check (source in ('historical_upload', 'ai_content', 'social_publishing', 'external_reference')),
  source_reference jsonb not null default '{}'::jsonb,
  storage_bucket text,
  storage_path text,
  file_name text not null,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  final_state text not null default 'final' check (final_state in ('draft', 'final', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((storage_bucket is null and storage_path is null) or (storage_bucket is not null and storage_path is not null))
);

create index if not exists client_secure_credentials_client_idx on public.client_secure_credentials(client_id, status, updated_at desc);
create index if not exists client_secure_credential_audit_client_idx on public.client_secure_credential_audit_events(client_id, created_at desc);
create index if not exists client_content_months_client_month_idx on public.client_content_months(client_id, month_start desc);
create index if not exists client_content_items_month_idx on public.client_content_items(client_content_month_id, final_state, created_at desc);
create index if not exists client_content_items_client_source_idx on public.client_content_items(client_id, source, final_state);

drop trigger if exists touch_client_secure_credentials_updated_at on public.client_secure_credentials;
create trigger touch_client_secure_credentials_updated_at before update on public.client_secure_credentials for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_client_content_months_updated_at on public.client_content_months;
create trigger touch_client_content_months_updated_at before update on public.client_content_months for each row execute function public.touch_social_publishing_updated_at();
drop trigger if exists touch_client_content_items_updated_at on public.client_content_items;
create trigger touch_client_content_items_updated_at before update on public.client_content_items for each row execute function public.touch_social_publishing_updated_at();
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


alter table public.client_secure_credentials enable row level security;
alter table public.client_secure_credential_audit_events enable row level security;
alter table public.client_content_months enable row level security;
alter table public.client_content_items enable row level security;

revoke all on public.client_secure_credentials, public.client_secure_credential_audit_events, public.client_content_months, public.client_content_items from anon, authenticated;
grant all on public.client_secure_credentials, public.client_secure_credential_audit_events, public.client_content_months, public.client_content_items to service_role;
