-- Company Assistant is a future, permission-first Roadmap idea only.
-- This seed does not create an assistant, connect a provider, or authorize data access.

with project_row as (
  select id from public.roadmap_projects where slug = 'jarvis-os'
)
insert into public.roadmap_ideas (
  project_id,
  title,
  description,
  category,
  potential_value,
  complexity,
  status,
  dependency_notes,
  notes,
  metadata
)
select
  project_row.id,
  'Company Assistant',
  'Explore a company-wide assistant that can answer operational questions from explicitly permitted Jarvis knowledge and connected systems.',
  'intelligence',
  'high',
  'high',
  'idea',
  'Requires an explicit permission model, source-level access controls, human review boundaries, auditability, and scoped integrations before any client, staff, finance, CRM, or operational data is available to the assistant.',
  'Future capability only. No assistant, model call, data connection, or autonomous action is enabled by this idea.',
  jsonb_build_object(
    'permission_first', true,
    'future_capability', true,
    'implementation_status', 'not_started',
    'created_by', 'packages_v1_1_staff_asset_scope'
  )
from project_row
on conflict (project_id, lower(title)) do update set
  description = excluded.description,
  category = excluded.category,
  potential_value = excluded.potential_value,
  complexity = excluded.complexity,
  dependency_notes = excluded.dependency_notes,
  notes = excluded.notes,
  metadata = public.roadmap_ideas.metadata || excluded.metadata;
