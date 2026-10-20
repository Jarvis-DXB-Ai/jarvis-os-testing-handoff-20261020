-- Phase 3 corrective migration: permit only the deliberate authorized -> stale
-- invalidation transition after a canonical payload change. New reservations
-- and execution linkage still require a current approved Final Review manifest.

create or replace function public.assert_content_lineage_execution_authorization_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_manifest record;
  v_manifest_target record;
  v_social_target record;
  v_connection record;
  v_execution record;
begin
  select id, content_lineage_item_id, social_content_item_id, manifest_version,
         payload_hash, review_status
    into v_manifest
    from public.content_final_review_manifests
   where client_id = new.client_id and id = new.final_review_manifest_id;

  if not found then
    raise exception 'Final Review manifest is not available for this client.' using errcode = 'P0001';
  end if;

  if v_manifest.content_lineage_item_id <> new.content_lineage_item_id
     or v_manifest.social_content_item_id <> new.social_content_item_id
     or v_manifest.manifest_version <> new.manifest_version
     or v_manifest.payload_hash <> new.manifest_payload_hash then
    raise exception 'Execution authorization must retain the exact manifest lineage, item, version, and payload hash.' using errcode = 'P0001';
  end if;

  if (tg_op = 'INSERT' or (old.authorization_state = 'authorized' and new.authorization_state = 'authorized'))
     and v_manifest.review_status <> 'approved' then
    raise exception 'Execution authorization requires a currently approved Final Review manifest.' using errcode = 'P0001';
  end if;

  select id, social_content_platform_target_id, platform, account_snapshot, scheduled_at
    into v_manifest_target
    from public.content_final_review_manifest_targets
   where client_id = new.client_id
     and id = new.final_review_manifest_target_id
     and final_review_manifest_id = new.final_review_manifest_id;

  if not found then
    raise exception 'Final Review platform target does not belong to the supplied manifest.' using errcode = 'P0001';
  end if;

  if v_manifest_target.social_content_platform_target_id <> new.social_content_platform_target_id
     or v_manifest_target.platform <> new.platform
     or v_manifest_target.scheduled_at is distinct from new.scheduled_at then
    raise exception 'Execution authorization must retain the exact manifest platform target and schedule.' using errcode = 'P0001';
  end if;

  select id, social_content_item_id, platform, selected
    into v_social_target
    from public.social_content_platform_targets
   where client_id = new.client_id and id = new.social_content_platform_target_id;

  if not found or v_social_target.social_content_item_id <> new.social_content_item_id
     or v_social_target.platform <> new.platform or not v_social_target.selected then
    raise exception 'Execution authorization requires the manifest-selected canonical publishing target.' using errcode = 'P0001';
  end if;

  select id, platform, platform_account_id, status
    into v_connection
    from public.social_provider_connections
   where client_id = new.client_id and id = new.provider_connection_id;

  if not found or v_connection.platform <> new.platform
     or v_connection.platform_account_id <> new.provider_account_id then
    raise exception 'Execution authorization provider account does not match its canonical connection.' using errcode = 'P0001';
  end if;

  if coalesce(v_manifest_target.account_snapshot ->> 'connectionId', '') <> new.provider_connection_id::text
     or coalesce(v_manifest_target.account_snapshot ->> 'accountId', '') <> new.provider_account_id then
    raise exception 'Execution authorization provider account does not match the immutable manifest snapshot.' using errcode = 'P0001';
  end if;

  if new.social_provider_execution_id is not null then
    select id, social_content_item_id
      into v_execution
      from public.social_provider_executions
     where client_id = new.client_id and id = new.social_provider_execution_id;
    if not found or v_execution.social_content_item_id <> new.social_content_item_id then
      raise exception 'Provider execution does not belong to the authorized canonical content item.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.assert_content_lineage_execution_authorization_integrity() from public;
