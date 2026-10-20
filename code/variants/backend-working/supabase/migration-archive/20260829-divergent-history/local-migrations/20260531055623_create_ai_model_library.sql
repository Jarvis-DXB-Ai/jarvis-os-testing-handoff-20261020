-- Generic client-scoped AI model library for AI Photography.

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  model_name text not null,
  model_role text,
  age integer,
  gender text,
  nationality text,
  ethnicity_appearance_notes text,
  hair_description text,
  eye_description text,
  skin_tone text,
  body_type text,
  personality text,
  brand_role text,
  approved_usage text,
  restricted_usage text,
  base_prompt text,
  negative_prompt text,
  realism_prompt text,
  quality_prompt text,
  status text not null default 'draft' check (status in ('draft', 'generating', 'review', 'approved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_models_client_id_idx
  on public.ai_models(client_id);

create index if not exists ai_models_client_status_idx
  on public.ai_models(client_id, status);

create table if not exists public.ai_model_assets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_type text not null check (asset_type in ('front_face', 'forty_five_face', 'full_body_front', 'full_body_side', 'outfit', 'lifestyle', 'test_generation')),
  image_url text,
  storage_path text,
  prompt_used text,
  negative_prompt_used text,
  generation_settings jsonb not null default '{}'::jsonb,
  version_number integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_regeneration')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ai_model_assets_client_id_idx
  on public.ai_model_assets(client_id);

create index if not exists ai_model_assets_model_slot_idx
  on public.ai_model_assets(model_id, asset_type, status);

create table if not exists public.ai_model_outfits (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  outfit_name text not null,
  occasion text,
  outfit_description text,
  styling_notes text,
  jewelry_notes text,
  hair_notes text,
  makeup_notes text,
  shoes_notes text,
  prompt_fragment text,
  status text not null default 'draft' check (status in ('draft', 'generating', 'review', 'approved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_model_outfits_client_id_idx
  on public.ai_model_outfits(client_id);

create index if not exists ai_model_outfits_model_status_idx
  on public.ai_model_outfits(model_id, status);

create table if not exists public.ai_model_prompts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  prompt_type text not null check (prompt_type in ('base_reference', 'outfit_generation', 'lifestyle_scene', 'restaurant_campaign')),
  reference_slot text,
  outfit_id uuid references public.ai_model_outfits(id) on delete set null,
  occasion text,
  scene text,
  camera_angle text,
  lighting_style text,
  format text,
  realism_level text,
  final_prompt text not null,
  negative_prompt text,
  generation_settings jsonb not null default '{}'::jsonb,
  status text not null default 'saved' check (status in ('draft', 'saved', 'used', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists ai_model_prompts_client_id_idx
  on public.ai_model_prompts(client_id);

create index if not exists ai_model_prompts_model_created_idx
  on public.ai_model_prompts(model_id, created_at desc);

create or replace function public.set_ai_model_library_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_ai_models_updated_at on public.ai_models;
create trigger set_ai_models_updated_at
before update on public.ai_models
for each row
execute function public.set_ai_model_library_updated_at();

drop trigger if exists set_ai_model_outfits_updated_at on public.ai_model_outfits;
create trigger set_ai_model_outfits_updated_at
before update on public.ai_model_outfits
for each row
execute function public.set_ai_model_library_updated_at();

alter table public.ai_models enable row level security;
alter table public.ai_model_assets enable row level security;
alter table public.ai_model_outfits enable row level security;
alter table public.ai_model_prompts enable row level security;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


grant select, insert, update, delete on public.ai_models to anon, authenticated;
grant select, insert, update, delete on public.ai_model_assets to anon, authenticated;
grant select, insert, update, delete on public.ai_model_outfits to anon, authenticated;
grant select, insert, update, delete on public.ai_model_prompts to anon, authenticated;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

