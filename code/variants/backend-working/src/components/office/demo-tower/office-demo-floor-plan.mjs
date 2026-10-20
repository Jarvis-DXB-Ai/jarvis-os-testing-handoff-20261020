import {roomPoint,arrivalCorePolygon} from './office-floor-plan.mjs';

const TAU=Math.PI*2;
export const demoPromenade={x:16,z:27};
const inner={x:18,z:29},arrivalAngle=.62;
const polar=(r,a)=>[r.x*Math.sin(a),r.z*Math.cos(a)];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function demoBoundary(a){const s=1+.09*Math.cos(4*a)+.035*Math.sin(3*a);return[Math.sin(a)*36.5*s,Math.cos(a)*42*s];}
const facade=a=>{const p=demoBoundary(a),scale=1-1.35/Math.hypot(...p);return p.map(v=>v*scale);};
const arc=(from,to,fn,step=.045)=>{const steps=Math.max(1,Math.ceil((to-from)/step));return Array.from({length:steps+1},(_,i)=>fn(from+(to-from)*i/steps));};
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0))/2;
function promenadePoint(a){return polar(demoPromenade,a);}

const sector=(a,b)=>[...arc(a,b,facade),...arc(a,b,t=>polar(inner,t)).reverse()];
const local=(room,p)=>{const dx=p[0]-room.x,dz=p[1]-room.z;return[Math.cos(room.angle)*dx-Math.sin(room.angle)*dz,Math.sin(room.angle)*dx+Math.cos(room.angle)*dz];};
function inside(polygon,p,margin=0){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
 if(d<1e-7)return margin===0;if(margin>0&&d<margin)return false;
 }return hit;}
