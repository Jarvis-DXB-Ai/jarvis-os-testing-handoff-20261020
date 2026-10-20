import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officeRoomPlan,roomPoint,roomDesk,roomExit,officeBoundary,circulation} from '../src/components/office/office-floor-plan.mjs';
import {officeSharedSpaces,officeVisitPath} from '../src/components/office/office-social.mjs';
import fs from 'node:fs';
const departments=JSON.parse(fs.readFileSync(new URL('../src/lib/office-stack-plan.json',import.meta.url))).focusDepartments;
const bounds=room=>{const p=[[-room.halfWidth,room.back],[room.halfWidth,room.front]].map(([x,z])=>roomPoint(room,x,z));return {x0:Math.min(...p.map(p=>p[0])),x1:Math.max(...p.map(p=>p[0])),z0:Math.min(...p.map(p=>p[1])),z1:Math.max(...p.map(p=>p[1]))};};
const inside=(p,b,margin=0)=>p[0]>b.x0-margin&&p[0]<b.x1+margin&&p[1]>b.z0-margin&&p[1]<b.z1+margin;
const sample=path=>path.slice(1).flatMap((b,i)=>{const a=path[i],steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.12);return Array.from({length:steps+1},(_,n)=>[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps]);});
const inverse=(room,p)=>{const dx=p[0]-room.x,dz=p[1]-room.z;return [Math.cos(room.angle)*dx-Math.sin(room.angle)*dz,Math.sin(room.angle)*dx+Math.cos(room.angle)*dz];};
test('eight separate rooms have clear inter-room gaps and inward-facing accessible doors',()=>{
 assert.deepEqual(officeRoomPlan.map(r=>r.id),departments.map(d=>d.id));
 for(const room of officeRoomPlan){const b=bounds(room);assert.ok(b.x0>circulation.halfWidth+2||b.x1<-circulation.halfWidth-2);const door=roomPoint(room,0,room.front);assert.ok(Math.abs(door[0])<Math.abs(room.x));assert.ok(room.doorWidth>=2.4);
 for(const other of officeRoomPlan.filter(r=>r!==room)){const c=bounds(other);assert.ok(b.x1+.6<c.x0||c.x1+.6<b.x0||b.z1+.6<c.z0||c.z1+.6<b.z0,room.id+' overlaps '+other.id);}}
});
test('actual role seats fit rooms and every exit avoids other desks and crosses the doorway',()=>{
 for(const room of officeRoomPlan){const count=departments.find(d=>d.id===room.id).roles.length;
 const desks=Array.from({length:count},(_,i)=>roomDesk(i));
 for(const [i,desk]of desks.entries()){assert.ok(desk.x-.86>-room.halfWidth&&desk.x+.86<room.halfWidth);assert.ok(desk.z-.45>room.back&&desk.z+1.25<room.front-1);
 const exit=roomExit(room,desk.x,desk.z),path=[roomPoint(room,desk.x,desk.z+.79),...exit];assert.deepEqual(exit.at(-2),roomPoint(room,0,room.front));
 for(const p of sample(path)){const q=inverse(room,p);for(const [j,other]of desks.entries())if(i!==j){assert.ok(!inside(q,{x0:other.x-.86,x1:other.x+.86,z0:other.z-.45,z1:other.z+1.25},.25),'exit clips adjacent desk/chair');}if(q[1]>=room.front-.25&&q[1]<=room.front+.25)assert.ok(Math.abs(q[0])<room.doorWidth/2-.3);}}
 }
});
test('all room-to-common routes stay out of other rooms and the COO/support workring',()=>{
 for(const room of officeRoomPlan){const count=departments.find(d=>d.id===room.id).roles.length;for(let i=0;i<count;i++){const desk=roomDesk(i),home={position:roomPoint(room,desk.x,desk.z+.79),exit:roomExit(room,desk.x,desk.z)};
 for(const space of officeSharedSpaces)for(const spot of space.spots)for(const p of sample(officeVisitPath(home,space,spot))){assert.ok(Math.hypot(...p)>9,'route crosses workring');for(const other of officeRoomPlan.filter(r=>r!==room))assert.ok(!inside(p,bounds(other),.25),'route crosses '+other.id);}}}
});
test('room corners are inside the organic floor and commons clear desks and each other',()=>{
 const polygon=Array.from({length:128},(_,i)=>officeBoundary(i/128*Math.PI*2));
 const inFloor=p=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 for(const room of officeRoomPlan)for(const x of[-room.halfWidth,room.halfWidth])for(const z of[room.back,room.front])assert.ok(inFloor(roomPoint(room,x,z)),'room exceeds floor');
 for(const space of officeSharedSpaces){assert.ok(inFloor(space.center));for(const room of officeRoomPlan)assert.ok(!inside(space.center,bounds(room),4));for(const other of officeSharedSpaces.filter(s=>s!==space))assert.ok(Math.hypot(space.center[0]-other.center[0],space.center[1]-other.center[1])>8);}
});
test('support staff join circulation outside the workring and avoid the common furniture',async()=>{
 const {supportExit}=await import('../src/components/office/office-floor-plan.mjs');
 for(let i=0;i<14;i++){const a=i/14*Math.PI*2,exit=supportExit(a),home={position:[Math.sin(a)*7.99,Math.cos(a)*7.99],exit};for(const space of officeSharedSpaces)for(const spot of space.spots){const path=officeVisitPath(home,space,spot);for(const p of sample(path.slice(1,-1))){assert.ok(Math.hypot(...p)>10,'support route enters another work station');for(const room of officeRoomPlan)assert.ok(!inside(p,bounds(room),.25));}}}
});
