-- A special offer menu can be authoritative without becoming an everyday
-- canonical menu. Keep that scope explicit for deterministic asset matching.

alter table public.client_brain_v2_menu_items
  add column if not exists activation_record_id uuid;

alter table public.client_brain_v2_menu_items
  drop constraint if exists client_brain_v2_menu_items_client_id_activation_record_id_fkey;

alter table public.client_brain_v2_menu_items
  add constraint client_brain_v2_menu_items_client_id_activation_record_id_fkey
  foreign key (client_id, activation_record_id)
  references public.client_brain_v2_records(client_id, id)
  on delete set null;

create index if not exists client_brain_v2_menu_items_activation_idx
  on public.client_brain_v2_menu_items (client_id, activation_record_id)
  where activation_record_id is not null;
