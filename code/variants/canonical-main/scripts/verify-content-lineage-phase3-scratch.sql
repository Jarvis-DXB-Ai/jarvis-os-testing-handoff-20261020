-- Isolated PostgreSQL fixture for Phase 3. Run only after the baseline, Phase 1,
-- Phase 2, and verify-content-lineage-phase2-scratch.sql in a disposable DB.

update public.social_content_platform_targets
set selected = true
where id = 'ea6b546d-3316-57b9-960a-4fadc945a9c7';

insert into public.social_provider_connections (id, client_id, provider, platform, platform_account_id, provider_connection_id, account_name, handle, status)
values ('67087938-058f-5d72-8ce0-b3ce53bd4b43', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'zernio', 'instagram', 'fixture-account', 'fixture-zernio-connection', 'Fixture account', '@fixture', 'connected');

insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash, approved_by, approved_at)
values ('abfffec8-dbda-55d0-9f84-df77f87e4e45', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 5, 'approved', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"storagePath":"fixture/replacement.jpg"}', 'Replacement caption', '[{"platformTargetId":"ea6b546d-3316-57b9-960a-4fadc945a9c7","platform":"instagram","account":{"connectionId":"67087938-058f-5d72-8ce0-b3ce53bd4b43","accountId":"fixture-account"}}]', '{"scheduledAt":"2026-09-12T16:00:00Z"}', '{}', 'fixture-v5', 'Fixture reviewer', now());

