import * as T from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import type {DubaiDaylight} from '@/lib/office-daylight.mjs';

/** A staged Dubai setting, not a geographically surveyed city model. */
export function createDubaiCity(officeOutline:T.Vector3[]){
 const root=new T.Group();root.name='Dubai / spatial city';
 const groundY=-38;
 const textures:T.Texture[]=[];
 let seed=947;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const steel=new T.MeshStandardMaterial({color:'#8ca7b1',metalness:.65,roughness:.34});
 const pale=new T.MeshStandardMaterial({color:'#a8b3b4',metalness:.18,roughness:.7});
 const dark=new T.MeshStandardMaterial({color:'#3d5661',metalness:.55,roughness:.43});
 const sand=new T.MeshStandardMaterial({color:'#9a9b90',roughness:1});
 const road=new T.MeshStandardMaterial({color:'#48565b',roughness:.95});
 const planting=new T.MeshStandardMaterial({color:'#496a60',roughness:1});
 const warm=new T.MeshBasicMaterial({color:'#e8d7ac'});
 const cool=new T.MeshBasicMaterial({color:'#c1dae0'});
 const boxGeometry=new T.BoxGeometry(1,1,1);
 function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material){
  const mesh=new T.Mesh(boxGeometry,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 function batch(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,transforms:{x:number;y:number;z:number;w:number;h:number;d:number;angle?:number}[]){
  const mesh=new T.InstancedMesh(geometry,material,transforms.length),dummy=new T.Object3D();
  transforms.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle??0,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;parent.add(mesh);return mesh;
 }
 function path(points:T.Vector3[],radius:number,material:T.Material,closed=false){
  const mesh=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points,closed),points.length*6,radius,5,closed),material);root.add(mesh);return mesh;
 }
 // Extruded architecture needs normalized façade UVs; world-unit UVs collapse into lit edge texels.
 function glazedUV(geometry:T.BufferGeometry,vertical:'y'|'z'='y'){
  geometry.computeBoundingBox();const b=geometry.boundingBox!,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
  const range=(value:number,min:number,max:number)=>(value-min)/Math.max(.001,max-min);
  for(let i=0;i<p.count;i++){
   if(Math.abs(vertical==='y'?n.getY(i):n.getZ(i))>.5){uv.setXY(i,0,0);continue;}
   const useZ=Math.abs(n.getX(i))>Math.abs(vertical==='y'?n.getZ(i):n.getY(i));
   const u=useZ?(vertical==='y'?range(p.getZ(i),b.min.z,b.max.z):range(p.getY(i),b.min.y,b.max.y)):range(p.getX(i),b.min.x,b.max.x);
   const v=vertical==='y'?range(p.getY(i),b.min.y,b.max.y):range(p.getZ(i),b.min.z,b.max.z);uv.setXY(i,u,v);
  }uv.needsUpdate=true;return geometry;
 }
 // Pixel-authored glazing, not photographic architecture or a backdrop plane.
 function facadeTexture(variant:number){
  const width=128,height=256,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const at=(y*width+x)*4,frame=x%16<2||y%8<1;
   const illuminated=((Math.floor(x/16)*17+Math.floor(y/8)*13+variant*5)%23)<3;
   const reflection=Math.sin(x/width*Math.PI)*18+y/height*12;
   const base=frame?[104,130,139]:illuminated?[161,164,144]:[52+reflection,87+reflection,104+reflection];
   pixels[at]=base[0];pixels[at+1]=base[1];pixels[at+2]=base[2];pixels[at+3]=255;
  }
  const texture=new T.DataTexture(pixels,width,height);texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;textures.push(texture);return texture;
 }
 function windowMask(variant:number){
  const pixels=new Uint8Array(128*256*4);for(let y=0;y<256;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,on=x%16>3&&x%16<13&&y%8>1&&y%8<7&&((Math.floor(x/16)*17+Math.floor(y/8)*13+variant*5)%23)<6;pixels[i]=pixels[i+1]=pixels[i+2]=on?255:0;pixels[i+3]=255;}const t=new T.DataTexture(pixels,128,256);t.colorSpace=T.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.needsUpdate=true;textures.push(t);return t;
 }
 const glazing=['#bacbd0','#8caebc','#b0bdbe'].map((color,i)=>new T.MeshStandardMaterial({name:'City glazing / '+i,color,map:facadeTexture(i),metalness:.58,roughness:.24,emissive:'#ffe0ab',emissiveMap:windowMask(i),emissiveIntensity:0}));
 const sky=new Sky();sky.name='Analytic daylight atmosphere';sky.scale.setScalar(750);
 Object.assign(sky.material.uniforms.turbidity,{value:7});Object.assign(sky.material.uniforms.rayleigh,{value:1.1});
 sky.material.uniforms.mieCoefficient.value=.005;sky.material.uniforms.mieDirectionalG.value=.82;
 sky.material.uniforms.sunPosition.value.set(-160,110,150);sky.material.uniforms.showSunDisc.value=true;
 // Match the analytic sky's horizon to the same aerial haze as distant geometry.
 // Otherwise the much brighter sky creates an artificial hard edge at the city.
 sky.material.uniforms.cityHaze={value:new T.Color('#d6e4e9')};
 sky.material.uniforms.nightBlend={value:0};
 sky.material.fragmentShader='uniform vec3 cityHaze;\nuniform float nightBlend;\n'+sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );','gl_FragColor = vec4( mix( cityHaze, mix(texColor, vec3(0.004,0.009,0.025) + vec3(0.008,0.009,0.012) * (1.0 - max(0.0,direction.y)), nightBlend), smoothstep( 0.0, 0.22, direction.y ) ), 1.0 );');
 root.add(sky);

 // The occupied cutaway is the top floor of a building, with a city far below.
 const towerShape=new T.Shape();officeOutline.forEach((p,i)=>i?towerShape.lineTo(p.x,-p.z):towerShape.moveTo(p.x,-p.z));towerShape.closePath();
 const base=new T.Mesh(glazedUV(new T.ExtrudeGeometry(towerShape,{depth:37.2,bevelEnabled:false,steps:1}),'z'),glazing[1]);
 base.rotation.x=-Math.PI/2;base.position.y=groundY;base.name='Office tower / inhabited elevation';root.add(base);
 const perimeter=new T.CatmullRomCurve3(officeOutline.slice(0,-1).map(p=>new T.Vector3(p.x,0,p.z)),true);
 const floorBand=new T.TubeGeometry(perimeter,256,.065,4,true);
 for(let level=-2.4;level>groundY;level-=2.8){const rim=new T.Mesh(floorBand,steel);rim.position.y=level;root.add(rim);}
 const facadeFins=officeOutline.filter((_,i)=>i%4===0).map(p=>({x:p.x,y:groundY/2,z:p.z,w:.07,h:36.8,d:.07}));batch(root,boxGeometry,steel,facadeFins);
 const podium=new T.Mesh(new T.ExtrudeGeometry(towerShape,{depth:1.5,bevelEnabled:true,bevelSize:1.5,bevelThickness:.3,bevelSegments:2}),pale);podium.rotation.x=-Math.PI/2;podium.position.y=groundY;root.add(podium);
 box(root,8000,.4,8000,0,groundY-.6,0,sand);
 // Business Bay-inspired water and promenades below the office, curving in depth.
 const water=new T.MeshStandardMaterial({color:'#4c8998',metalness:.42,roughness:.24});
 const canalPoints=[new T.Vector3(-250,groundY+.02,-86),new T.Vector3(-115,groundY+.02,-48),new T.Vector3(-65,groundY+.02,-25),new T.Vector3(-52,groundY+.02,50),new T.Vector3(-110,groundY+.02,140),new T.Vector3(-230,groundY+.02,210)];
 const canalCurve=new T.CatmullRomCurve3(canalPoints);
 // A horizontal ribbon follows the same sampled path as its two quays.
 const vertices:number[]=[],indices:number[]=[],quayA:T.Vector3[]=[],quayB:T.Vector3[]=[];
 for(let i=0;i<=100;i++){const t=i/100,p=canalCurve.getPoint(t),tangent=canalCurve.getTangent(t),normal=new T.Vector3(-tangent.z,0,tangent.x).normalize().multiplyScalar(10);const a=p.clone().add(normal),b=p.clone().sub(normal);vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);quayA.push(a);quayB.push(b);if(i<100){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
 const canalGeometry=new T.BufferGeometry();canalGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));canalGeometry.setIndex(indices);canalGeometry.computeVertexNormals();water.side=T.DoubleSide;root.add(new T.Mesh(canalGeometry,water));path(quayA,.35,pale);path(quayB,.35,pale);
 const boulevard=new T.CatmullRomCurve3([new T.Vector3(-190,groundY+.15,55),new T.Vector3(-75,groundY+.15,70),new T.Vector3(26,groundY+.15,52),new T.Vector3(60,groundY+.15,-20),new T.Vector3(95,groundY+.15,-135),new T.Vector3(180,groundY+.15,-240)]);
 const carriageway=path(boulevard.getPoints(70).map(p=>new T.Vector3(p.x,0,p.z)),3.8,road);carriageway.scale.y=.03;carriageway.position.y=groundY+.12;path(boulevard.getPoints(70).map(p=>p.clone().add(new T.Vector3(0,.1,0))),.035,warm);
 const secondaryRoads=[[-150,-80,300,3],[-135,-145,310,3.5],[110,20,3,330],[175,-10,3.5,380]];
 secondaryRoads.forEach(([x,z,w,d])=>box(root,w,.07,d,x,groundY+.1,z,road));

 function tower(x:number,z:number,height:number,width:number,depth:number,index:number){
  // Keep an actual sight line to the landmark from the default office view.
  const vx=x-22,vz=z-25,dx=-.643,dz=-.766,along=vx*dx+vz*dz,across=Math.abs(vx*dz-vz*dx);
  if(along>48&&along<250&&across<12+width*.55)return;
  const g=new T.Group();g.position.set(x,groundY,z);g.rotation.y=(index%4)*.14-.2;g.name='City tower / '+index;root.add(g);
  const material=glazing[index%glazing.length],style=index%4;
  box(g,width*1.35,1.3,depth*1.3,0,.65,0,pale);
  if(style===0){
   box(g,width,height*.72,depth,0,height*.36,0,material);
   box(g,width*.75,height*.22,depth*.82,width*.06,height*.83,0,material);
   box(g,width*.48,height*.08,depth*.62,0,height*.98,0,steel);
  }else if(style===1){
   const shape=new T.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,height*.85);shape.lineTo(-width/2,height);shape.closePath();
   const blade=new T.Mesh(glazedUV(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false})),material);blade.position.z=-depth/2;g.add(blade);
  }else{
   const mesh=new T.Mesh(new T.CylinderGeometry(width*.4,width*.52,height,style===2?12:6),material);mesh.position.y=height/2;mesh.scale.z=depth/width;g.add(mesh);
   const crown=new T.Mesh(new T.CylinderGeometry(width*.43,width*.43,1.2,12,1,true),steel);crown.position.y=height+.3;crown.scale.z=depth/width;g.add(crown);
  }
  const fins=[];for(let side=-1;side<=1;side+=2)for(let j=0;j<4;j++)fins.push({x:(j/3-.5)*width*.85,y:height*.35,z:side*depth*.502,w:.045,h:height*.68,d:.045});
  batch(g,boxGeometry,steel,fins);
  const bands=[];for(let y=2;y<height*.7;y+=2.5)bands.push({x:0,y,z:0,w:width*1.01,h:.09,d:depth*1.01});if(style<2)batch(g,boxGeometry,steel,bands);
  box(g,width*.28,.7,depth*.26,width*.12,style===1?height*.9+.3:height+.3,0,dark);
 }
 // Deliberately composed near/middle distances; none sits within the office floor.
 [[-43,-35,44,6.2,7],[-37,-71,57,6.8,8],[48,-42,61,7.2,7],[-79,4,49,7,8],[84,-7,48,6.5,8],[23,-77,52,5.6,6.2],[-36,34,31,7,8],[42,28,34,6,7],[37,-65,59,7,8],[-58,-38,47,7,8],[-57,40,30,9,7],[69,27,46,8,9],[-18,-60,57,6,8],[8,-56,48,6,7],[67,-58,69,8,7],[-72,-80,54,6,8],[-95,-25,45,8,6],[38,60,24,10,8]].forEach((p,i)=>tower(p[0],p[1],p[2],p[3],p[4],i));
 for(let i=0;i<76;i++){
  const a=i/76*Math.PI*2,r=72+random()*135,x=Math.sin(a)*r,z=Math.cos(a)*r;
  // Foreground buildings stay below the occupied floor, preserving the cutaway.
  const foreground=x+z>35,height=foreground?12+random()*18:25+random()*45;
  if(x<-38&&x>-80&&z>-40&&z<100)continue;
  tower(x,z,height,4+random()*5,4+random()*6,i+7);
 }
 // A lower urban fabric gives the high-rises a continuous city to emerge from.
 const quarters=[];for(let i=0;i<180;i++){const a=i/180*Math.PI*2,r=240+random()*260,h=5+random()*14;quarters.push({x:Math.sin(a)*r,y:groundY+h/2,z:Math.cos(a)*r,w:8+random()*9,h,d:9+random()*11,angle:(i%3)*.12});}batch(root,boxGeometry,pale,quarters);
 // Burj Khalifa: source-led Y wings, stepped setbacks and a telescoping spire.
 const burj=new T.Group();burj.position.set(-125,groundY,-150);burj.rotation.y=.4;burj.scale.set(1.5,1.1,1.5);burj.name='Burj Khalifa / interpreted landmark';root.add(burj);
 const burjGlass=glazing[0].clone();burjGlass.name='Burj silver glazing';burjGlass.color.set('#a7c0d1');burjGlass.emissive.set('#e2edff');
 const landmarkLights=new T.MeshBasicMaterial({color:'#a8c8e8'});
 for(let tier=0;tier<18;tier++){
  const y=tier*4.1,r=2.7*(1-tier/23),core=new T.Mesh(new T.CylinderGeometry(r*.96,r,4.12,12),burjGlass);core.position.y=y+2.05;burj.add(core);
  for(let wing=0;wing<3;wing++)if(tier<18-wing*2){const a=wing*Math.PI*2/3,length=4.7*(1-(tier+wing*.65)/23);const arm=box(burj,1.7*(1-tier/30),4.12,length,Math.sin(a)*length*.47,y+2.05,Math.cos(a)*length*.47,burjGlass);arm.rotation.y=a;}
 }
 const upper=new T.Mesh(new T.CylinderGeometry(.25,.8,15,12),steel);upper.position.y=80;burj.add(upper);
 const spire=new T.Mesh(new T.ConeGeometry(.28,17,10),steel);spire.position.y=96;burj.add(spire);
 const setbacks=[];for(let i=0;i<54;i++)setbacks.push({x:0,y:1+i*1.35,z:0,w:5.7*(1-i/70),h:.055,d:5.7*(1-i/70)});batch(burj,boxGeometry,steel,setbacks);batch(burj,boxGeometry,landmarkLights,setbacks.filter((_,i)=>i%6===0).map(p=>({...p,w:p.w*1.005,d:p.d*1.005,h:p.h*1.08})));
 const lake=new T.Mesh(new T.CylinderGeometry(21,21,.06,64),water);lake.position.set(-125,groundY+.04,-150);lake.scale.z=.7;root.add(lake);

 // A Cayan-inspired helical tower: the silhouette actually twists in world space.
 const twist=new T.Group();twist.position.set(-100,groundY,-51);twist.name='Helical tower / Cayan-inspired';root.add(twist);
 const shellPositions:number[]=[],shellUV:number[]=[],shellIndices:number[]=[],levels=40,sides=6;
 for(let level=0;level<=levels;level++)for(let side=0;side<=sides;side++){const a=side/sides*Math.PI*2+level/levels*Math.PI/2;shellPositions.push(Math.sin(a)*3.7,level/levels*56,Math.cos(a)*3.7);shellUV.push(side/sides,level/levels);if(level<levels&&side<sides){const k=level*(sides+1)+side;shellIndices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}}
 const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(shellPositions,3));shell.setAttribute('uv',new T.Float32BufferAttribute(shellUV,2));shell.setIndex(shellIndices);shell.computeVertexNormals();const helicalGlass=glazing[1].clone();helicalGlass.side=T.DoubleSide;twist.add(new T.Mesh(shell,helicalGlass));
 const plateGeometry=new T.CylinderGeometry(3.77,3.77,.1,6);const plates=new T.InstancedMesh(plateGeometry,steel,41),dummy=new T.Object3D();for(let i=0;i<=40;i++){dummy.position.set(0,i/40*56,0);dummy.rotation.y=i/40*Math.PI/2;dummy.updateMatrix();plates.setMatrixAt(i,dummy.matrix);}twist.add(plates);
 // Street-level palms and medians are instanced, including their shaded canopies.
 const trunks=[],crowns=[];for(let i=0;i<75;i++){const t=i/75,p=boulevard.getPoint(t),normal=new T.Vector3(-boulevard.getTangent(t).z,0,boulevard.getTangent(t).x).normalize();for(const side of [-1,1]){const x=p.x+normal.x*side*6,z=p.z+normal.z*side*6;trunks.push({x,y:groundY+1.3,z,w:.16,h:2.6,d:.16});crowns.push({x,y:groundY+2.9,z,w:1.35,h:.35,d:1.35});}}
 batch(root,boxGeometry,pale,trunks);batch(root,new T.IcosahedronGeometry(1,0),planting,crowns);

 // Ambient traffic is presentation only; it never signals real agent activity.
 const cars=new T.InstancedMesh(new T.BoxGeometry(.38,.23,.8),pale,30),headlights=new T.InstancedMesh(new T.BoxGeometry(.28,.04,.04),cool,30);root.add(cars,headlights);cars.instanceMatrix.setUsage(T.DynamicDrawUsage);headlights.instanceMatrix.setUsage(T.DynamicDrawUsage);
 const boat=new T.Group();const hull=box(boat,1.1,.26,3,0,0,0,pale);hull.rotation.z=.03;box(boat,.75,.38,1.2,0,.3,-.2,pale);box(boat,.65,.1,.7,0,.54,-.1,dark);root.add(boat);
 // Street furniture, shop podiums and lamp heads give the towers a lived-in ground plane.
 const lampPoles=[],lampHeads=[],markings=[];
 for(let i=0;i<42;i++){const t=i/42,p=boulevard.getPoint(t),v=boulevard.getTangent(t),n=new T.Vector3(-v.z,0,v.x).normalize();for(const side of [-1,1]){const x=p.x+n.x*side*5,z=p.z+n.z*side*5;lampPoles.push({x,y:groundY+1.7,z,w:.09,h:3.4,d:.09});lampHeads.push({x,y:groundY+3.45,z,w:.5,h:.1,d:.27});}if(i%2===0)markings.push({x:p.x,y:groundY+.19,z:p.z,w:.12,h:.02,d:1,angle:Math.atan2(v.x,v.z)});}
 batch(root,boxGeometry,dark,lampPoles);const streetLamps=batch(root,boxGeometry,warm,lampHeads);streetLamps.name='Boulevard lighting';batch(root,boxGeometry,pale,markings);
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=49+(i%3)*4,x=Math.sin(a)*r,z=Math.cos(a)*r;if(x+z>45)continue;const podium=box(root,7+(i%3),2.5,5,x,groundY+1.25,z,pale);podium.name='Retail podium / '+i;box(root,5.5,1.6,.05,x,groundY+1.4,z+2.53,glazing[i%3]);}
 const vector=new T.Vector3(),tangent=new T.Vector3();
 const update=(time:number)=>{
  for(let i=0;i<30;i++){const reverse=i%2===0,t=(i/30+(reverse?-1:1)*time*.0025+10)%1;boulevard.getPointAt(t,vector);boulevard.getTangentAt(t,tangent);const side=reverse?-1:1;dummy.position.set(vector.x-tangent.z*side*1.4,groundY+.5,vector.z+tangent.x*side*1.4);dummy.rotation.set(0,Math.atan2(tangent.x,tangent.z)+(reverse?Math.PI:0),0);dummy.scale.setScalar(1);dummy.updateMatrix();cars.setMatrixAt(i,dummy.matrix);dummy.translateZ(.43);dummy.updateMatrix();headlights.setMatrixAt(i,dummy.matrix);}
  cars.instanceMatrix.needsUpdate=true;headlights.instanceMatrix.needsUpdate=true;
  const t=(.46+time*.001)%1;canalCurve.getPointAt(t,vector);canalCurve.getTangentAt(t,tangent);boat.position.copy(vector).add(new T.Vector3(0,.25,0));boat.rotation.y=Math.atan2(tangent.x,tangent.z);
 };
 update(0);
 const setDaylight=(state:DubaiDaylight)=>{
  sky.material.uniforms.sunPosition.value.fromArray(state.sunDirection).multiplyScalar(500);
  sky.material.uniforms.nightBlend.value=state.night;
  sky.material.uniforms.cityHaze.value.set('#101a2c').lerp(new T.Color('#c3d8e2'),state.daylight).lerp(new T.Color('#ca9475'),state.warmth*.4);
  sky.material.uniforms.rayleigh.value=.9+state.warmth*1.1;
  glazing.forEach(m=>m.emissiveIntensity=state.windows*1.2);helicalGlass.emissiveIntensity=state.windows*1.2;burjGlass.emissiveIntensity=state.windows*.65;landmarkLights.color.set('#a8c8e8').multiplyScalar(.1+state.windows*.8);
  warm.color.set('#ffe3ad').multiplyScalar(.65+state.windows*.65);cool.color.set('#daebf4').multiplyScalar(.4+state.windows*.7);
  water.color.set('#142c43').lerp(new T.Color('#4c8998'),state.daylight);water.roughness=.19+state.daylight*.05;
 };
 return {root,update,setDaylight,dispose:()=>textures.forEach(texture=>texture.dispose())};
}
