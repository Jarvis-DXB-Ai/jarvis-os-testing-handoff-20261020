// Offline only: injected GET transport, fake component hooks/DOM, static React rendering.
// No server, browser, database, provider or native process is used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readOfficeJson,readOfficeRecords,officeReadState} from '../src/components/office/office-read-state.mjs';
import {scopedOfficeSnapshot} from '../src/lib/office-client-view.mjs';
import {cooMessageInput,defaultCooCriteria} from '../src/lib/office-coo-message.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../src/components/office/', import.meta.url);
const ok = value => ({ok: true, json: async () => value});
const now = Date.parse('2026-10-16T10:00:00Z');
const board = {status:'connected', agents:[], issues:[], runs:[], checkedAt:new Date(now).toISOString()};
const catalog = {enabled:true, jobs:[]};
const readiness = {checkedAt:new Date(now).toISOString(), canEnqueue:true, message:'Ready'};
const fresh = {now, readiness, boardConnected:true, observedAt:now, catalogReachable:true, recordsObservedAt:now};

test('read freshness expires by actual elapsed time, rejects future/invalid timestamps and requires both sources', () => {
  assert.equal(officeReadState(fresh).canEnqueue, true);
  for (const changes of [{now:now+12000},{catalogReachable:false},{boardConnected:false},{observedAt:now+1},{recordsObservedAt:NaN},
    {readiness:{...readiness,checkedAt:'invalid'}},{readiness:{...readiness,checkedAt:new Date(now+1).toISOString()}},{readiness:{...readiness,canEnqueue:'true'}}]) {
    assert.equal(officeReadState({...fresh,...changes}).canEnqueue, false);
  }
  const aged = {...fresh,now:now+90000,observedAt:now+90000,recordsObservedAt:now+90000};
  assert.equal(officeReadState(aged).readinessFresh, false);
  assert.equal(officeReadState(aged).canEnqueue, false);
  assert.equal(officeReadState({...aged,readiness:{...readiness,checkedAt:new Date(aged.now).toISOString()}}).canEnqueue, true);
});

test('a hung GET aborts once, including a hung JSON body; mutations are never issued or retried', async () => {
  for (const jsonHangs of [false,true]) {
    let calls=0,signal;
    await assert.rejects(readOfficeJson('/fixture',{timeoutMs:5,fetchImpl:async (_,options)=>{
      calls++;signal=options.signal;assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');
      return jsonHangs?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{});
    }}),/timed out/);
    assert.equal(calls,1);assert.equal(signal.aborted,true);
  }
});

test('a successful peer applies before the other GET times out, in either direction', async () => {
  for (const hung of ['/api/office/teams','/api/office/paperclip']) {
    const seen=[];
    const work=readOfficeRecords({timeoutMs:15,fetchImpl:async path=>path===hung?new Promise(()=>{}):ok(path.endsWith('teams')?catalog:board),
      onBoard:()=>seen.push('board'),onCatalog:()=>seen.push('catalog'),onBoardError:()=>seen.push('board-error'),onCatalogError:()=>seen.push('catalog-error')});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(seen,[hung.endsWith('teams')?'board':'catalog']);
    await work;assert.equal(seen.length,2);assert.equal(seen[1],hung.endsWith('teams')?'catalog-error':'board-error');
  }
});

test('failed and malformed catalog reads fail closed; a later successful read restores availability', async () => {
  let current={...fresh};
  const callbacks={onBoard:()=>{},onBoardError:()=>{},onCatalog:()=>{current={...current,catalogReachable:true};},onCatalogError:()=>{current={...current,catalogReachable:false};}};
  for (const response of [{ok:false,json:async()=>({error:'Unavailable'})},ok({jobs:null,enabled:true}),ok({jobs:[],enabled:'true'})]) {
    await readOfficeRecords({...callbacks,fetchImpl:async path=>path.endsWith('teams')?response:ok(board)});
    assert.equal(officeReadState(current).connected,false);assert.equal(officeReadState(current).canEnqueue,false);
  }
  await readOfficeRecords({...callbacks,fetchImpl:async path=>ok(path.endsWith('teams')?catalog:board)});
  assert.equal(officeReadState(current).canEnqueue,true);
});