export function demoPointInRoom(room,point,margin=0){return inside(room.polygon,point,margin);}
const deskLocal=(desk,x,z)=>[desk.x+Math.cos(desk.angle)*x+Math.sin(desk.angle)*z,desk.z-Math.sin(desk.angle)*x+Math.cos(desk.angle)*z];
const deskInverse=(desk,p)=>{const x=p[0]-desk.x,z=p[1]-desk.z;return[Math.cos(desk.angle)*x-Math.sin(desk.angle)*z,Math.sin(desk.angle)*x+Math.cos(desk.angle)*z];};
export function demoDeskPoint(room,desk,x,z){return roomPoint(room,...deskLocal(desk,x,z));}
export function demoDeskFootprint(room,desk){return corners(0,.4,2.25,2.6).map(p=>demoDeskPoint(room,desk,...p));}
const localExit=(room,desk)=>desk.exit??room.desks.find(d=>Math.abs(d.x-desk.x)<1e-7&&Math.abs(d.z-desk.z)<1e-7)?.exit??[];
const corners=(x,z,w,d)=>[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[a+x,b+z]);
const sampleLine=(a,b,fn)=>{const steps=Math.max(1,Math.ceil(distance(a,b)/.08));for(let i=0;i<=steps;i++)if(!fn([a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps]))return false;return true;};
const separated=(a,b,padding=0)=>[a,b].some(poly=>poly.some((p,i)=>{const q=poly[(i+1)%poly.length],axis=[q[1]-p[1],p[0]-q[0]],length=Math.hypot(...axis),ap=a.map(v=>(v[0]*axis[0]+v[1]*axis[1])/length),bp=b.map(v=>(v[0]*axis[0]+v[1]*axis[1])/length);return Math.max(...ap)+padding<Math.min(...bp)||Math.max(...bp)+padding<Math.min(...ap);}));
function crosses(a,b,box){let lo=0,hi=1;for(let i=0;i<2;i++){const delta=b[i]-a[i],min=box[i],max=box[i+2];if(Math.abs(delta)<1e-10){if(a[i]<min||a[i]>max)return false;}else{let x=(min-a[i])/delta,y=(max-a[i])/delta;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}}return true;}
function routeExit(room,desk,polygon,desks){
 const goal=[0,room.front-.75],step=.4,rects=desks.flatMap(other=>{const pad=other===desk?.3:.33;return[{desk:other,box:[-.86-pad,-.45-pad,.86+pad,.45+pad]},...(other===desk?[]:[{desk:other,box:[-.71,.12,.71,1.58]}])];});
 if(room.id==='content'){for(let i=0;i<desks.length;i++)for(let j=i+1;j<desks.length;j++){const a=desks[i],b=desks[j],w=Math.abs(a.x-b.x)-1.72;if(Math.abs(a.z-b.z)<.001&&Math.abs(a.x-b.x)<3.5&&w>0){rects.push({desk:{x:(a.x+b.x)/2,z:a.z-.1,angle:0},box:[-w/2-.33,-.275-.33,w/2+.33,.275+.33]});}}}
 const valid=p=>inside(polygon,p,.34)&&rects.every(r=>{const q=deskInverse(r.desk,p);return q[0]<r.box[0]||q[0]>r.box[2]||q[1]<r.box[1]||q[1]>r.box[3];});
 const clear=(a,b)=>sampleLine(a,b,p=>inside(polygon,p,.34))&&rects.every(r=>!crosses(deskInverse(r.desk,a),deskInverse(r.desk,b),r.box));
 const seat=deskLocal(desk,0,.79);
 for(const side of[Math.sign(desk.x||1),-Math.sign(desk.x||1)]){
  const start=deskLocal(desk,side*1.05,.79);if(!valid(start)||!clear(seat,start))continue;
  const heap=[],scores=new Map(),previous=new Map(),points=new Map();
  const push=node=>{heap.push(node);let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(heap[parent].total<=node.total)break;heap[i]=heap[parent];i=parent;}heap[i]=node;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let next=i*2+1;if(next+1<heap.length&&heap[next+1].total<heap[next].total)next++;if(heap[next].total>=last.total)break;heap[i]=heap[next];i=next;}heap[i]=last;}return first;};
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const x=Math.round(start[0]/step)+dx,z=Math.round(start[1]/step)+dz,p=[x*step,z*step],key=x+','+z;if(!valid(p)||!clear(start,p))continue;const cost=distance(start,p);scores.set(key,cost);points.set(key,p);push({x,z,key,cost,total:cost+distance(p,goal)});}
  let found=null,visits=0;
  while(heap.length&&visits++<6000){const node=pop();if(node.cost!==scores.get(node.key))continue;const p=points.get(node.key);if(distance(p,goal)<step*1.4&&clear(p,goal)){found=node.key;break;}
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz)continue;const x=node.x+dx,z=node.z+dz,key=x+','+z,q=[x*step,z*step],cost=node.cost+Math.hypot(dx,dz)*step;if(cost>=(scores.get(key)??Infinity)||!valid(q)||!clear(p,q))continue;scores.set(key,cost);previous.set(key,node.key);points.set(key,q);push({x,z,key,cost,total:cost+distance(q,goal)});}
  }
  if(found){const nodes=[];for(let key=found;key;key=previous.get(key))nodes.push(points.get(key));const path=[start,...nodes.reverse(),goal],simple=[start];let i=0;while(i<path.length-1){let next=path.length-1;while(next>i+1&&!clear(path[i],path[next]))next--;simple.push(path[next]);i=next;}return[...simple,[0,room.front]];}
 }
 return null;
}
function furnish(room){
 const polygon=room.polygon.map(p=>local(room,p));
 for(const columns of(room.capacity<=4?[2,3]:[3,4,2]))for(const spacing of(room.id==='content'?[2.9,3.1,3.3]:[3.8,3.6,3.4]))for(const rowDepth of(room.id==='content'?[3.8,4.1,4.4]:[4.4,4.1,3.8]))for(const retreat of(room.id==='content'?[2.8,3.0,3.4]:[3.4,3.9,4.4,5])){
  const rows=Math.ceil(room.capacity/columns);room.columns=columns;room.spacing=spacing;
  const desks=Array.from({length:room.capacity},(_,i)=>({x:['design','content'].includes(room.id)&&i>=columns?(i-columns-(room.capacity-columns-1)/2)*spacing:(i%columns-(columns-1)/2)*spacing,z:room.front-retreat-(rows-1-Math.floor(i/columns))*rowDepth,angle:0,pod:'row-'+Math.floor(i/columns)}));
  const footprints=desks.map(d=>corners(0,.4,2.25,2.6).map(p=>deskLocal(d,...p)));
  if(!footprints.every((p,i)=>p.every(q=>inside(polygon,q,.34))&&footprints.every((other,j)=>i===j||separated(p,other,.08))))continue;
  const routes=desks.map(d=>routeExit(room,d,polygon,desks));if(routes.some(p=>!p))continue;
  desks.forEach((d,i)=>d.exit=routes[i]);room.desks=desks;return;
 }
 throw Error('Demo room does not safely fit its complete organized desk plan: '+room.id);
}