insert into public.content_final_review_manifest_targets (id, client_id, final_review_manifest_id, social_content_platform_target_id, platform, account_snapshot, scheduled_at)
values ('1d15f79c-1575-52ef-85a7-aa868fde1dfa', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', 'instagram', '{"connectionId":"67087938-058f-5d72-8ce0-b3ce53bd4b43","accountId":"fixture-account"}', '2026-09-12T16:00:00Z');

insert into public.content_lineage_publishing_handoffs (id, client_id, content_lineage_item_id, final_review_manifest_id, social_content_item_id)
values ('d406ddd8-36af-5779-94af-1023dcfea5fe', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', 'f135b6a7-88e8-538b-83ad-84c3897c5330');

insert into public.content_lineage_execution_authorizations (id, client_id, content_lineage_item_id, final_review_manifest_id, final_review_manifest_target_id, social_content_item_id, social_content_platform_target_id, idempotency_key, manifest_version, manifest_payload_hash, platform, provider_connection_id, provider_account_id, scheduled_at, authorization_mode)
values ('41eeafb2-ef62-5d7f-ad15-90b2a5dc968e', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', '1d15f79c-1575-52ef-85a7-aa868fde1dfa', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', '0c631fbb-01c0-5f3e-8aff-237126e90402', 5, 'fixture-v5', 'instagram', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'fixture-account', '2026-09-12T16:00:00Z', 'dry_run');

do $$
begin
  begin
    insert into public.content_lineage_execution_authorizations (client_id, content_lineage_item_id, final_review_manifest_id, final_review_manifest_target_id, social_content_item_id, social_content_platform_target_id, idempotency_key, manifest_version, manifest_payload_hash, platform, provider_connection_id, provider_account_id, scheduled_at, authorization_mode)
    values ('a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', '1d15f79c-1575-52ef-85a7-aa868fde1dfa', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', gen_random_uuid(), 5, 'fixture-v5', 'instagram', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'fixture-account', '2026-09-12T16:00:00Z', 'dry_run');
    raise exception 'Expected duplicate exact manifest target rejection.';
  exception when unique_violation then
    raise notice 'duplicate exact manifest target rejected as expected';
  end;
  begin
    insert into public.content_lineage_execution_authorizations (client_id, content_lineage_item_id, final_review_manifest_id, final_review_manifest_target_id, social_content_item_id, social_content_platform_target_id, idempotency_key, manifest_version, manifest_payload_hash, platform, provider_connection_id, provider_account_id, scheduled_at, authorization_mode)
    values ('a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', '1d15f79c-1575-52ef-85a7-aa868fde1dfa', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', gen_random_uuid(), 5, 'fixture-v5', 'instagram', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'fixture-account', '2026-09-12T16:00:00Z', 'live');
    raise exception 'Expected live authorization without named human rejection.';
  exception when check_violation then
    raise notice 'unnamed live authorization rejected as expected';
  end;
  begin
    insert into public.content_lineage_execution_authorizations (client_id, content_lineage_item_id, final_review_manifest_id, final_review_manifest_target_id, social_content_item_id, social_content_platform_target_id, idempotency_key, manifest_version, manifest_payload_hash, platform, provider_connection_id, provider_account_id, scheduled_at, authorization_mode)
    values ('c8aef456-9613-5dd2-9a9e-2207708a7338', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'abfffec8-dbda-55d0-9f84-df77f87e4e45', '1d15f79c-1575-52ef-85a7-aa868fde1dfa', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', gen_random_uuid(), 5, 'fixture-v5', 'instagram', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'fixture-account', '2026-09-12T16:00:00Z', 'dry_run');
    raise exception 'Expected cross-client authorization rejection.';
  exception when raise_exception then
    raise notice 'cross-client authorization rejected as expected';
  end;
end;
$$;

insert into public.social_provider_executions (id, client_id, social_content_item_id, provider, idempotency_key, publishing_payload_version, status, scheduled_for_local, scheduled_for_utc, timezone, final_caption_snapshot, media_snapshot, target_snapshot)
values ('d271acb3-987a-5228-806d-f44bb108d40e', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'zernio', '112ffdee-b6fc-5202-acd9-136ce6e7b817', 1, 'scheduled', '2026-09-12T20:00:00', '2026-09-12T16:00:00Z', 'Asia/Dubai', 'Replacement caption', '[{"id":"media-1"}]', '[{"targetId":"ea6b546d-3316-57b9-960a-4fadc945a9c7","platform":"instagram"}]');

insert into public.social_provider_execution_targets (id, social_provider_execution_id, social_content_platform_target_id, client_id, provider_connection_id, platform, provider_account_id, status, external_post_id)
values ('49e527a9-d7e9-5f1b-a293-8b61cd989af1', 'd271acb3-987a-5228-806d-f44bb108d40e', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'instagram', 'fixture-account', 'scheduled', 'fixture-post');

update public.content_lineage_execution_authorizations
set social_provider_execution_id = 'd271acb3-987a-5228-806d-f44bb108d40e', authorization_state = 'consumed', consumed_at = now()
where id = '41eeafb2-ef62-5d7f-ad15-90b2a5dc968e';

do $$
begin
  if exists (select 1 from public.social_provider_execution_targets where id = '49e527a9-d7e9-5f1b-a293-8b61cd989af1' and status = 'published') then
    raise exception 'Scheduled execution was falsely represented as published.';
  end if;
  raise notice 'scheduled is not published as expected';
end;
$$;

update public.social_provider_execution_targets
set status = 'published', published_at = '2026-09-12T16:05:00Z', publication_evidence = '{"source":"fixture_webhook","provider_post_id":"fixture-post"}'
where id = '49e527a9-d7e9-5f1b-a293-8b61cd989af1';

insert into public.social_performance_snapshots (id, client_id, provider, platform, provider_account_id, period_key, period_start, period_end)
values ('ea54a01e-c219-58a6-959f-5ec091fab65a', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'zernio', 'instagram', 'fixture-account', 'current_30d', '2026-09-01', '2026-09-30');

insert into public.social_performance_post_observations (id, snapshot_id, client_id, provider, platform, provider_post_id, post_type, observed_at, social_provider_execution_id, social_provider_execution_target_id)
values
  ('2dad8f0e-1d30-51fe-84e2-5d40f78710f6', 'ea54a01e-c219-58a6-959f-5ec091fab65a', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'zernio', 'instagram', 'fixture-post', 'feed', now(), 'd271acb3-987a-5228-806d-f44bb108d40e', '49e527a9-d7e9-5f1b-a293-8b61cd989af1'),
  ('10eba85b-a2a2-54ef-b1d8-2dc3e8d8e141', 'ea54a01e-c219-58a6-959f-5ec091fab65a', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'zernio', 'instagram', 'unmatched-provider-post', 'feed', now(), null, null);

do $$
begin
  if not exists (select 1 from public.social_performance_post_observations where id = '2dad8f0e-1d30-51fe-84e2-5d40f78710f6' and social_provider_execution_target_id = '49e527a9-d7e9-5f1b-a293-8b61cd989af1') then
    raise exception 'Exact provider post observation did not retain its deterministic execution target linkage.';
  end if;
  if exists (select 1 from public.social_performance_post_observations where id = '10eba85b-a2a2-54ef-b1d8-2dc3e8d8e141' and social_provider_execution_target_id is not null) then
    raise exception 'Unmatched observation was linked without an explicit canonical identity.';
  end if;
  raise notice 'deterministic observation linked and unmatched observation left unlinked as expected';
end;
$$;

insert into public.social_provider_webhook_events (id, provider, provider_event_id, event_type, social_provider_execution_id)
values ('31fddfa9-ed05-5a07-a8f6-1614082844c0', 'zernio', 'fixture-webhook-event', 'post.published', 'd271acb3-987a-5228-806d-f44bb108d40e');

do $$
begin
  begin
    insert into public.social_provider_webhook_events (provider, provider_event_id, event_type)
    values ('zernio', 'fixture-webhook-event', 'post.published');
    raise exception 'Expected duplicate webhook event rejection.';
  exception when unique_violation then
    raise notice 'duplicate webhook event rejected as expected';
  end;
end;
$$;

insert into public.content_final_review_manifests (id, client_id, content_lineage_item_id, operating_cycle_id, manifest_version, review_status, media_attachment_id, caption_attachment_id, social_content_item_id, media_snapshot, caption_snapshot, target_snapshot, schedule_snapshot, plan_snapshot, payload_hash, approved_by, approved_at)
values ('c59108cf-a0f6-5035-992c-42fee1df1d25', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', '94c54566-66ed-5b65-9b10-a819a972b148', 6, 'approved', '62d31d37-2ac2-5d7c-bbba-b44420bb66e7', '11f92f29-7496-5461-a188-c291e96f742b', 'f135b6a7-88e8-538b-83ad-84c3897c5330', '{"storagePath":"fixture/replacement.jpg"}', 'Replacement caption', '[{"platformTargetId":"a76e130d-6a07-53ef-b4b9-dd767a497748","platform":"instagram","account":{"connectionId":"67087938-058f-5d72-8ce0-b3ce53bd4b43","accountId":"fixture-account"}}]', '{"scheduledAt":"2026-09-12T16:00:00Z"}', '{}', 'fixture-v6', 'Fixture reviewer', now());

insert into public.content_final_review_manifest_targets (id, client_id, final_review_manifest_id, social_content_platform_target_id, platform, account_snapshot, scheduled_at)
values ('a76e130d-6a07-53ef-b4b9-dd767a497748', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', 'c59108cf-a0f6-5035-992c-42fee1df1d25', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', 'instagram', '{"connectionId":"67087938-058f-5d72-8ce0-b3ce53bd4b43","accountId":"fixture-account"}', '2026-09-12T16:00:00Z');

insert into public.content_lineage_publishing_handoffs (id, client_id, content_lineage_item_id, final_review_manifest_id, social_content_item_id)
values ('ec0b1032-c9d0-5fcc-a047-e604277b1a2b', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'c59108cf-a0f6-5035-992c-42fee1df1d25', 'f135b6a7-88e8-538b-83ad-84c3897c5330');

insert into public.content_lineage_execution_authorizations (id, client_id, content_lineage_item_id, final_review_manifest_id, final_review_manifest_target_id, social_content_item_id, social_content_platform_target_id, idempotency_key, manifest_version, manifest_payload_hash, platform, provider_connection_id, provider_account_id, scheduled_at, authorization_mode)
values ('ac90c98f-c87a-5208-944a-7672628b03de', 'a7604343-92d7-56ec-bf35-b272cac7f8b7', '016cf6c5-a920-59f0-ac7a-f550d53a670f', 'c59108cf-a0f6-5035-992c-42fee1df1d25', 'a76e130d-6a07-53ef-b4b9-dd767a497748', 'f135b6a7-88e8-538b-83ad-84c3897c5330', 'ea6b546d-3316-57b9-960a-4fadc945a9c7', 'f905379a-bd49-518c-9603-0b7c0c3bfb25', 6, 'fixture-v6', 'instagram', '67087938-058f-5d72-8ce0-b3ce53bd4b43', 'fixture-account', '2026-09-12T16:00:00Z', 'dry_run');

update public.social_content_items
set scheduled_time = '20:30', scheduled_at = '2026-09-12T16:30:00Z'
where id = 'f135b6a7-88e8-538b-83ad-84c3897c5330';

do $$
begin
  if (select authorization_state from public.content_lineage_execution_authorizations where id = '41eeafb2-ef62-5d7f-ad15-90b2a5dc968e') <> 'consumed' then
    raise exception 'Consumed execution authorization was not retained.';
  end if;
  if (select review_status from public.content_final_review_manifests where id = 'c59108cf-a0f6-5035-992c-42fee1df1d25') <> 'stale'
     or (select authorization_state from public.content_lineage_execution_authorizations where id = 'ac90c98f-c87a-5208-944a-7672628b03de') <> 'stale' then
    raise exception 'Canonical payload change did not stale the unused execution authorization.';
  end if;
  raise notice 'publication target and consumed authorization retained as expected';
end;
$$;