function compile(name, localRequire=require, globals={}) {
  const source=readFileSync(new URL(name,root),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const compiled={exports:{}};
  runInNewContext(output,{module:compiled,exports:compiled.exports,require:localRequire,...globals},{filename:name});
  return compiled.exports;
}

const {OfficeTaskEvidence}=compile('office-task-evidence.tsx');
const result=pass=>({pass,checks:[{criterion:'Supplied facts',pass,evidence:'Fixture evidence'}],note:pass?'Accepted fixture':'Rejected fixture'});
const review={status:'completed',agentId:'qa-agent',name:'Independent reviewer',runId:'raw-run',issueId:'raw-issue',result:result(true)};
const task={id:'task-fixture',updatedAt:'2026-10-16T10:00:00Z',steps:[{id:'part',responseReceipt:{artifactSha256:'specialist-hash'}}],calls:[{stage:'qa',agentId:'final-reviewer',runId:'final-run',issueId:'final-issue',status:'succeeded'}],
  departmentReports:[{id:'marketing',departmentName:'Marketing',status:'completed',agentId:'head-agent',partsQa:{...review,evidence:{partsSha256:'parts-hash',authorRunsSha256:'author-runs-hash'},rawSha256:'raw-response-hash',resultSha256:'raw-result-hash'},qa:{...review,runId:'package-run',evidence:{headSha256:'head-hash',partsSha256:'package-parts-hash'}}}],
  cooReleaseReview:{...review,runId:'coo-run',evidence:{artifactSha256:'coo-artifact-hash'},rawSha256:'coo-response-hash'},qa:result(true),
  assembly:{sourcePartId:'part',sourceArtifactSha256:'preserved-hash',headReportHashes:[{departmentId:'marketing',sha256:'assembly-head-hash'}]},deliveryHandoff:{state:'confirmed',outputSha256:'final-output-hash',qaIssueId:'final-issue',parentIssueId:'parent-issue'}};

test('actual evidence component renders each saved gate, reviewer/run and artifact binding without claiming revalidation', () => {
  const html=renderToStaticMarkup(React.createElement(OfficeTaskEvidence,{task}));
  for(const text of ['Raw-parts QA','Department package QA','COO release review','Final independent QA','raw-run','package-run','coo-run','final-run','final-reviewer',
    'specialist-hash','parts-hash','author-runs-hash','head-hash','preserved-hash','assembly-head-hash','final-output-hash','final-issue','task-fixture','not a fresh verification']) assert.ok(html.includes(text),text);
});

test('missing evidence and hash-only rejected decisions stay honest, including a failed final call with no parsed QA', () => {
  const missing=renderToStaticMarkup(React.createElement(OfficeTaskEvidence,{task:{id:'empty',steps:[],calls:[],updatedAt:'unknown'}}));
  assert.ok(missing.includes('Unavailable in this saved record'));assert.ok(!missing.includes('Recorded pass'));
  const rejected=renderToStaticMarkup(React.createElement(OfficeTaskEvidence,{task:{...task,cooReleaseReview:{...task.cooReleaseReview,status:'failed',result:result(false)},qa:null,calls:[{stage:'qa',status:'failed',agentId:'failed-reviewer',runId:'failed-final-run'}]}}));
  assert.match(rejected,/COO release review · Recorded rejection/);assert.match(rejected,/Final independent QA · Decision unavailable/);
  assert.ok(rejected.includes('failed-final-run'));assert.ok(rejected.includes('final-output-hash'));
});

// Execute the real command component with controlled hooks; children stay inert.
// This checks event-time expiry and draft/request-ID preservation without a DOM or network.
function commandHarness({fixtureBoard=board,fixtureCatalog=catalog,allowMutation=false}={}) {
  let clock=now,cursor=0,effectCursor=0;
  const slots=[],effects=[],pending=[],intervals=new Set(),timeouts=new Set(),requests=[];
  const draftId='a7604343-92d7-56ec-bf35-b272cac7f8b7';
  const storage=new Map([['jarvis-office-brief-v1',JSON.stringify({version:1,brief:'Preserve this unsent draft',context:'Saved notes',criteria:'Saved criterion',contextRequest:{foundationId:'jarvis-interface',taskType:'internal',mode:'draft'},requestId:draftId})]]);
  let failCatalog=false;
  const fetchImpl=async(path,options={})=>{
    requests.push({path,options});if(options.method==='POST'){if(!allowMutation)throw new Error('Unexpected mutation');return {ok:false,json:async()=>({error:'Fixture conflict: refresh the task'})};}
    if(path==='/api/office/teams'){if(failCatalog)throw new Error('Fixture outage');return ok(fixtureCatalog);}
    if(path==='/api/office/paperclip')return ok(fixtureBoard);
    if(path==='/api/office/readiness')return ok({...readiness,checkedAt:new Date(clock).toISOString()});
    return ok({counts:{documents:0,files:0}});
  };
  const hooks={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},useMemo:fn=>fn(),useCallback:fn=>fn,
    useEffect(fn,deps){const index=effectCursor++,old=effects[index];if(!old||deps.some((v,i)=>v!==old.deps[i]))pending.push(()=>{old?.cleanup?.();effects[index]={deps,cleanup:fn()};});}};
  const jsx=(type,props)=>({type,props:props??{}});
  const stub=new Proxy({},{get:(_,key)=>key});
  const localRequire=path=>{
    if(path==='react')return hooks;if(path==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(path.endsWith('office-read-state.mjs'))return {officeReadState,readOfficeJson:(url)=>readOfficeJson(url,{fetchImpl}),readOfficeRecords:options=>readOfficeRecords({...options,fetchImpl})};
    if(path.endsWith('office-client-view.mjs'))return {scopedOfficeSnapshot,clientOfficeHref:()=>'/office'};
    if(path.endsWith('office-coo-message.mjs'))return {cooMessageInput,defaultCooCriteria};
    if(path.endsWith('office-usage'))return {...stub,useOfficeUsage:()=>({})};
    if(path.endsWith('client-onboarding-chat'))return {...stub,intakeApi:async()=>({clients:[]})};
    if(path.endsWith('office-stack-plan.json'))return {roles:[],executives:[],focusDepartments:[]};
    if(path.endsWith('office-departments'))return {coreRoleIds:new Set(),departmentForRole:()=>null};
    if(path.endsWith('office-observations.mjs'))return {taskProgress:()=>({percent:0}),usedApps:()=>[]};
    if(path==='@/lib/office')return {productionRoster:()=>[]};
    return stub;
  };
  const {OfficeCommandCenter}=compile('office-command-center.tsx',localRequire,{Date:class extends Date{static now(){return clock;}},fetch:fetchImpl,
    setTimeout(fn,ms){const id=setTimeout(()=>{timeouts.delete(id);fn();},ms);timeouts.add(id);return id;},clearTimeout,
    setInterval(fn,ms){const entry={fn,ms};intervals.add(entry);return entry;},clearInterval:id=>intervals.delete(id),queueMicrotask,
    document:{visibilityState:'visible',body:{style:{}},addEventListener(){},removeEventListener(){},getElementById(){return null;}},
    window:{addEventListener(){},removeEventListener(){}},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},crypto:{randomUUID(){throw new Error('Existing request ID must be retained');}}});
  const render=()=>{cursor=0;effectCursor=0;return OfficeCommandCenter({onTest(){},legacyAgents:null});};
  return {render,storage,requests,draftId,setClock:value=>{clock=value;},outage:()=>{failCatalog=true;},recover:()=>{failCatalog=false;},
    async mount(){render();while(pending.length)pending.shift()();await new Promise(resolve=>setTimeout(resolve,5));render();while(pending.length)pending.shift()();},
    async poll(){for(const entry of intervals)if(entry.ms===3000)entry.fn();await new Promise(resolve=>setTimeout(resolve,0));},
    tick(){for(const entry of intervals)if(entry.ms===1000)entry.fn();},
    close(){for(const effect of effects)effect?.cleanup?.();for(const id of timeouts)clearTimeout(id);}};
}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;const children=node.props?.children;for(const child of Array.isArray(children)?children.flat(Infinity):[children]){const found=find(child,predicate);if(found)return found;}return null;}

