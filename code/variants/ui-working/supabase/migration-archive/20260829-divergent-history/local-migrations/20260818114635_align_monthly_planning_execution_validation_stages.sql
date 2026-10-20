alter table public.social_monthly_plan_ai_executions
  drop constraint if exists social_monthly_plan_ai_executions_validation_stage_check;

alter table public.social_monthly_plan_ai_executions
  add constraint social_monthly_plan_ai_executions_validation_stage_check
  check (validation_stage = any (array[
    'provider_request',
    'provider_response',
    'tool_output_extracted',
    'schema_validation',
    'item_count_validation',
    'enum_validation',
    'asset_reference_validation',
    'activation_reference_validation',
    'production_capability_validation',
    'date_validation',
    'business_rule_validation',
    'atomic_apply',
    'succeeded'
  ]));