// Rooms occupy the real scalloped perimeter. Sector area, not a box width, follows headcount.
export function demoOfficeRooms(departments){
 const capacities=departments.map(d=>new Set([d.headRoleId,d.qaRoleId,...d.roles]).size),weights=capacities.map((n,i)=>departments[i].id==='content'?12.5:n+2),totalWeight=weights.reduce((a,b)=>a+b,0),total=area(sector(arrivalAngle,TAU-arrivalAngle));
 let start=arrivalAngle;
 return departments.map((department,index)=>{
  const target=total*weights[index]/totalWeight;let lo=start,hi=TAU-arrivalAngle;
  for(let n=0;n<35;n++){const mid=(lo+hi)/2;if(area(sector(start,mid))<target)lo=mid;else hi=mid;}
  const end=index===departments.length-1?TAU-arrivalAngle:(lo+hi)/2,middle=(start+end)/2,out=facade(middle),door=polar(inner,middle),center=out.map((v,i)=>(v+door[i])/2),angle=Math.atan2(door[0]-out[0],door[1]-out[1]),depth=distance(out,door);
  const room={id:department.id,capacity:capacities[index],x:center[0],z:center[1],angle,halfWidth:0,back:-depth/2,front:depth/2,doorWidth:2.4,start,end,middle,polygon:sector(start,end),outer:arc(start,end,facade),inner:arc(start,end,t=>polar(inner,t)),door,hall:polar(demoPromenade,middle),doorAngle:Math.atan2(inner.z*Math.sin(middle),inner.x*Math.cos(middle)),area:0,desks:[],columns:3,spacing:3.2};
  const gap=room.doorWidth/2/Math.hypot(inner.x*Math.cos(middle),inner.z*Math.sin(middle));room.fronts=[arc(start,middle-gap,t=>polar(inner,t)),arc(middle+gap,end,t=>polar(inner,t))];
  if(room.id==='content')room.productionExpansion={beforeArea:area(room.polygon),beforeFront:room.front,innerXBefore:inner.x,innerXAfter:inner.x,promenadeXAtSuite:demoPromenade.x};
  room.area=area(room.polygon);room.halfWidth=Math.max(...room.polygon.map(p=>Math.abs(local(room,p)[0])));furnish(room);
  room.fixtures=[];const poly=room.polygon.map(p=>local(room,p));
  const add=(kind,x,z,width,depth)=>{const footprint=corners(x,z,width,depth);if(!footprint.every(p=>inside(poly,p,.35)))return;const overlapsDesk=room.desks.some(d=>!separated(footprint,corners(0,.4,2.25,2.6).map(p=>deskLocal(d,...p)),.25));if(overlapsDesk||room.fixtures.some(f=>Math.abs(f.x-x)<(f.width+width)/2+.25&&Math.abs(f.z-z)<(f.depth+depth)/2+.25))return;const overlapsPath=room.desks.some(d=>{const path=localExit(room,d);return path.slice(1).some((p,i)=>!sampleLine(path[i],p,q=>Math.abs(q[0]-x)>width/2+.35||Math.abs(q[1]-z)>depth/2+.35));});if(!overlapsPath)room.fixtures.push({kind,x,z,width,depth});};
  if(room.id==='design'){for(const width of[8.8,8,7.2,6.4,5.6])for(const x of[0,-.6,.6,-1.2,1.2])for(const setback of[2.6,3,3.4,4]){if(!room.fixtures.some(f=>f.kind==='materialReview'))add('materialReview',x,room.back+setback,width,1.6);}if(!room.fixtures.some(f=>f.kind==='materialReview'))for(let z=room.back+1.5;z<room.front-2;z+=.6)for(let x=-room.halfWidth+1;x<room.halfWidth-1;x+=.6)if(!room.fixtures.some(f=>f.kind==='materialReview'))add('materialReview',x,z,5.6,1.05);if(!room.fixtures.some(f=>f.kind==='materialReview'))throw Error('Design material-review joinery does not safely fit');}
  else{add('storage',0,room.back+1.6,3.3,room.id==='finance'?1.2:.7);if(depth>15)add('meeting',0,room.back+4.8,3.8,3.6);}
  if(room.id!=='design'&&!room.fixtures.some(f=>f.kind==='meeting')){for(const side of[-1,1])for(const z of[room.back+5,0,room.front-4]){if(room.fixtures.some(f=>f.kind==='meeting'))break;add('meeting',side*((room.columns-1)*room.spacing/2+4.1),z,3.8,3.6);}}
  if(room.id==='finance'&&!room.fixtures.some(f=>['meeting','storage'].includes(f.kind))){for(const side of[-1,1]){if(room.fixtures.some(f=>f.kind==='activityBench'))break;add('activityBench',side*room.halfWidth*.55,room.back+2.1,3.1,1.2);}}
  for(const side of[-1,1])add('planter',side*(room.halfWidth*.64),room.back+2,.9,.9);
  // The Content rear half is a reserved production zone, not a meeting-table bay.
  if(room.id==='content')room.fixtures=[];
  start=end;return room;
 });
}
export function demoRoomDesk(room,index){return room.desks[index];}
export function demoRoomExit(room,x,z){return [...localExit(room,{x,z}).map(p=>roomPoint(room,...p)),room.hall];}
export function demoPromenadePoint(a){return promenadePoint(a);}
export function demoCirculationPath(from,to){
 const angle=p=>Math.atan2(p[0]/demoPromenade.x,p[1]/demoPromenade.z),a=angle(from),b=angle(to),delta=((b-a+Math.PI*3)%TAU)-Math.PI,steps=Math.max(1,Math.ceil(Math.abs(delta)/.055));
 return Array.from({length:steps+1},(_,i)=>promenadePoint(a+delta*i/steps));
}
export function demoVisitPath(home,space,spot){
 const exit=home.exit?.length?home.exit:[],entry=exit.at(-1)??home.position,portal=space.id==='coffee'?[3,-23]:space.portal;
 return[home.position,...exit,...demoCirculationPath(entry,portal),portal,...(space.id==='coffee'?[[3,-18]]:[]),spot.position].filter((p,i,all)=>i===0||distance(p,all[i-1])>.01);
}

