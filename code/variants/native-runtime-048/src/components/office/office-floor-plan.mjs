// Shared authored floor plan: room geometry and ambient routes use the same coordinates.
export const officeRoomPlan = ['social','content','design','web','ads','email','support','finance'].map((id,i)=>({
 id,x:i<4?-21:21,z:-24+(i%4)*16,angle:i<4?Math.PI/2:-Math.PI/2,
 halfWidth:id==='content'?8:6.7,back:-5.5,front:6.8,doorWidth:2.4,
}));
export const circulation={halfWidth:11.5,halfDepth:28};
export const officeCommonsCenters={lounge:[5.8,18],coffee:[0,-20],ideas:[-5.8,18]};
export function roomPoint(room,x,z){return [room.x+Math.cos(room.angle)*x+Math.sin(room.angle)*z,room.z-Math.sin(room.angle)*x+Math.cos(room.angle)*z];}
export function roomDesk(i){return {x:-3.1+(i%3)*3.1,z:-1.6+Math.floor(i/3)*2.85};}
export function roomExit(room,x,z){const side=x<0?-4.8:4.8;return [[x,z+1.8],[side,z+1.8],[side,6],[0,6],[0,room.front],[0,9.5]].map(([a,b])=>roomPoint(room,a,b));}
export function officeBoundary(a){const s=Math.sin(a),c=Math.cos(a),ripple=1+.026*Math.cos(a*6)+.012*Math.sin(a*3);return [Math.sign(s)*Math.sqrt(Math.abs(s))*33*ripple,Math.sign(c)*Math.sqrt(Math.abs(c))*40*ripple];}
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
