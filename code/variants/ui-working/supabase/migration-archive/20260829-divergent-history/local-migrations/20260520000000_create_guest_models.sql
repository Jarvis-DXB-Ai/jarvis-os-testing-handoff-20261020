create table if not exists public.guest_models (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  ethnicity text,
  age_range text,
  profession text,
  personality text,
  relationship_type text,
  status text,
  do_not_modify boolean default false,
  model_references jsonb default '{}'::jsonb,
  outfit_sets jsonb default '{}'::jsonb,
  accessories jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists guest_models_client_id_idx
  on public.guest_models(client_id);

create or replace function public.set_guest_models_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_guest_models_updated_at on public.guest_models;
create trigger set_guest_models_updated_at
before update on public.guest_models
for each row
execute function public.set_guest_models_updated_at();

grant select, insert, update, delete on public.guest_models to anon, authenticated;
