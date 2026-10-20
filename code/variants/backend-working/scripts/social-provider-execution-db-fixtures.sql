-- Executes entirely inside a transaction and leaves no fixture data behind.
begin;

do $$
declare
  fixture_client_id uuid := gen_random_uuid();
  fixture_month_id uuid;
  fixture_item_id uuid;
  fixture_target_id uuid;
  fixture_connection_id uuid;
  fixture_execution_id uuid;
  fixture_key uuid := gen_random_uuid();
  fixture_caption text := 'Exact final caption. No provider reconstruction.';
begin
  insert into public.clients (id, name, industry, status)
  values (fixture_client_id, '__SOCIAL_PROVIDER_EXECUTION_FIXTURE__', 'fixture', 'archived');

  insert into public.social_content_months (client_id, month_start, timezone)
  values (fixture_client_id, '2026-09-01', 'Asia/Dubai')
  returning id into fixture_month_id;

  insert into public.social_content_items (
    client_id, social_content_month_id, source, content_kind, format, status,
    scheduled_date, scheduled_time, final_caption, caption_approved_at
  ) values (
    fixture_client_id, fixture_month_id, 'manual_upload', 'feed', 'feed', 'Approved',
    '2026-09-12', '19:30', fixture_caption, now()
  ) returning id into fixture_item_id;

  insert into public.social_content_platform_targets (client_id, social_content_item_id, platform, selected, status)
  values (fixture_client_id, fixture_item_id, 'instagram', true, 'Approved')
  returning id into fixture_target_id;

  insert into public.social_provider_connections (
    client_id, provider, platform, platform_account_id, provider_connection_id,
    account_name, handle, status, capabilities, provider_metadata
  ) values (
    fixture_client_id, 'zernio', 'instagram', 'fixture-account-id', 'fixture-connection-id',
    'Fixture account', '@fixture', 'connected', '{}'::jsonb, '{}'::jsonb
  ) returning id into fixture_connection_id;

  insert into public.social_provider_executions (
    client_id, social_content_item_id, provider, idempotency_key,
    publishing_payload_version, status, scheduled_for_local, scheduled_for_utc, timezone,
    final_caption_snapshot, media_snapshot, target_snapshot
  ) values (
    fixture_client_id, fixture_item_id, 'zernio', fixture_key,
    7, 'pending', '2026-09-12 19:30:00', '2026-09-12 15:30:00+00', 'Asia/Dubai',
    fixture_caption,
    jsonb_build_array(jsonb_build_object('id', 'media-1', 'sha256', 'fixture-media-hash')),
    jsonb_build_array(jsonb_build_object('id', fixture_target_id, 'platform', 'instagram'))
  ) returning id into fixture_execution_id;

  insert into public.social_provider_execution_targets (
    social_provider_execution_id, social_content_platform_target_id, client_id,
    provider_connection_id, platform, provider_account_id, status
  ) values (
    fixture_execution_id, fixture_target_id, fixture_client_id,
    fixture_connection_id, 'instagram', 'fixture-account-id', 'pending'
  );

  if not exists (
    select 1 from public.social_provider_executions
    where id = fixture_execution_id
      and final_caption_snapshot = fixture_caption
      and media_snapshot = jsonb_build_array(jsonb_build_object('id', 'media-1', 'sha256', 'fixture-media-hash'))
      and target_snapshot = jsonb_build_array(jsonb_build_object('id', fixture_target_id, 'platform', 'instagram'))
      and timezone = 'Asia/Dubai'
      and scheduled_for_utc = '2026-09-12 15:30:00+00'::timestamptz
      and status = 'pending'
  ) then
    raise exception 'execution snapshot parity or timezone fixture failed';
  end if;

  update public.social_provider_executions
  set status = 'recovery_required', dispatch_attempt_count = 1,
      recovery_poll_count = 1, last_recovery_polled_at = now()
  where id = fixture_execution_id;

  if not exists (select 1 from public.social_provider_executions where id = fixture_execution_id and status = 'recovery_required' and dispatch_attempt_count = 1 and recovery_poll_count = 1) then
    raise exception 'recovery-required execution fixture failed';
  end if;

  begin
    insert into public.social_provider_executions (
      client_id, social_content_item_id, provider, idempotency_key,
      publishing_payload_version, status, scheduled_for_local, scheduled_for_utc, timezone,
      final_caption_snapshot, media_snapshot, target_snapshot
    ) values (
      fixture_client_id, fixture_item_id, 'zernio', fixture_key,
      8, 'pending', '2026-09-13 19:30:00', '2026-09-13 15:30:00+00', 'Asia/Dubai',
      fixture_caption, '[]'::jsonb, '[]'::jsonb
    );
    raise exception 'duplicate execution idempotency key was accepted';
  exception when unique_violation then
    null;
  end;

  if not exists (
    select 1 from public.social_provider_execution_targets
    where social_provider_execution_id = fixture_execution_id
      and platform = 'instagram'
      and provider_account_id = 'fixture-account-id'
  ) then
    raise exception 'per-platform execution target fixture failed';
  end if;
end $$;

select
  has_table_privilege('anon', 'public.social_provider_executions', 'select') as anon_select_denied,
  has_table_privilege('authenticated', 'public.social_provider_executions', 'select') as authenticated_select_denied,
  has_table_privilege('service_role', 'public.social_provider_executions', 'select') as service_role_select_available,
  has_table_privilege('service_role', 'public.social_provider_executions', 'insert') as service_role_insert_available,
  (select relrowsecurity from pg_class where oid = 'public.social_provider_executions'::regclass) as execution_rls_enabled,
  (select relrowsecurity from pg_class where oid = 'public.social_provider_execution_targets'::regclass) as target_rls_enabled,
  (select relrowsecurity from pg_class where oid = 'public.social_provider_webhook_events'::regclass) as webhook_rls_enabled;

rollback;
