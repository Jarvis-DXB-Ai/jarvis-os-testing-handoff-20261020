-- Security hardening V1 (safe subset): retain the exact trigger behavior while
-- preventing mutable caller search_path resolution. These trigger functions
-- reference only NEW and pg_catalog.now(), so pg_catalog is sufficient.
alter function public.update_brand_playbooks_updated_at() set search_path = pg_catalog;
alter function public.set_guest_models_updated_at() set search_path = pg_catalog;
alter function public.set_guest_model_relationships_updated_at() set search_path = pg_catalog;
alter function public.set_ai_model_library_updated_at() set search_path = pg_catalog;

-- Blueprint templates are the sole proven anonymous-browser dependency in this
-- set. The active page only reads them. Remove all browser writes while keeping
-- that public read contract explicit and narrow.
alter table public.blueprint_templates enable row level security;
revoke all on table public.blueprint_templates from anon, authenticated;
grant select on table public.blueprint_templates to anon, authenticated;
create policy blueprint_templates_public_read
on public.blueprint_templates for select
to anon, authenticated
using (true);

-- Precise rollback, if required (do not execute unless rolling back this migration):
-- alter function public.update_brand_playbooks_updated_at() reset search_path;
-- alter function public.set_guest_models_updated_at() reset search_path;
-- alter function public.set_guest_model_relationships_updated_at() reset search_path;
-- alter function public.set_ai_model_library_updated_at() reset search_path;
-- drop policy if exists blueprint_templates_public_read on public.blueprint_templates;
-- grant select, insert, update, delete on table public.blueprint_templates to anon, authenticated;
-- alter table public.blueprint_templates disable row level security;
