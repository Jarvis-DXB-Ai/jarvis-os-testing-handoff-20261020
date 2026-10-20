import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localAppEnvironment, localTestConfig } from './isolated-home-config.mjs';

// Idempotent, synthetic Office roster for the loopback preview only.
const keys = localTestConfig();
assert.equal(localAppEnvironment(keys).JARVIS_ISOLATED_TEST, '1');
const db = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const departments = [
  ['f59297a0-ca80-513a-8539-5430ad2fd628', 'office-demo-strategy', 'DEMO Strategy', 'Test strategic planning and source checks.'],
  ['e1d151ba-701c-5914-8528-40dc81bc31c7', 'office-demo-creative', 'DEMO Creative', 'Test copy and visual briefs.'],
  ['51e50c54-a6f1-50b7-a992-78d88bdd1b22', 'office-demo-growth', 'DEMO Growth', 'Test audience and performance research.'],
  ['da2443ac-298b-5db3-a722-849845ff4c62', 'office-demo-quality', 'DEMO Quality', 'Test independent review.'],
];
const roles = [
  ['23427350-4eb6-5957-8e3d-a53d1cac249f', 0, 'DEMO Brand Strategist', 'Brand strategist', 'Turn the brief and approved facts into positioning and content pillars.', 'Positioning statement, target audience and three content pillars.'],
  ['5927bfcc-9862-5a50-b368-e6f4fd7c736c', 1, 'DEMO Content Planner', 'Content planner', 'Arrange a practical sequence of social concepts for a week.', 'Seven-day content calendar with format, hook and objective.'],
  ['bcbe6e5b-0aec-5fac-b4df-87d94f5739a6', 1, 'DEMO Copywriter', 'Copywriter', 'Draft on-brand copy from verified inputs.', 'Five concise post captions with calls to action.'],
  ['f222601e-4e84-5c4f-a102-bd9ce42591ac', 1, 'DEMO Visual Director', 'Visual director', 'Specify a coherent visual direction without generating assets.', 'Shot list, art direction and reference requirements.'],
  ['0060ec37-a0a0-5d54-ba6f-3232bea649a7', 2, 'DEMO Research Analyst', 'Research analyst', 'Identify evidence gaps and test assumptions.', 'Evidence map, unknowns and questions for validation.'],
  ['f3a40e92-835e-5eb9-a761-accbbab6e53a', 3, 'DEMO Quality Reviewer', 'Quality reviewer', 'Inspect draft material for unsupported claims and scope drift.', 'QA checklist, factual risks and approval exceptions.'],
];

const deptResult = await db.from('agent_departments').upsert(departments.map(([id, slug, name, purpose], sort_order) => ({ id, slug, name, purpose, sort_order: 100 + sort_order, is_future: false })), { onConflict: 'id' });
assert.ifError(deptResult.error);
const agentResult = await db.from('agents').upsert(roles.map(([id, , name, role]) => ({ id, agent_name: name, agent_type: 'office-demo', status: 'active', description: `${role} for local Office workflow testing.`, capabilities: [], default_model: null, metadata: { synthetic_office_demo: true } })), { onConflict: 'id' });
assert.ifError(agentResult.error);
const profileResult = await db.from('agent_organization_profiles').upsert(roles.map(([agent_id, deptIndex, , role_title, purpose, output], sort_order) => ({
  agent_id, department_id: departments[deptIndex][0], role_title, operational_status: 'experimental', purpose,
  responsibilities: [output], boundaries: ['Draft only. Do not publish, contact anyone or invent client facts.'],
  input_requirements: ['User brief', 'Approved client facts when available'], output_responsibilities: [output],
  context_access: ['Current client scope only'], approval_requirements: 'Owner reviews before use.', sort_order,
})), { onConflict: 'agent_id' });
assert.ifError(profileResult.error);
console.log(`Seeded ${roles.length} synthetic Office specialists in the isolated local database. No production records were touched.`);
