import * as T from 'three';
import {dubaiDaylight,type DubaiDaylight,type OfficeLightingMode} from '../../lib/office-daylight.mjs';
/** Wall-clock lighting remains independent of ambient animation and demo work. */
export function createOfficeLighting(scene:T.Scene,renderer:T.WebGLRenderer,city:{setDaylight:(state:DubaiDaylight)=>void},lights:{sun:T.DirectionalLight;fill:T.DirectionalLight;hemi:T.HemisphereLight;strip:T.MeshBasicMaterial;warm:T.MeshBasicMaterial},onChange?:(state:DubaiDaylight)=>void){
 let mode:OfficeLightingMode='live',sampledAt=0,target=dubaiDaylight(),current={...target,sunDirection:[...target.sunDirection]};
 const {sun,fill,hemi,strip,warm}=lights,blend=new T.Color(),direction=new T.Vector3();
 const indoors=[[-5.8,3.7,18],[5.8,4.2,18],[0,4,0],[0,4,-20]].map(p=>{const l=new T.PointLight('#ffe4bd',3,19,2);l.position.set(...p as [number,number,number]);l.name='Office practical lighting';scene.add(l);return l;});
 const starsGeometry=new T.BufferGeometry(),positions:number[]=[];
 for(let i=0;i<90;i++){const a=i*2.399963,y=.12+(i*37%89)/100,r=Math.sqrt(1-y*y)*570;positions.push(Math.sin(a)*r,y*570,Math.cos(a)*r);}
 starsGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));const starsMaterial=new T.PointsMaterial({color:'#c8dbea',size:1.05,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,fog:false,toneMapped:false});
 const stars=new T.Points(starsGeometry,starsMaterial);stars.name='Sparse night stars';scene.add(stars);
 const sample=()=>{sampledAt=Date.now();target=dubaiDaylight(sampledAt,mode);onChange?.(target);};
 const update=(immediate=false)=>{
  if(Date.now()-sampledAt>10000)sample();
  const rate=immediate?1:.055;
  for(const key of ['daylight','night','warmth','windows','elevation'] as const)current[key]=T.MathUtils.lerp(current[key],target[key],rate);
  current.sunDirection=current.sunDirection.map((v,i)=>T.MathUtils.lerp(v,target.sunDirection[i],rate));
  const day=current.daylight,night=current.night,warmth=current.warmth;
  direction.fromArray(current.sunDirection).normalize();sun.position.copy(direction).multiplyScalar(58);
  sun.intensity=T.MathUtils.lerp(sun.intensity,Math.max(0,Math.sin((target.elevation+.833)*Math.PI/180))*3.1,rate);
  sun.color.copy(blend.set('#fff4e3').lerp(new T.Color('#ff9a53'),warmth));
  hemi.intensity=.34+day*.86;hemi.color.copy(blend.set('#c0d9ec').lerp(new T.Color('#edb39a'),warmth*.5));hemi.groundColor.set('#3e4852');
  fill.intensity=.18+day*.48;fill.color.copy(blend.set('#8da8d2').lerp(new T.Color('#c8e4ef'),day));
  scene.environmentIntensity=.21+day*.58;
  const haze=blend.set('#101a2c').lerp(new T.Color('#c3d8e2'),day).lerp(new T.Color('#ca9475'),warmth*.4);
  if(scene.fog instanceof T.FogExp2){scene.fog.color.copy(haze);scene.fog.density=.0021+day*.0009;}
  if(scene.background instanceof T.Color)scene.background.copy(haze);
  strip.color.copy(blend.set('#ffe0b5').lerp(new T.Color('#e1f0f5'),day));warm.color.set('#ffe2ad');
  indoors.forEach(l=>{l.intensity=3+night*9;});starsMaterial.opacity=night*.58;
  renderer.toneMappingExposure=.88+night*.12;
  city.setDaylight(current);
 };
 sample();current={...target,sunDirection:[...target.sunDirection]};update(true);
 return {update:()=>update(),setMode:(next:OfficeLightingMode)=>{mode=next;sample();},dispose:()=>{starsGeometry.dispose();starsMaterial.dispose();indoors.forEach(l=>l.dispose());}};
}
