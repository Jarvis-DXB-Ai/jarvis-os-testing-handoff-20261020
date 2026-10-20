import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoOfficeRooms,demoRoomExit,demoBoundary,demoPointInRoom,demoVisitPath,demoArrivalPlan,demoDeskPoint,demoDeskFootprint} from '../src/components/office/office-demo-floor-plan.mjs';
import {roomPoint,supportExit} from '../src/components/office/office-floor-plan.mjs';
import {officeSharedSpaces,createOfficeSocial,officeVisitPath} from '../src/components/office/office-social.mjs';
const {focusDepartments,supportDepartments}=JSON.parse(readFileSync(new URL('../src/lib/office-stack-plan.json',import.meta.url)));
const rooms=demoOfficeRooms(focusDepartments),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const samples=(points,step=.2)=>points.slice(1).flatMap((b,i)=>{const a=points[i],n=Math.max(1,Math.ceil(distance(a,b)/step));return Array.from({length:n+1},(_,j)=>[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);});
const insideSlab=p=>{const a=Math.atan2(p[0]/36.5,p[1]/42),edge=demoBoundary(a);return Math.hypot(...p)<=Math.hypot(...edge)+.02;};
const seat=(r,d)=>demoDeskPoint(r,d,0,.79);

test('eight connected perimeter suites follow the exact building and allocate area by team size',()=>{
 assert.equal(rooms.length,8);assert.deepEqual(rooms.map(r=>r.capacity),[9,5,5,7,8,4,6,7]);
 for(const r of rooms){assert.ok(r.outer.length>5);assert.ok(r.inner.length>5);assert.ok(r.fronts.length===2);assert.ok(r.polygon.every(insideSlab));
  for(const p of r.outer){const a=Math.atan2(p[0]/36.5,p[1]/42),edge=demoBoundary(a);assert.ok(Math.abs(distance([0,0],edge)-distance([0,0],p)-1.35)<.001);}
 }
 for(let i=1;i<rooms.length;i++){assert.ok(distance(rooms[i-1].outer.at(-1),rooms[i].outer[0])<1e-6);assert.ok(distance(rooms[i-1].inner.at(-1),rooms[i].inner[0])<1e-6);}
 for(const a of rooms)for(const b of rooms)if(a.capacity>b.capacity)assert.ok(a.area>b.area);
 for(let x=-40;x<40;x+=1)for(let z=-45;z<45;z+=1)assert.ok(rooms.filter(r=>demoPointInRoom(r,[x+.123,z+.321],.001)).length<=1);
});
test('every desk/chair footprint and authored fixture fits its actual room with wall clearance',()=>{
 for(const r of rooms){assert.equal(r.desks.length,r.capacity);
  for(const d of r.desks)for(const dx of[-1.125,1.125])for(const dz of[-.9,1.7])assert.ok(demoPointInRoom(r,demoDeskPoint(r,d,dx,dz),.29),r.id+' desk escapes its curved wall');
  for(const f of r.fixtures)for(const dx of[-f.width/2,f.width/2])for(const dz of[-f.depth/2,f.depth/2])assert.ok(demoPointInRoom(r,roomPoint(r,f.x+dx,f.z+dz),.34));
 }
});
test('each seated agent leaves beside its chair through a real doorway without crossing another desk',()=>{
 for(const r of rooms)for(const d of r.desks){const path=demoRoomExit(r,d.x,d.z);
  assert.ok(distance(path.at(-2),r.door)<1e-6);assert.deepEqual(path.at(-1),r.hall);
  for(const p of samples([seat(r,d),...path.slice(0,-2)])){
   assert.ok(demoPointInRoom(r,p,.25),r.id+' aisle outside suite');
   for(const other of r.desks){if(other===d)continue;const origin=roomPoint(r,other.x,other.z),angle=r.angle+other.angle,dx=p[0]-origin[0],dz=p[1]-origin[1],x=Math.cos(angle)*dx-Math.sin(angle)*dz,z=Math.sin(angle)*dx+Math.cos(angle)*dz;assert.ok(Math.abs(x)>1.15||z<-.74||z>.74,r.id+' route crosses another table');assert.ok(Math.abs(x)>.67||z<.16||z>1.54,r.id+' route crosses another chair');}
  }
 }
});
test('complete break routes follow the clear promenade, remain on the slab and avoid all other rooms',()=>{
 const homes=rooms.flatMap(r=>r.desks.map(d=>({room:r,position:seat(r,d),rotation:r.angle,index:0,exit:demoRoomExit(r,d.x,d.z)})));
 const shared=supportDepartments.flatMap(d=>d.roles);for(let i=0;i<shared.length;i++){const a=i/shared.length*Math.PI*2;homes.push({room:null,position:roomPoint({x:Math.sin(a)*7.2,z:Math.cos(a)*7.2,angle:a},0,.79),rotation:a,index:i,exit:supportExit(a)});}
 for(const home of homes)for(const space of officeSharedSpaces)for(const spot of space.spots){const path=demoVisitPath(home,space,spot);assert.deepEqual(path[0],home.position);assert.deepEqual(path.at(-1),spot.position);
  for(const p of samples(path,.4)){assert.ok(insideSlab(p),'path leaves slab');for(const r of rooms)if(r!==home.room)assert.ok(!demoPointInRoom(r,p,.06),'walk cuts through '+r.id);}
 }
});
test('ambient path injection is opt-in and the default production route remains the original function',()=>{
 const home={position:[0,0],rotation:0,index:0,exit:[[11.5,0]]},agent={id:'a',role:'research',available:true,running:false,state:'idle'},homes=new Map([['a',home]]);
 const a=createOfficeSocial(homes),b=createOfficeSocial(homes,{visitPath:officeVisitPath});
 for(const t of[0,20,21,60,120])assert.deepEqual(a.update(t,[agent]),b.update(t,[agent]));
 let calls=0;const custom=createOfficeSocial(homes,{visitPath:(...args)=>{calls++;return demoVisitPath(...args);}});custom.update(21,[agent]);assert.equal(calls,1);
});
test('retained structural columns stay clear of every furniture footprint',()=>{
 for(const r of rooms)for(const f of r.fixtures)for(const x of[-30,30]){
  const a=[-1,1].flatMap(s=>[-1,1].map(t=>roomPoint(r,f.x+s*f.width/2,f.z+t*f.depth/2))),b=[[-.575,-.8],[.575,-.8],[.575,.875],[-.575,.875]].map(p=>[x+p[0],-16+p[1]]),axes=[[1,0],[0,1],[Math.cos(r.angle),-Math.sin(r.angle)],[Math.sin(r.angle),Math.cos(r.angle)]];
  assert.ok(axes.some(axis=>{const ap=a.map(p=>p[0]*axis[0]+p[1]*axis[1]),bp=b.map(p=>p[0]*axis[0]+p[1]*axis[1]);return Math.max(...ap)+.25<Math.min(...bp)||Math.max(...bp)+.25<Math.min(...ap);}),r.id+' furniture overlaps structural column');
 }
});

test('curved reception fixtures and its protected entry aisle fit the same arrival wedge',()=>{
 const plan=demoArrivalPlan(),room={polygon:plan.polygon};
 for(const f of plan.fixtures)for(const x of[-f.width/2,f.width/2])for(const z of[-f.depth/2,f.depth/2])assert.ok(demoPointInRoom(room,roomPoint({x:f.position[0],z:f.position[1],angle:f.angle},x,z),.29),f.kind);
 for(const curve of[plan.counter,plan.waiting])for(const p of samples(curve))assert.ok(demoPointInRoom(room,p,.6));
 for(let z=29.5;z<=42;z+=.25)for(const x of[-1.5,0,1.5]){assert.ok(demoPointInRoom(room,[x,z],.2));for(const r of rooms)assert.ok(!demoPointInRoom(r,[x,z],.001));for(const f of plan.fixtures){const a={x:f.position[0],z:f.position[1],angle:f.angle},dx=x-a.x,dz=z-a.z,lx=Math.cos(a.angle)*dx-Math.sin(a.angle)*dz,lz=Math.sin(a.angle)*dx+Math.cos(a.angle)*dz;assert.ok(Math.abs(lx)>f.width/2+.3||Math.abs(lz)>f.depth/2+.3);}}
});
test('rendered sliding entry leaves and lobby furnishings leave lift-to-checkin-to-office trips clear',()=>{
 const plan=demoArrivalPlan(),room={polygon:plan.polygon},segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
 assert.ok(plan.entry.leaves[1].center-plan.entry.leaves[1].width/2-(plan.entry.leaves[0].center+plan.entry.leaves[0].width/2)>=3.8);
 for(const route of plan.visitorRoutes)for(const p of samples(route,.1)){
  assert.ok(insideSlab(p));assert.ok(rooms.every(r=>!demoPointInRoom(r,p,.02)));
  if(p[1]>29.3)assert.ok(demoPointInRoom(room,p,.25));
  for(const f of plan.fixtures){const dx=p[0]-f.position[0],dz=p[1]-f.position[1],x=Math.cos(f.angle)*dx-Math.sin(f.angle)*dz,z=Math.sin(f.angle)*dx+Math.cos(f.angle)*dz;assert.ok(Math.abs(x)>f.width/2+.29||Math.abs(z)>f.depth/2+.29,f.kind+' blocks visitor');}
  for(const leaf of plan.entry.leaves)assert.ok(Math.abs(p[0]-leaf.center)>leaf.width/2+.29||Math.abs(p[1]-plan.entry.position[1])>leaf.depth/2+.29,'entry glass blocks visitor');
  for(const curve of[plan.counter,plan.waiting,plan.waitingBack])for(let i=0;i<curve.length-1;i++)assert.ok(segmentDistance(p,curve[i],curve[i+1])>(curve===plan.counter?.58:.71),'curved furniture blocks visitor');
 }
 for(let i=0;i<plan.waiting.length;i++)assert.ok(Math.abs(distance(plan.waiting[i],plan.waitingBack[i])-.38)<1e-8);
});

test('organized desk rows retain wider desk and chair spacing with matched seats',()=>{
 for(const r of rooms){assert.equal(r.spacing,3.8);assert.ok(r.desks.every(d=>d.angle===0));const rows=[...new Set(r.desks.map(d=>d.z))].sort((a,b)=>a-b);for(let i=1;i<rows.length;i++)assert.ok(rows[i]-rows[i-1]>=3.8-1e-8);
  for(const d of r.desks){assert.equal(demoDeskFootprint(r,d).length,4);const origin=roomPoint(r,d.x,d.z),s=demoDeskPoint(r,d,0,.79);assert.ok(Math.abs(distance(origin,s)-.79)<1e-8);assert.ok(d.exit.length>=3);}
 }
});
