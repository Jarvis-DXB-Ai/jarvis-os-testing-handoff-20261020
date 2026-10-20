-- Structured official-menu truth for Restaurant Client Brain V2.
-- This is an internal retrieval index, not a public Products workspace. Every
-- row stays tied to the client, the canonical menu record, and the supplied
-- source document that established it.

create table if not exists public.client_brain_v2_menu_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  menu_record_id uuid not null,
  source_record_id uuid not null,
  source_file_object_id uuid references public.client_brain_file_objects(id) on delete set null,
  item_kind text not null default 'item' check (item_kind in ('item', 'offer_component', 'service_rule')),
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}'::text[],
  menu_section text,
  description text,
  price numeric(12,2),
  currency text,
  listed_ingredients text[] not null default '{}'::text[],
  allergens text[] not null default '{}'::text[],
  dietary_markers text[] not null default '{}'::text[],
  notes text,
  raw_source_text text,
  source_page smallint,
  source_document_version text not null,
  source_status text not null default 'current' check (source_status in ('current', 'historical', 'superseded', 'conflicting')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, menu_record_id)
    references public.client_brain_v2_records(client_id, id) on delete cascade,
  foreign key (client_id, source_record_id)
    references public.client_brain_v2_records(client_id, id) on delete cascade,
  unique (client_id, source_record_id, canonical_name, source_page)
);

create index if not exists client_brain_v2_menu_items_lookup_idx
  on public.client_brain_v2_menu_items (client_id, menu_record_id, normalized_name)
  where source_status = 'current';
create index if not exists client_brain_v2_menu_items_source_idx
  on public.client_brain_v2_menu_items (client_id, source_record_id, source_status);
create index if not exists client_brain_v2_menu_items_aliases_idx
  on public.client_brain_v2_menu_items using gin (aliases);

drop trigger if exists touch_client_brain_v2_menu_items on public.client_brain_v2_menu_items;
create trigger touch_client_brain_v2_menu_items
before update on public.client_brain_v2_menu_items
for each row execute function public.touch_client_brain_v2_updated_at();

alter table public.client_brain_v2_menu_items enable row level security;
revoke all on public.client_brain_v2_menu_items from anon, authenticated;

drop policy if exists "service role manages client brain v2 menu items" on public.client_brain_v2_menu_items;
create policy "service role manages client brain v2 menu items"
  on public.client_brain_v2_menu_items
  for all
  to service_role
  using (true)
  with check (true);
