-- An explicitly finalized AI Studio version is Content, not Client Brain truth.
-- Reuse its existing file object/storage path; do not create a second binary.
alter table public.client_content_items
  add column if not exists source_session_id uuid references public.ai_content_sessions(id) on delete restrict,
  add column if not exists source_generation_id uuid references public.ai_content_generations(id) on delete restrict,
  add column if not exists source_file_object_id uuid references public.client_brain_file_objects(id) on delete restrict;

create unique index if not exists client_content_items_ai_final_unique
  on public.client_content_items (client_id, client_content_month_id, source_generation_id, content_type)
  where source = 'ai_content' and final_state <> 'archived' and source_generation_id is not null;

create index if not exists client_content_items_ai_generation_idx
  on public.client_content_items (client_id, source_generation_id)
  where source_generation_id is not null;