test('actual composer/feed fail closed across expiry and outage, retain draft/request ID, and recover without a POST', async()=>{
  const h=commandHarness();
  try{
    await h.mount();let tree=h.render();
    const form=find(tree,n=>n.type==='form');const send=find(tree,n=>n.type==='button'&&n.props.type==='submit');
    assert.equal(send.props.disabled,false);
    // Use the old event closure after the clock advances, before any React timer runs.
    h.setClock(now+13000);await form.props.onSubmit({preventDefault(){}});
    assert.equal(h.requests.some(r=>r.options.method==='POST'),false);
    h.tick();tree=h.render();assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
    assert.equal(find(tree,n=>n.type==='OfficeWorkFeed').props.connected,false);
    await h.poll();h.tick();tree=h.render();assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
    h.outage();await h.poll();tree=h.render();assert.equal(find(tree,n=>n.type==='OfficeWorkFeed').props.connected,false);
    assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
    assert.equal(find(tree,n=>n.type==='textarea'&&n.props.id==='coo-brief').props.value,'Preserve this unsent draft');
    const saved=JSON.parse(h.storage.get('jarvis-office-brief-v1'));assert.equal(saved.requestId,h.draftId);assert.equal(saved.context,'Saved notes');
    h.recover();await h.poll();h.tick();tree=h.render();assert.equal(find(tree,n=>n.type==='OfficeWorkFeed').props.connected,true);
    assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
    assert.equal(h.requests.some(r=>r.options.method==='POST'),false);
  }finally{h.close();}
});

