import {officeCommonsCenters,circulationPath} from './office-floor-plan.mjs';
// Ambient-only locations. No task, message, model or backend state is created.
const authoredSpaces = [
 {id:'lounge',name:'Sky lounge',description:'A quiet place to sit, chat and look across the cloud sea.',center:[8,15],portal:[7,10.5],spots:[{position:[6.8,16.7],rotation:-.615,posture:'sit',gesture:'talk'},{position:[9.2,16.7],rotation:.615,posture:'sit',gesture:'sip'}]},
 {id:'coffee',name:'Coffee hub',description:'Coffee, a short stretch and conversations between departments.',center:[17,4],portal:[12,4],spots:[{position:[17.45,5.4],rotation:.8,posture:'stand',gesture:'sip'},{position:[18.42,4.4],rotation:.8,posture:'stand',gesture:'talk'}]},
 {id:'ideas',name:'Review & brainstorm',description:'A shared table for sketchbooks, concepts and team review.',center:[-10,6],portal:[-6.8,6],spots:[{position:[-10.9,7.25],rotation:0,posture:'sit',gesture:'think'},{position:[-9.1,7.25],rotation:0,posture:'sit',gesture:'talk'}]},
];
export const officeSharedSpaces=authoredSpaces.map(space=>{
 const center=officeCommonsCenters[space.id],dx=center[0]-space.center[0],dz=center[1]-space.center[1];
 return {...space,center,portal:space.id==='coffee'?[3,-28]:[Math.sign(center[0])*11.5,21.5],spots:space.spots.map(spot=>({...spot,position:[spot.position[0]+dx,spot.position[1]+dz]}))};
});
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function officeVisitPath(home,space,spot){
 const start=home.position,exit=home.exit?.length?home.exit:[],entry=exit.at(-1)??start;
 return [start,...exit,...circulationPath(entry,space.portal),space.portal,...(space.id==='coffee'?[[3,-18]]:[]),spot.position].filter((p,i,all)=>i===0||distance(p,all[i-1])>.01);
}
function along(points,t){const lengths=points.slice(1).map((p,i)=>distance(points[i],p)),total=lengths.reduce((a,b)=>a+b,0);let travel=Math.max(0,Math.min(1,t))*total;for(let i=0;i<lengths.length;i++){if(travel<=lengths[i]||i===lengths.length-1){const a=points[i],b=points[i+1];return{position:mix(a,b,lengths[i]?Math.min(1,travel/lengths[i]):1),rotation:Math.atan2(a[0]-b[0],a[1]-b[1])};}travel-=lengths[i];}return{position:points[0],rotation:0};}
export const officeCanTakeBreak=({fresh,status,state,running,assigned,role})=>fresh===true&&status==='idle'&&['idle','completed'].includes(state)&&!running&&!assigned&&role!=='coo';
const eligible=a=>a.available===true&&!a.running&&['idle','completed'].includes(a.state)&&a.role!=='coo';
export const officeSocialPacing={maxVisitors:1,initialQuiet:20,betweenVisits:30};
export function createOfficeSocial(homes,options){
 const visitPath=options?.visitPath??officeVisitPath;
 const slots=officeSharedSpaces.flatMap(space=>space.spots.map((spot,i)=>({key:space.id+':'+i,space,spot}))),visits=new Map();let cursor=0,nextStart=officeSocialPacing.initialQuiet;
 return {update(time,agents,enabled=true,allowNew=true){
  const allowed=new Map(agents.filter(eligible).map(a=>[a.id,a]));
  for(const[id,v]of visits)if(!enabled||!allowed.has(id)||time>=v.end){visits.delete(id);nextStart=Math.max(nextStart,time+officeSocialPacing.betweenVisits);}
  if(enabled&&allowNew&&time>=nextStart&&visits.size<officeSocialPacing.maxVisitors){
   const candidates=agents.filter(a=>eligible(a)&&homes.has(a.id)&&!visits.has(a.id));
   if(candidates.length){const agent=candidates[cursor%candidates.length],slot=slots[cursor%slots.length];cursor++;
    const home=homes.get(agent.id),path=visitPath(home,slot.space,slot.spot),length=path.slice(1).reduce((sum,p,i)=>sum+distance(p,path[i]),0),walk=length/1.5,start=time,dwell=40+(home.index%5)*5;
    visits.set(agent.id,{slot,path,walk,start,end:start+walk*2+dwell,dwell});
   }
  }
  const poses=new Map(),activity=[];
  for(const[id,v]of visits){const elapsed=time-v.start;if(elapsed<0)continue;const stay=elapsed>=v.walk&&elapsed<v.walk+v.dwell,returning=elapsed>=v.walk+v.dwell;const point=stay?{position:v.slot.spot.position,rotation:v.slot.spot.rotation}:along(returning?[...v.path].reverse():v.path,(returning?elapsed-v.walk-v.dwell:elapsed)/v.walk);const phase=stay?'relaxing':returning?'returning':'walking';poses.set(id,{...point,posture:stay?v.slot.spot.posture:'walk',gesture:stay?v.slot.spot.gesture:null});activity.push({agentId:id,spaceId:v.slot.space.id,phase});}
  return {poses,activity};
 }};
}
