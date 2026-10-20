// Shared authored floor plan: room geometry and ambient routes use the same coordinates.
export const officeRoomPlan = ['social','content','design','web','ads','email','support','finance'].map((id,i)=>({
 id,x:i<4?-21:21,z:-24+(i%4)*16,angle:i<4?Math.PI/2:-Math.PI/2,
 halfWidth:id==='content'?8:6.7,back:id==='content'?-11:-5.5,front:6.8,doorWidth:2.4,
}));
export const circulation={halfWidth:11.5,halfDepth:28};
export const officeCommonsCenters={lounge:[5.8,18],coffee:[0,-20],ideas:[-5.8,18]};
export function sharedOfficeDesk(department,index){
 const side=department==='knowledge'?1:-1,x=side*6+(index%2?1.55:-1.55),z=-4.6+Math.floor(index/2)*3.8;
 return {x,z,exit:[[x,z+1.8],[side*9.3,z+1.8],[side*circulation.halfWidth,z+1.8]]};
}
export function roomPoint(room,x,z){return [room.x+Math.cos(room.angle)*x+Math.sin(room.angle)*z,room.z-Math.sin(room.angle)*x+Math.cos(room.angle)*z];}
export function roomDesk(i,department){if(department==='design')return {x:i<3?(i-1)*3.1:(i-3.5)*4.4,z:i<3?-.6:3};return {x:-3.1+(i%3)*3.1,z:-1.6+Math.floor(i/3)*2.85};}
export function roomExit(room,x,z){const side=x<0?-4.8:4.8;return [[x,z+1.8],[side,z+1.8],[side,6],[0,6],[0,room.front],[0,9.5]].map(([a,b])=>roomPoint(room,a,b));}
export function officeBoundary(a){const s=Math.sin(a),c=Math.cos(a),ripple=1+.026*Math.cos(a*6)+.012*Math.sin(a*3);return [Math.sign(s)*Math.sqrt(Math.abs(s))*33*ripple,Math.sign(c)*Math.sqrt(Math.abs(c))*40*ripple];}
// Real arrival stays inside the existing platform and clear of the side promenades.
export function officeArrivalPlan(){
 const plan={polygon:[[-11,29],[11,29],[11,38.5],[-11,38.5]],outer:[[-11,29],[-11,38.5],[11,38.5],[11,29]],fronts:[[[-11,29],[-2.1,29]],[[2.1,29],[11,29]]],
  entry:{position:[0,29],width:4.2,leaves:[-1,1].map(side=>({side,center:side*3,width:2,depth:.18}))},
  counter:[[-8.7,33.4],[-7.6,32.9],[-6.3,32.7],[-5,32.9],[-3.9,33.4]],
  waiting:[[-4.4,30.9],[-6,30.9],[-7.5,31.2],[-8.6,31.8]],waitingBack:[[-4.4,30.5],[-6,30.5],[-7.7,30.8],[-8.9,31.5]],
  fixtures:[{kind:'receptionDesk',position:[-6.3,35.2],angle:0,width:2.25,depth:2.6},{kind:'lifts',position:[6.4,36.9],angle:Math.PI,width:7.2,depth:2.1},{kind:'waitingTable',position:[-6.3,31.9],angle:0,width:1.3,depth:.75},{kind:'planter',position:[-9.2,30.8],angle:0,width:1.3,depth:1.3}],
  checkin:[-4.6,31.8],visitorRoutes:[[[6.4,35],[0,34],[-4.6,31.8],[0,30],[0,28]]],walkway:[[0,28],[0,29],[0,38.2]]};
 return {...plan,core:arrivalCorePolygon(plan.polygon,plan.fixtures.find(f=>f.kind==='lifts'))};
}
const perimeter=4*(circulation.halfWidth+circulation.halfDepth);
function perimeterPoint(t){let d=((t%perimeter)+perimeter)%perimeter;const {halfWidth:w,halfDepth:h}=circulation;if(d<2*h)return[w,-h+d];d-=2*h;if(d<2*w)return[w-d,h];d-=2*w;if(d<2*h)return[-w,h-d];d-=2*h;return[-w+d,-h];}
function perimeterDistance(p){const {halfWidth:w,halfDepth:h}=circulation;if(Math.abs(p[0])>=w-.01)return p[0]>0?Math.max(0,Math.min(2*h,p[1]+h)):2*h+2*w+Math.max(0,Math.min(2*h,h-p[1]));return p[1]>0?2*h+w-p[0]:4*h+3*w+p[0];}
export function circulationPath(from,to){
 const {halfWidth:w,halfDepth:h}=circulation;
 const project=p=>Math.abs(p[0])>=w-.01?[Math.sign(p[0])*w,Math.max(-h,Math.min(h,p[1]))]:[Math.max(-w,Math.min(w,p[0])),Math.sign(p[1]||1)*h];
 const a=project(from),b=project(to),start=perimeterDistance(a),end=perimeterDistance(b),delta=((end-start+perimeter*1.5)%perimeter)-perimeter/2;
 const corners=[0,2*h,2*h+2*w,4*h+2*w];const distances=[];
 for(const corner of corners)for(const shift of[-perimeter,0,perimeter]){const d=corner+shift-start;if(delta>=0?d>0&&d<delta:d<0&&d>delta)distances.push(d);}
 distances.sort((a,b)=>delta>=0?a-b:b-a);
 return [a,...distances.map(d=>perimeterPoint(start+d)),b];
}
// Support staff leave the workring radially, then join the clear side promenade.
export function supportExit(a){const end=Math.sin(a)>=0?Math.PI/2:Math.PI*1.5,delta=((end-a+Math.PI*3)%(Math.PI*2))-Math.PI,steps=Math.max(1,Math.ceil(Math.abs(delta)/.12));return [[Math.sin(a)*10.5,Math.cos(a)*10.5],...Array.from({length:steps},(_,i)=>{const b=a+delta*(i+1)/steps;return[Math.sin(b)*10.5,Math.cos(b)*10.5];}),[Math.sin(end)*circulation.halfWidth,0]];}

// Clip the lift core to the actual arrival perimeter; its front meets the bank behind its doors.
export function arrivalCorePolygon(polygon,lift){
 const c=Math.cos(lift.angle),s=Math.sin(lift.angle);let p=polygon.map(q=>{const x=q[0]-lift.position[0],z=q[1]-lift.position[1];return[c*x-s*z,s*x+c*z];});
 for(const [axis,sign,limit]of[[0,1,lift.width/2],[0,-1,lift.width/2],[1,1,0]]){const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],da=limit-sign*a[axis],db=limit-sign*b[axis];if(da>=-1e-8)next.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);next.push(a.map((v,k)=>v+(b[k]-v)*t));}}p=next;}
 return p.map(q=>roomPoint({x:lift.position[0],z:lift.position[1],angle:lift.angle},...q));
}
