-- Synthetic records only. Run through start-isolated-home.mjs's local guard.
insert into public.clients (id,name,industry,status) values
('a7604343-92d7-56ec-bf35-b272cac7f8b7','TEST Alpha Studio','Synthetic QA','active'),
('c8aef456-9613-5dd2-9a9e-2207708a7338','TEST Beta Studio','Synthetic QA','active')
on conflict (id) do nothing;
insert into public.roadmap_projects (id,slug,name) values
('64318790-4907-53cb-ad3f-7b547855c242','jarvis-os','TEST Jarvis Roadmap')
on conflict (id) do nothing;
insert into public.roadmap_phases (id,project_id,slug,name,release_status) values
('4f871043-0c72-533f-9186-8a26502782e1','64318790-4907-53cb-ad3f-7b547855c242','test-phase','TEST Phase','active')
on conflict (id) do nothing;
insert into public.jarvis_finance_settings (id) values ('mc-studios') on conflict (id) do nothing;
