-- System-level commercial product catalog. This remains separate from client
-- contracts and Finance ledger entries: it describes what MC Studios offers.

create table if not exists public.commercial_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 160),
  catalog_type text not null check (catalog_type in ('package', 'addon', 'enterprise')),
  family text,
  summary text not null check (char_length(summary) between 8 and 1000),
  price_amount numeric(12, 2) check (price_amount is null or price_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  billing_unit text not null default 'month' check (billing_unit in ('month', 'video', 'custom')),
  pricing_model text not null check (pricing_model in ('fixed', 'working', 'calculated', 'custom')),
  minimum_commitment_months integer check (minimum_commitment_months is null or minimum_commitment_months >= 0),
  requires_standard boolean not null default false,
  max_eligible boolean not null default false,
  service_state text not null check (service_state in ('available', 'hybrid', 'planned')),
  availability_note text,
  scope_notes text,
  includes jsonb not null default '[]'::jsonb check (jsonb_typeof(includes) = 'array'),
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  exclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_product_relationships (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.commercial_products(id) on delete cascade,
  related_product_id uuid not null references public.commercial_products(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('requires', 'enhances', 'replaces', 'excludes')),
  note text,
  created_at timestamptz not null default now(),
  check (product_id <> related_product_id),
  unique (product_id, related_product_id, relationship_type)
);

create table if not exists public.commercial_product_roadmap_phases (
  product_id uuid not null references public.commercial_products(id) on delete cascade,
  roadmap_phase_id uuid not null references public.roadmap_phases(id) on delete cascade,
  relationship_type text not null default 'supports' check (relationship_type in ('supports', 'candidate_for')),
  created_at timestamptz not null default now(),
  primary key (product_id, roadmap_phase_id, relationship_type)
);

create table if not exists public.commercial_recommended_combinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 160),
  description text not null check (char_length(description) between 8 and 1000),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_recommended_combination_items (
  combination_id uuid not null references public.commercial_recommended_combinations(id) on delete cascade,
  product_id uuid not null references public.commercial_products(id) on delete cascade,
  position integer not null default 0,
  primary key (combination_id, product_id)
);

create index if not exists commercial_products_browse_idx on public.commercial_products(active, catalog_type, family, position, name);
create index if not exists commercial_product_relationships_product_idx on public.commercial_product_relationships(product_id);
create index if not exists commercial_product_relationships_related_idx on public.commercial_product_relationships(related_product_id);
create index if not exists commercial_product_roadmap_phases_phase_idx on public.commercial_product_roadmap_phases(roadmap_phase_id);

create or replace function public.commercial_catalog_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commercial_products_set_updated_at on public.commercial_products;
create trigger commercial_products_set_updated_at before update on public.commercial_products
for each row execute function public.commercial_catalog_set_updated_at();

drop trigger if exists commercial_recommended_combinations_set_updated_at on public.commercial_recommended_combinations;
create trigger commercial_recommended_combinations_set_updated_at before update on public.commercial_recommended_combinations
for each row execute function public.commercial_catalog_set_updated_at();

alter table public.commercial_products enable row level security;
alter table public.commercial_product_relationships enable row level security;
alter table public.commercial_product_roadmap_phases enable row level security;
alter table public.commercial_recommended_combinations enable row level security;
alter table public.commercial_recommended_combination_items enable row level security;

revoke all on public.commercial_products, public.commercial_product_relationships, public.commercial_product_roadmap_phases, public.commercial_recommended_combinations, public.commercial_recommended_combination_items from anon, authenticated;
grant all on public.commercial_products, public.commercial_product_relationships, public.commercial_product_roadmap_phases, public.commercial_recommended_combinations, public.commercial_recommended_combination_items to service_role;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