export function demoArrivalPlan(){
 const between=(a,t)=>{const p=polar(inner,a),q=facade(a);return p.map((v,i)=>v+(q[i]-v)*t);},outer=arc(-arrivalAngle,arrivalAngle,facade),innerArc=arc(-arrivalAngle,arrivalAngle,a=>polar(inner,a)),polygon=[...outer,...innerArc.reverse()],entryWidth=4,gap=entryWidth/2/inner.x;
 const frame=(kind,a,t,width,depth)=>{const p=between(a,t),out=facade(a),inward=polar(inner,a),angle=Math.atan2(inward[0]-out[0],inward[1]-out[1]);return{kind,position:p,angle,width,depth};};
 const fixtures=[frame('receptionDesk',-.29,.68,2.25,2.6),frame('lifts',.29,.74,7.2,2.1),frame('waitingTable',-.44,.46,1.75,1),frame('planter',-.52,.55,1.3,1.3),frame('planter',.54,.67,1.3,1.3)];
 for(const f of fixtures){const room={x:f.position[0],z:f.position[1],angle:f.angle};if(!corners(0,0,f.width,f.depth).every(p=>inside(polygon,roomPoint(room,...p),.3)))throw Error('Arrival fixture does not fit curved floor: '+f.kind);}
 const desk=fixtures.find(f=>f.kind==='receptionDesk');desk.angle+=Math.PI;
 const counter=arc(-.365,-.215,a=>between(a,.52),.025),center=counter[Math.floor(counter.length/2)],r=Math.hypot(...center),checkin=center.map(v=>v*(1-.95/r)),lift=fixtures.find(f=>f.kind==='lifts'),visitorRoutes=[-1.75,1.75].map(x=>[roomPoint({x:lift.position[0],z:lift.position[1],angle:lift.angle},x,1.5),[0,34],checkin,[0,32],[0,inner.z],[0,inner.z-2]]);
 const waiting=arc(-.5,-.34,a=>between(a,.28),.025),waitingBack=waiting.map(p=>{const r=Math.hypot(...p);return p.map(v=>v*(1-.38/r));});
 return{polygon,outer,core:arrivalCorePolygon(polygon,lift),fronts:[arc(-arrivalAngle,-gap,a=>polar(inner,a)),arc(gap,arrivalAngle,a=>polar(inner,a))],entry:{position:[0,inner.z],width:entryWidth,leaves:[-1,1].map(side=>({side,center:side*(entryWidth/2+.9),width:entryWidth/2-.08,depth:.18}))},counter,waiting,waitingBack,fixtures,checkin,visitorRoutes,walkway:[[0,inner.z-2],[0,inner.z],[0,42]]};
}
