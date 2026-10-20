
-- Public export: original data/backfill payload omitted; schema/function definitions retained.


drop policy if exists guest_models_storage_select on storage.objects;
create policy guest_models_storage_select
on storage.objects for select
to anon, authenticated
using (bucket_id = 'guest-models');

drop policy if exists guest_models_storage_insert on storage.objects;
create policy guest_models_storage_insert
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'guest-models');

drop policy if exists guest_models_storage_update on storage.objects;
create policy guest_models_storage_update
on storage.objects for update
to anon, authenticated
using (bucket_id = 'guest-models')
with check (bucket_id = 'guest-models');

drop policy if exists guest_models_storage_delete on storage.objects;
create policy guest_models_storage_delete
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'guest-models');

create table if not exists public.guest_model_relationships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  model_id uuid not null references public.guest_models(id) on delete cascade,
  related_model_id uuid not null references public.guest_models(id) on delete cascade,
  relationship_type text,
  relationship_strength text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint guest_model_relationships_not_self check (model_id <> related_model_id)
);

create index if not exists guest_model_relationships_client_model_idx
  on public.guest_model_relationships(client_id, model_id);

create index if not exists guest_model_relationships_related_model_idx
  on public.guest_model_relationships(related_model_id);

create or replace function public.set_guest_model_relationships_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_guest_model_relationships_updated_at on public.guest_model_relationships;
create trigger set_guest_model_relationships_updated_at
before update on public.guest_model_relationships
for each row
execute function public.set_guest_model_relationships_updated_at();

grant select, insert, update, delete on public.guest_model_relationships to anon, authenticated;
