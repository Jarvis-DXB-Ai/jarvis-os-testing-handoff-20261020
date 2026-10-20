-- Evidence links keep proposed opportunities auditable without promoting them to Client Brain truth.
create table public.client_intelligence_opportunity_evidence (
  opportunity_id uuid not null references public.client_intelligence_opportunities(id) on delete cascade,
  evidence_id uuid not null references public.client_intelligence_evidence(id) on delete cascade,
  primary key (opportunity_id, evidence_id)
);
create index client_intelligence_opportunity_evidence_evidence_idx on public.client_intelligence_opportunity_evidence(evidence_id);
alter table public.client_intelligence_opportunity_evidence enable row level security;
revoke all on public.client_intelligence_opportunity_evidence from anon, authenticated;
grant all on public.client_intelligence_opportunity_evidence to service_role;
