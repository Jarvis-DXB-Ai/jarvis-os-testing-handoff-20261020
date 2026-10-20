-- The Codex CLI execution mode is available only in isolated local Office.
alter table public.office_team_jobs drop constraint office_team_jobs_execution_mode_check;
alter table public.office_team_jobs add constraint office_team_jobs_execution_mode_check
  check (execution_mode in ('fixture', 'anthropic', 'codex_cli'));
