import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {officeCanTakeBreak,officeSharedSpaces,officeVisitPath,createOfficeSocial,officeSocialPacing} from '../src/components/office/office-social.mjs';
import {createOfficeCommonSpaces} from '../src/components/office/office-common-spaces.ts';
import {createOfficeAvatar} from '../src/components/office/office-avatar.ts';

const idle={fresh:true,status:'idle',state:'idle',running:false,assigned:false,role:'copy'};
const agents=Array.from({length:10},(_,i)=>({id:'registered-'+i,role:'copy',state:'idle',running:false,available:true}));
const homes=new Map(agents.map((a,i)=>[a.id,{position:[10+i*.1,-7],rotation:0,index:i,exit:[[10,-6],[9,-5]]}]));
const fixture=()=>createOfficeSocial(homes);
const vertices=root=>{root.updateMatrixWorld(true);const result=[];root.traverse(o=>result.push(...o.matrixWorld.elements));return result;};
function release(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}

test('only confirmed idle and unassigned specialists can take an ambient break',()=>{
 assert.equal(officeCanTakeBreak(idle),true);assert.equal(officeCanTakeBreak({...idle,state:'completed'}),true);
 for(const override of [{fresh:false},{status:'running'},{state:'unknown'},{state:'queued'},{state:'error'},{state:'needs_review'},{running:true},{assigned:true},{role:'coo'}])assert.equal(officeCanTakeBreak({...idle,...override}),false,JSON.stringify(override));
});
test('a single eligible visitor starts after a quiet introduction and pauses without starting more',()=>{
 const social=fixture();assert.equal(social.update(0,agents,true,false).poses.size,0);assert.equal(social.update(19,agents).poses.size,0);
 const result=social.update(20,agents);assert.equal(result.poses.size,1);
 const later=social.update(24,agents);assert.equal(later.poses.size,1);assert.deepEqual(social.update(24,agents,true,false),later);
 assert.ok(later.activity.every(a=>agents.some(agent=>a.agentId===agent.id)));
 const busy=agents.map(a=>({...a,running:true}));assert.equal(social.update(25,busy).poses.size,0);
 assert.equal(fixture().update(20,agents.map(a=>({...a,available:false}))).poses.size,0);
});
test('visits remain sparse across a long day, with quiet intervals between different agents',()=>{
 const social=fixture();let prior=null,lastEnd=null,visitors=new Set();
 for(let time=0;time<=1200;time+=.25){const frame=social.update(time,agents);assert.ok(frame.poses.size<=officeSocialPacing.maxVisitors);assert.ok(frame.activity.filter(a=>['walking','returning'].includes(a.phase)).length<=1);
  const id=frame.activity[0]?.agentId??null;if(prior&&!id)lastEnd=time;if(!prior&&id&&lastEnd!==null)assert.ok(time-lastEnd>=officeSocialPacing.betweenVisits);if(id)visitors.add(id);prior=id;
 }
 assert.ok(visitors.size>2,'visits should rotate rather than permanently disable ambience');
});
test('assignment and disabled visits immediately clear social poses; movement includes sitting and return',()=>{
 const social=fixture();let sawRest=false,sawReturn=false;
 for(let time=0;time<=180;time+=.5){const result=social.update(time,agents);sawRest ||=result.activity.some(a=>a.phase==='relaxing');sawReturn ||=result.activity.some(a=>a.phase==='returning');for(const pose of result.poses.values())assert.ok(pose.position.every(Number.isFinite));}
 assert.ok(sawRest);assert.ok(sawReturn);
 const reassigned=social.update(180,agents.map(a=>({...a,available:false})));assert.equal(reassigned.poses.size,0);assert.equal(reassigned.activity.length,0);
 social.update(220,agents);assert.equal(social.update(221,agents,false).poses.size,0);
});
test('routes follow exits and a circulation ring, reach the seat and have no central-hub crossings',()=>{
 for(const space of officeSharedSpaces)for(const spot of space.spots){const home=homes.values().next().value,path=officeVisitPath(home,space,spot);assert.deepEqual(path[0],home.position);assert.deepEqual(path.slice(1,3),home.exit);assert.deepEqual(path.at(-1),spot.position);for(let i=1;i<path.length;i++)for(let n=0;n<=20;n++){const t=n/20,x=path[i-1][0]*(1-t)+path[i][0]*t,z=path[i-1][1]*(1-t)+path[i][1]*t;assert.ok(Math.hypot(x,z/.79)>6,'path enters COO pavilion');}}
});
test('all three spaces are native pickable geometry and their ambient motion freezes at the same clock',t=>{
 const commons=createOfficeCommonSpaces();t.after(()=>release(commons.root));
 assert.equal(commons.root.children.filter(o=>o.name.startsWith('Common area /')).length,3);assert.ok(commons.root.getObjectByName('Shared board game'));assert.ok(commons.pickables.length>70);
 assert.ok(commons.pickables.every(o=>officeSharedSpaces.some(s=>s.id===o.userData.spaceId)));commons.root.traverse(o=>assert.equal(o.userData.agentId,undefined));
 commons.update(3);const before=vertices(commons.root);commons.update(4);const after=vertices(commons.root);assert.notDeepEqual(before,after);commons.update(4);assert.deepEqual(vertices(commons.root),after);
});
test('articulated avatar walks, sits and gestures deterministically without retaining a cup or head tilt',t=>{
 const avatar=createOfficeAvatar(2);t.after(()=>release(avatar.root));avatar.pose('walk',5,null,false);const walking=vertices(avatar.root);avatar.pose('sit',5,'sip',false);assert.notDeepEqual(vertices(avatar.root),walking);avatar.pose('sit',5,'sip',false);const seated=vertices(avatar.root);avatar.pose('sit',5,'sip',false);assert.deepEqual(vertices(avatar.root),seated);avatar.pose('desk',5,null,false);const desk=vertices(avatar.root);avatar.pose('sit',7,'sip',false);avatar.pose('desk',5,null,false);assert.deepEqual(vertices(avatar.root),desk);assert.ok(desk.every(Number.isFinite));
});

test('relocated furniture seats match the actual ambient destinations',t=>{
 const commons=createOfficeCommonSpaces();t.after(()=>release(commons.root));commons.root.updateMatrixWorld(true);
 for(const space of officeSharedSpaces){const group=commons.root.getObjectByName('Common area / '+space.id);for(const spot of space.spots){assert.ok(group.children.some(child=>child instanceof T.Group&&child.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(spot.position[0],0,spot.position[1]))<.001)||space.id==='coffee','walking endpoint misses relocated chair');}}
});