test('agency oversight labels a client task and opens its matching client agent instead of the empty agency roster', async()=>{
  const clientTask={id:'client-task',brief:'Client fixture',status:'failed',version:5,calls:[],steps:[{id:'client-part',agentId:'client-agent',name:'Client specialist',status:'completed',assignment:'Client work',dependsOn:[],model:'fixture',output:'Saved fixture'}],departmentReports:[],
    knowledgeContext:{scope:{clientId:'client-1'},foundationId:'client-foundation',foundationRevision:'fixture-hash',mode:'draft',lessonIds:[]}};
  const h=commandHarness({fixtureCatalog:{...catalog,jobs:[clientTask]},fixtureBoard:{...board,agents:[{id:'client-agent',clientId:'client-1',name:'Client specialist',status:'idle',blueprintRoleId:'copy'}]}});
  try{
    await h.mount();let tree=h.render();
    assert.ok(find(tree,n=>n.type==='strong'&&n.props.children==='Client client-1'));
    find(tree,n=>n.type==='button'&&n.props.children==='Open work screen ↗').props.onClick();
    tree=h.render();const chat=find(tree,n=>n.type==='OfficeAgentChat');
    assert.equal(chat.props.agent.id,'client-agent');assert.equal(chat.props.task.id,'client-task');assert.equal(chat.props.clientId,'client-1');
    assert.equal(h.requests.some(r=>r.options.method==='POST'),false);
  }finally{h.close();}
});

test('recovery uses only explicit current server eligibility, exact revision and no retry after a conflict',async()=>{
  const entry={action:'recoverDeliveryHandoff',state:'requires_verification',reasonCode:'native_verification_required',startsRemainingModelWork:false};
  const saved={id:'saved-task',brief:'Saved fixture',status:'failed',updatedAt:'revision-1',version:5,steps:[],calls:[],departmentReports:[],recovery:{expectedUpdatedAt:'revision-1',stopRequested:false,actions:[entry]}};
  for(const change of [{recovery:undefined},{recovery:{...saved.recovery,stopRequested:null}},{recovery:{...saved.recovery,stopRequested:true}},
    {recovery:{...saved.recovery,expectedUpdatedAt:'old-revision'}},{recovery:{...saved.recovery,actions:[{...entry,state:'blocked',reasonCode:'owner_stopped'}]}}]){
    const h=commandHarness({fixtureCatalog:{...catalog,jobs:[{...saved,...change}]}});
    try{await h.mount();const tree=h.render(),button=find(tree,n=>n.type==='button'&&n.props.children==='Check board handoff');assert.ok(!button||button.props.disabled);assert.equal(h.requests.some(r=>r.options.method==='POST'),false);}finally{h.close();}
  }
  const h=commandHarness({fixtureCatalog:{...catalog,jobs:[saved]},allowMutation:true});
  try{
    await h.mount();const button=find(h.render(),n=>n.type==='button'&&n.props.children==='Check board handoff');assert.equal(button.props.disabled,false);
    button.props.onClick();button.props.onClick();await new Promise(resolve=>setTimeout(resolve,5));
    const mutations=h.requests.filter(r=>r.options.method==='POST');assert.equal(mutations.length,1);
    assert.deepEqual(JSON.parse(mutations[0].options.body),{id:'saved-task',action:'recoverDeliveryHandoff',expectedUpdatedAt:'revision-1'});
    assert.equal(find(h.render(),n=>n.type==='textarea'&&n.props.id==='coo-brief').props.value,'Preserve this unsent draft');
    // The event closure must also reject newly stale reads before its next render.
    h.setClock(now+13000);button.props.onClick();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(h.requests.filter(r=>r.options.method==='POST').length,1);
  }finally{h.close();}
});
