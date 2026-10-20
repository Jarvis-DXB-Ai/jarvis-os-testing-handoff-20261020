-- V2.2 keeps the creative workspace stateful without making generated or
-- final-library images masquerade as verified Client Brain truth.

alter table public.ai_content_sessions
  add column if not exists active_generation_id uuid references public.ai_content_generations(id) on delete set null;

alter table public.ai_content_session_references
  drop constraint if exists ai_content_session_references_source_type_check;

alter table public.ai_content_session_references
  add constraint ai_content_session_references_source_type_check
  check (source_type in ('client_brain_asset', 'pinterest_inspiration', 'session_upload', 'generated_version', 'content_library'));

create index if not exists ai_content_sessions_active_generation_idx
  on public.ai_content_sessions (active_generation_id)
  where active_generation_id is not null;
