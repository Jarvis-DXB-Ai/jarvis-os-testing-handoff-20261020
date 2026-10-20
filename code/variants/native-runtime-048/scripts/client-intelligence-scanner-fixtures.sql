-- Scanner fixtures are fully rolled back; no production client intelligence is retained.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); scan_one uuid := gen_random_uuid(); scan_two uuid := gen_random_uuid(); execution uuid := gen_random_uuid(); evidence_id uuid := gen_random_uuid(); truth_id uuid := gen_random_uuid(); claim_id uuid := gen_random_uuid(); bad_budget boolean := false; duplicate_execution boolean := false;
begin
  insert into public.clients (id,name,industry,status,notes) values (a,'QA DemoClientB','Hospitality','active','fixture'), (b,'QA DemoClientC','Hospitality','active','fixture');
  insert into public.client_intelligence_scans (id,client_id,status,source_inputs,request_budget_usd,max_provider_calls,provider_calls_used) values
    (scan_one,a,'partial','{"website":"https://qa.example"}',2,5,0), (scan_two,a,'completed','{"website":"https://qa.example"}',2,5,0);
  update public.client_intelligence_scans set execution_id = execution, max_tavily_calls = 8, max_sonnet_calls = 3, max_sources = 32 where id = scan_one;
  insert into public.client_intelligence_scan_steps (scan_id,step_key,provider,status,attempt_count,input_metadata) values (scan_one,'brand_reputation_audience','tavily','completed',1,'{"max_retries":0}'), (scan_one,'synthesis_foundations','anthropic','completed',1,'{"max_retries":0}'), (scan_one,'competitors_market_social','tavily','failed',1,'{"max_retries":0}');
  begin insert into public.client_intelligence_scans (client_id,execution_id,status) values (a,execution,'authorized'); exception when unique_violation then duplicate_execution := true; end;
  if not duplicate_execution then raise exception 'scan execution idempotency failed'; end if;
  insert into public.client_intelligence_evidence (id,client_id,scan_id,source_type,source_url,source_title,excerpt,source_quality,freshness,metadata) values
    (evidence_id,a,scan_one,'official_website','https://qa.example','Official QA site','Regional Italian dining language','official','current','{}');
  insert into public.client_intelligence_discoveries (scan_id,client_id,area,source_url,source_title,excerpt,classification,admitted,rejection_reason,source_type,source_quality) values
    (scan_one,a,'brand','https://qa.example','Official QA site','Regional Italian dining language','CLIENT_OFFICIAL',true,null,'official_client','tier_1'),
    (scan_one,a,'social','https://instagram.com/unrelated','Unrelated account','Generic profile','AMBIGUOUS',false,'wrong_social_handle','social','tier_3'),
    (scan_one,a,'brand','https://qa-sea.example','DemoClientC','Charter service','RELATED_ENTITY_MISMATCH',false,'related_entity_mismatch','other','tier_3');
  update public.client_intelligence_scans set discovered_result_count = 3, admitted_evidence_count = 1, ambiguous_result_count = 1, rejected_result_count = 1, duplicate_result_count = 0 where id = scan_one;
  insert into public.client_intelligence_public_discrepancies (client_id,scan_id,evidence_id,category,public_value,verified_value,confidence) values
    (a,scan_one,evidence_id,'contact','+00000000000','+00000000000','medium');
  insert into public.client_brain_v2_records (id,client_id,stable_key,top_section,subsection,record_type,title,summary,knowledge_class,status,source_type) values
    (truth_id,a,'qa:no-alcohol','intelligence','operations','rule','Alcohol policy','DemoClientB does not sell alcohol.','operational','current','client_provided');
  insert into public.client_intelligence_claims (id,client_id,scan_id,category,title,claim,interpretation,confidence,confidence_reason,truth_status,change_status,conflict_record_id) values
    (claim_id,a,scan_one,'brand','Heritage-led positioning','Website emphasizes regional Italian cooking.','Heritage-led positioning appears central.','high','Official website wording','strong_external_evidence','new',null),
    (gen_random_uuid(),a,scan_one,'social','Alcohol availability','Cocktail service appears available.','External directory claim only.','medium','Single directory source','needs_confirmation','conflict',truth_id),
    (gen_random_uuid(),a,scan_one,'market','UAE full-service restaurant metric','Market metric applies to UAE full-service restaurants.','Not DemoClientB TAM.','medium','Named geography and scope','strong_external_evidence','new',null);
  insert into public.client_intelligence_claim_evidence (claim_id,evidence_id) values (claim_id,evidence_id);
  insert into public.client_intelligence_competitors (client_id,name,relationship,latest_scan_id,metadata) values (a,'QA Competitor','tracked',scan_one,'{"positioning":"Italian dining"}');
  insert into public.client_intelligence_opportunities (client_id,scan_id,title,observation,hypothesis,confidence,recommended_action,metric_to_watch) values (a,scan_one,'Weekday lunch capture','Competitor lunch activity is observed.','Test clearer weekday lunch communication.','medium','Three-week campaign test','Lunch reservations');
  begin insert into public.client_intelligence_scans (client_id,status,max_provider_calls,provider_calls_used) values (a,'draft',1,2); exception when check_violation then bad_budget := true; end;
  if not bad_budget then raise exception 'budget cap did not reject overrun'; end if;
  if (select count(*) from public.client_intelligence_claims where client_id = b) <> 0 then raise exception 'client isolation failed'; end if;
  if (select count(*) from public.client_intelligence_scans where client_id = a) <> 2 then raise exception 'scan history failed'; end if;
  if (select truth_status from public.client_intelligence_claims where id = claim_id) <> 'strong_external_evidence' then raise exception 'external claim became truth'; end if;
  if (select count(*) from public.client_intelligence_discoveries where scan_id = scan_one and admitted) <> 1 then raise exception 'discovery admission fixture failed'; end if;
  if (select count(*) from public.client_intelligence_discoveries where scan_id = scan_one and classification = 'RELATED_ENTITY_MISMATCH') <> 1 then raise exception 'related entity rejection fixture failed'; end if;
  if (select count(*) from public.client_intelligence_public_discrepancies where scan_id = scan_one and status = 'needs_attention') <> 1 then raise exception 'public discrepancy fixture failed'; end if;
end $$;
select 'client-intelligence-scanner fixtures passed; rolling back' as result;
rollback;
select count(*) as retained_qa_scans from public.client_intelligence_scans where source_inputs->>'website' = 'https://qa.example';
