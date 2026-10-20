-- V1.1: legacy Blueprint and Guest Model records are server-only.
-- Browser access now passes through /api/clients/[id]/blueprint and
-- /api/clients/[id]/guest-models, which validate the client/resource scope
-- before using the existing server-side service-role client.

alter table public.blueprint_answers enable row level security;
alter table public.client_blueprints enable row level security;
alter table public.guest_models enable row level security;
alter table public.guest_model_relationships enable row level security;

revoke all privileges on table public.blueprint_answers from anon, authenticated;
revoke all privileges on table public.client_blueprints from anon, authenticated;
revoke all privileges on table public.guest_models from anon, authenticated;
revoke all privileges on table public.guest_model_relationships from anon, authenticated;

-- Explicitly retain the server boundary's service-role access. The key remains
-- server-only; no anon/authenticated policy is intentionally created here.
grant select, insert, update, delete on table public.blueprint_answers to service_role;
grant select, insert, update, delete on table public.client_blueprints to service_role;
grant select, insert, update, delete on table public.guest_models to service_role;
grant select, insert, update, delete on table public.guest_model_relationships to service_role;
