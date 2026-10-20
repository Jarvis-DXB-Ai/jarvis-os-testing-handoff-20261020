-- AI Content Studio is a client-scoped creative workspace. Its outputs and
-- temporary references intentionally have no Client Brain Asset association.

create table if not exists public.ai_content_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null default 'Untitled generation',
  creative_request text not null default '',
  aspect_ratio text not null default '4:5' check (aspect_ratio in ('1:1', '4:5', '3:2', '2:3', '16:9', '9:16')),
  output_resolution text not null default '4K' check (output_resolution = '4K'),
  correction_history jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_content_session_references (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.ai_content_sessions(id) on delete cascade,
  source_type text not null check (source_type in ('client_brain_asset', 'pinterest_inspiration', 'session_upload', 'generated_version')),
  source_record_id uuid,
  file_object_id uuid references public.client_brain_file_objects(id) on delete restrict,
  display_name text not null,
  role text not null check (role in ('composition_inspiration', 'food_truth', 'drink_truth', 'venue_truth', 'person_identity_truth', 'product_truth', 'wardrobe_styling', 'lighting_mood', 'pose_action', 'other_truth', 'general_reference')),
  reference_order integer not null check (reference_order between 1 and 10),
  inheritance jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_content_generations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid not null references public.ai_content_sessions(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('ready', 'generating', 'generated', 'failed')),
  execution_mode text not null default 'dry_run' check (execution_mode in ('dry_run', 'live')),
  provider text not null default 'google-gemini',
  model text not null default 'gemini-3-pro-image-preview',
  prompt_version text not null,
  aspect_ratio text not null check (aspect_ratio in ('1:1', '4:5', '3:2', '2:3', '16:9', '9:16')),
  output_resolution text not null default '4K' check (output_resolution = '4K'),
  prompt_text text not null default '',
  reference_snapshot jsonb not null default '[]'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  file_object_id uuid references public.client_brain_file_objects(id) on delete restrict,
  failure_reason text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, version)
);

create index if not exists ai_content_sessions_client_updated_idx on public.ai_content_sessions (client_id, updated_at desc);
create index if not exists ai_content_session_references_session_order_idx on public.ai_content_session_references (session_id, reference_order);
create index if not exists ai_content_generations_session_version_idx on public.ai_content_generations (session_id, version desc);

create or replace function public.touch_ai_content_studio_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists touch_ai_content_sessions_updated_at on public.ai_content_sessions;
create trigger touch_ai_content_sessions_updated_at before update on public.ai_content_sessions for each row execute function public.touch_ai_content_studio_updated_at();
drop trigger if exists touch_ai_content_generations_updated_at on public.ai_content_generations;
create trigger touch_ai_content_generations_updated_at before update on public.ai_content_generations for each row execute function public.touch_ai_content_studio_updated_at();

alter table public.ai_content_sessions enable row level security;
alter table public.ai_content_session_references enable row level security;
alter table public.ai_content_generations enable row level security;
revoke all on public.ai_content_sessions, public.ai_content_session_references, public.ai_content_generations from anon, authenticated;
grant all on public.ai_content_sessions, public.ai_content_session_references, public.ai_content_generations to service_role;
revoke execute on function public.touch_ai_content_studio_updated_at() from public, anon, authenticated;
grant execute on function public.touch_ai_content_studio_updated_at() to service_role;
