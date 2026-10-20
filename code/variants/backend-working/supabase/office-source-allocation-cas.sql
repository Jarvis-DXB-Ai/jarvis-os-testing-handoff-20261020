-- Standalone owner-only private-pilot SQL; NOT an automatically applied migration.
-- Review and apply as one transaction only after source-activation integration review.
-- Server callers must still verify immutable source files, initialized foundation,
-- authorization, quiescence, and the activation journal/fence. This RPC grants none.
-- Reference: https://supabase.com/docs/guides/database/functions
-- Reference: https://www.postgresql.org/docs/current/explicit-locking.html

CREATE OR REPLACE FUNCTION public.office_cas_source_allocation(
  p_client_id uuid,
  p_activation_id uuid,
  p_expected_content text,
  p_expected_updated_at timestamptz,
  p_next_content text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  allocation public.client_brain_v2_records%ROWTYPE;
  previous_body jsonb;
  next_body jsonb;
  saved_at timestamptz;
BEGIN
  IF p_client_id IS NULL OR p_activation_id IS NULL
    OR p_expected_content IS NULL OR p_expected_updated_at IS NULL
    OR p_next_content IS NULL THEN RETURN false; END IF;

  -- The unique (client_id,stable_key) constraint fixes the target. Waiting writers
  -- re-evaluate the current row after the lock, then compare exact stored bytes.
  SELECT * INTO allocation FROM public.client_brain_v2_records
    WHERE client_id = p_client_id AND stable_key = 'office:audit-pilot'
    FOR UPDATE;
  IF NOT FOUND OR allocation.content IS DISTINCT FROM p_expected_content
    OR allocation.updated_at IS DISTINCT FROM p_expected_updated_at
    OR jsonb_typeof(allocation.metadata) IS DISTINCT FROM 'object'
    THEN RETURN false; END IF;

  BEGIN
    previous_body := allocation.content::jsonb;
    next_body := p_next_content::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN false;
  END;
  IF jsonb_typeof(previous_body) IS DISTINCT FROM 'object'
    OR jsonb_typeof(next_body) IS DISTINCT FROM 'object'
    OR previous_body->>'id' IS DISTINCT FROM p_client_id::text
    OR previous_body->>'clientId' IS DISTINCT FROM p_client_id::text
    OR next_body->>'id' IS DISTINCT FROM p_client_id::text
    OR next_body->>'clientId' IS DISTINCT FROM p_client_id::text
    OR previous_body->>'status' IS DISTINCT FROM 'audit_ready'
    OR next_body->>'status' IS DISTINCT FROM 'audit_ready'
    OR previous_body->>'executionMode' IS DISTINCT FROM 'audit_only'
    OR next_body->>'executionMode' IS DISTINCT FROM 'audit_only'
    OR previous_body->'brandConfirmed' IS DISTINCT FROM 'false'::jsonb
    OR next_body->'brandConfirmed' IS DISTINCT FROM 'false'::jsonb
    OR previous_body->'servicesConfirmed' IS DISTINCT FROM 'false'::jsonb
    OR next_body->'servicesConfirmed' IS DISTINCT FROM 'false'::jsonb
    OR (previous_body - ARRAY['sourceRevision','foundationId','revision'])
       IS DISTINCT FROM (next_body - ARRAY['sourceRevision','foundationId','revision'])
    THEN RETURN false; END IF;

  -- Format checks supplement, rather than replace, server-side digest validation.
  IF jsonb_typeof(previous_body->'sourceRevision') IS DISTINCT FROM 'string'
    OR jsonb_typeof(next_body->'sourceRevision') IS DISTINCT FROM 'string'
    OR jsonb_typeof(previous_body->'revision') IS DISTINCT FROM 'string'
    OR jsonb_typeof(next_body->'revision') IS DISTINCT FROM 'string'
    OR jsonb_typeof(previous_body->'foundationId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(next_body->'foundationId') IS DISTINCT FROM 'string'
    OR coalesce(previous_body->>'sourceRevision','') !~ '^[a-f0-9]{64}$'
    OR coalesce(next_body->>'sourceRevision','') !~ '^[a-f0-9]{64}$'
    OR coalesce(previous_body->>'revision','') !~ '^[a-f0-9]{64}$'
    OR coalesce(next_body->>'revision','') !~ '^[a-f0-9]{64}$'
    OR coalesce(previous_body->>'foundationId','') !~ '^[a-z0-9][a-z0-9-]{0,80}$'
    OR coalesce(next_body->>'foundationId','') !~ '^[a-z0-9][a-z0-9-]{0,80}$'
    OR previous_body->>'sourceRevision' = next_body->>'sourceRevision'
    OR previous_body->>'foundationId' = next_body->>'foundationId'
    OR previous_body->>'revision' = next_body->>'revision'
    THEN RETURN false; END IF;

  -- The existing BEFORE UPDATE version trigger inserts the exact old row once
  -- in this same transaction. Do not duplicate, suppress or replace that trigger.
  -- Its normal touch trigger owns updated_at; clock_timestamp() below can be
  -- overridden by that existing now() contract, so no stronger monotonicity claim.
  UPDATE public.client_brain_v2_records
    SET content = p_next_content,
      metadata = allocation.metadata || jsonb_build_object(
        'source_revision',next_body->>'sourceRevision','source_activation_id',p_activation_id),
      updated_at = clock_timestamp()
    WHERE client_id = p_client_id AND id = allocation.id
      AND stable_key = 'office:audit-pilot'
      AND content = p_expected_content AND updated_at = p_expected_updated_at
    RETURNING updated_at INTO saved_at;
  IF saved_at IS NULL THEN
    RAISE EXCEPTION 'Source allocation write did not preserve its exact locked row';
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.office_cas_source_allocation(uuid,uuid,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.office_cas_source_allocation(uuid,uuid,text,timestamptz,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_cas_source_allocation(uuid,uuid,text,timestamptz,text) TO service_role;
