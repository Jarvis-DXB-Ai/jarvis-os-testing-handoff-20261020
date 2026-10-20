import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type ContentStudioLayout={back:number;bayCenters:number[];bayWidth:number;cameraZ:number;storageX:number;storageZ:number};

/** Reference-led static studio furniture. All dimensions are scene metres. */
export function createOfficeContentStudio(layout:ContentStudioLayout,textures:T.Texture[]=[],finish?:{woodMap:T.Texture;woodRoughnessMap:T.Texture}){
 const root=new T.Group();root.name='Content / two production bays and preparation';
 const surfaceTexture=(wood:boolean)=>{const w=wood?128:64,h=wood?256:64,pixels=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,n=Math.sin(x*31.73+y*17.13),grain=wood?Math.sin(x*.3+Math.sin(y*.018)*2.5)*6+Math.sin(x*.09+y*.006)*3:n*3+(x%3===0?3:0)+(y%3===0?-3:0);const c=wood?[128,89,58]:[177,174,159];pixels[i]=c[0]+grain;pixels[i+1]=c[1]+grain;pixels[i+2]=c[2]+grain;pixels[i+3]=255;}const map=new T.DataTexture(pixels,w,h);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.needsUpdate=true;textures.push(map);return map;};
 const timberMap=finish?.woodMap??surfaceTexture(true),clothMap=surfaceTexture(false);
 const matte=new T.MeshStandardMaterial({name:'Content / charcoal powder coat',color:'#262c2d',roughness:.82});
 const silver=new T.MeshStandardMaterial({name:'Content / brushed aluminium',color:'#bdc3c4',roughness:.34,metalness:.72});
 const white=new T.MeshStandardMaterial({name:'Content / seamless white paper',color:'#f4f2e9',roughness:.96,side:T.DoubleSide});
 const diffuser=new T.MeshStandardMaterial({name:'Content / softbox diffuser',color:'#fbf9ee',roughness:.9,emissive:'#e4dfc9',emissiveIntensity:.12,side:T.DoubleSide});
 const walnut=new T.MeshStandardMaterial({name:'Content / walnut preparation joinery',color:'#ffffff',map:timberMap,roughnessMap:finish?.woodRoughnessMap??null,bumpMap:timberMap,bumpScale:.006,roughness:.78});
 const walnutFrame=walnut.clone();walnutFrame.name='Content / darker structural walnut edges';walnutFrame.color.set('#d2c2ad');walnutFrame.roughness=.9;
 const cabinetFaces=[walnut,walnut.clone(),walnut.clone()];cabinetFaces[1].name='Content / honey drawer variation';cabinetFaces[1].color.set('#f5eee4');cabinetFaces[2].name='Content / aged drawer variation';cabinetFaces[2].color.set('#ebe1d4');
 const fabric=new T.MeshStandardMaterial({name:'Content / folded fabric and wardrobe',color:'#ffffff',map:clothMap,bumpMap:clothMap,bumpScale:.012,roughness:.98});
 const glass=new T.MeshStandardMaterial({name:'Content / optical glass',color:'#253e45',roughness:.17,metalness:.38});
 const cream=new T.MeshStandardMaterial({name:'Content / ceramic props',color:'#ded4bf',roughness:.58});
 const envelopes:{name:string;x:number;z:number;width:number;depth:number}[]=[];
 const box=(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material,r=.025)=>{
  const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/4,h/4,d/4)),material);mesh.position.set(x,y,z);p.add(mesh);return mesh;
 };
 const cylinder=(p:T.Object3D,r:number,h:number,x:number,y:number,z:number,material:T.Material)=>{
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,20),material);mesh.position.set(x,y,z);p.add(mesh);return mesh;
 };
 const rod=(p:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,material=matte)=>{
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),10),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());p.add(mesh);return mesh;
 };
 const stand=(p:T.Object3D,height:number,spread=.5)=>{
  cylinder(p,.023,height,0,.1+height/2,0,silver);cylinder(p,.043,.12,0,height*.52,0,matte);cylinder(p,.035,.1,0,height*.78,0,matte);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.sin(a)*spread,z=Math.cos(a)*spread;rod(p,new T.Vector3(0,.58,0),new T.Vector3(x,.03,z),.018);box(p,.13,.06,.11,x,.03,z,matte,.02);}
 };
 function sweep(center:number){
  const profile:[number,number][]=[[layout.back,3.2],[layout.back,.8]];
  for(let i=0;i<=20;i++){const a=Math.PI-i/20*Math.PI/2;profile.push([layout.back+.7+Math.cos(a)*.7,.8-Math.sin(a)*.7]);}
  profile.push([layout.back+4,.1]);
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  profile.forEach(([z,y],i)=>{for(const side of[-1,1]){positions.push(center+side*layout.bayWidth/2,y,z);uvs.push(side<0?0:1,i/(profile.length-1));}});
  for(let i=0;i<profile.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();root.add(new T.Mesh(geometry,white));
  // Paper roll, support feet and weighted base remain physically visible.
  for(const side of[-1,1]){const g=new T.Group();g.position.set(center+side*(layout.bayWidth/2+.16),.08,layout.back+.05);root.add(g);stand(g,3.1,.34);}
  const roll=cylinder(root,.085,layout.bayWidth+.35,center,3.22,layout.back,white);roll.rotation.z=Math.PI/2;
 }
 function softbox(x:number,z:number,targetX:number,targetZ:number,umbrella:boolean){
  const rig=new T.Group();rig.position.set(x,.08,z);root.add(rig);stand(rig,2.03,.48);cylinder(rig,.065,.11,0,1.77,0,matte);box(rig,.13,.05,.06,.07,1.77,0,silver,.01);
  const head=new T.Group();head.position.y=2.05;head.lookAt(new T.Vector3(targetX-x,1.65-.08,targetZ-z));rig.add(head);
  if(umbrella){
   const shell=new T.Mesh(new T.SphereGeometry(.63,20,10,0,Math.PI*2,0,Math.PI*.43),diffuser);shell.rotation.x=Math.PI/2;head.add(shell);
   for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(head,new T.Vector3(0,0,-.5),new T.Vector3(Math.sin(a)*.6,Math.cos(a)*.6,-.08),.006,silver);}
   rod(head,new T.Vector3(0,0,-.7),new T.Vector3(0,0,.18),.012,silver);box(head,.19,.16,.27,0,0,-.53,matte);
  }else{
   const shell=new T.Mesh(new T.CylinderGeometry(.53,.28,.34,4,1,true),matte);shell.rotation.set(Math.PI/2,Math.PI/4,0);head.add(shell);
   box(head,.77,.77,.025,0,0,.18,diffuser,.06);box(head,.2,.18,.28,0,0,-.27,matte);
  }
  // Sandbag at a tripod foot rather than floating at the stand centre.
  box(rig,.32,.15,.23,.26,.11,.25,fabric,.06);
  envelopes.push({name:umbrella?'Umbrella light':'Softbox light',x,z,width:1.3,depth:1.3});
 }
 function camera(x:number,z:number){
  const rig=new T.Group();rig.position.set(x,.08,z);root.add(rig);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.3;rod(rig,new T.Vector3(Math.sin(a)*.1,1.26,Math.cos(a)*.1),new T.Vector3(Math.sin(a)*.52,.04,Math.cos(a)*.52),.024);cylinder(rig,.035,.08,Math.sin(a)*.52,.04,Math.cos(a)*.52,matte);}
  cylinder(rig,.043,.37,0,1.15,0,silver);box(rig,.28,.1,.22,0,1.39,0,matte);box(rig,.43,.28,.23,0,1.56,0,matte,.045);box(rig,.1,.23,.23,.22,1.55,.025,matte,.035);cylinder(rig,.047,.035,.12,1.715,.02,silver);box(rig,.09,.027,.09,-.05,1.719,0,silver,.008);
  const lens=cylinder(rig,.115,.28,0,1.56,-.22,matte);lens.rotation.x=Math.PI/2;for(const z of[-.12,-.23,-.31]){const ring=cylinder(rig,.119,.018,0,1.56,z,silver);ring.rotation.x=Math.PI/2;}
  const front=cylinder(rig,.093,.015,0,1.56,-.365,glass);front.rotation.x=Math.PI/2;
  box(rig,.12,.08,.12,.12,1.74,-.015,matte);box(rig,.23,.15,.015,0,1.57,.126,glass,.01);
  rod(rig,new T.Vector3(.07,1.38,.08),new T.Vector3(.42,1.31,.38),.018);
  envelopes.push({name:'Camera tripod',x,z,width:1.2,depth:1.2});
 }
 layout.bayCenters.forEach((x,i)=>{
  sweep(x);const subjectZ=layout.back+2.2;
  softbox(x-layout.bayWidth*.34,layout.back+3.65,x,subjectZ,false);
  softbox(x+layout.bayWidth*.34,layout.back+3.9,x,subjectZ,true);
  camera(x,layout.cameraZ);
  // One small product still-life and one portrait stool make the bays distinct.
  if(i===0){cylinder(root,.34,.58,x,.4,subjectZ,cream);cylinder(root,.21,.05,x,.715,subjectZ,white);cylinder(root,.065,.19,x-.1,.825,subjectZ,cream);box(root,.14,.23,.07,x+.1,.85,subjectZ,white,.015);}
  else{const flag=new T.Group();flag.position.set(x+layout.bayWidth*.35,.1,layout.back+1);flag.rotation.y=-.28;root.add(flag);box(flag,.64,1.6,.045,0,.95,0,matte,.02);for(const side of[-1,1])box(flag,.35,.05,.45,side*.22,.025,0,silver,.01);cylinder(root,.34,.075,x,.73,subjectZ,walnut);for(const dx of[-.22,.22])for(const dz of[-.18,.18])rod(root,new T.Vector3(x+dx,.7,subjectZ+dz),new T.Vector3(x+dx*1.2,.1,subjectZ+dz*1.2),.022);}
  envelopes.push({name:'White seamless shooting bay '+(i+1),x,z:layout.back+2,width:layout.bayWidth+.45,depth:4.6});
 });
 const prepZ=layout.cameraZ+1.3,island=new T.Group();island.position.set(0,.08,prepZ);island.name='Styling and gear preparation island';root.add(island);
 box(island,2.65,.09,.86,0,.86,0,walnut,.035);for(const x of[-1.17,1.17])box(island,.085,.815,.7,x,.4075,0,matte,.015);box(island,2.4,.06,.68,0,.19,0,walnut,.02);
 for(const x of[-.65,.18]){box(island,.65,.4,.54,x,.42,0,matte,.04);for(const side of[-1,1])box(island,.035,.37,.56,x+side*.25,.42,0,silver,.005);box(island,.21,.025,.07,x,.635,0,silver,.01);}
 box(island,.53,.025,.38,.72,.925,-.06,cream,.012);for(const x of[.58,.84]){const spare=cylinder(island,.08,.16,x,1.01,-.05,matte);spare.rotation.x=Math.PI/2;}
 box(island,.53,.014,.34,-.78,.915,.06,white,.005);box(island,.48,.015,.3,-.76,.931,.05,fabric,.006);box(island,.3,.055,.22,.02,.932,.08,cream,.018);
 envelopes.push({name:'Styling and equipment preparation island',x:0,z:prepZ,width:2.8,depth:1});
 // Fitted studio joinery: a full preparation wall and a wardrobe/gear cabinet wall.
 const compact=layout.storageX<6,bankLength=compact?3.6:4.4,bankX=layout.storageX+.2,bankZ=layout.storageZ+(compact?1.3:1);
 for(const side of[-1,1]){
  const bank=new T.Group();bank.position.set(side*bankX,.08,bankZ);bank.rotation.y=side<0?Math.PI/2:-Math.PI/2;bank.scale.x=bankLength/4.4;bank.name=side<0?'Fitted styling / preparation wall':'Fitted wardrobe / equipment storage wall';root.add(bank);
  box(bank,4.4,.13,.86,0,.065,0,matte,.015);box(bank,4.4,2.9,.11,0,1.51,-.37,walnutFrame,.02);
  for(const end of[-1,1])box(bank,.14,2.91,.87,end*2.13,1.51,0,walnutFrame,.02);
  box(bank,4.4,.13,.88,0,3.01,0,walnutFrame,.025);
  if(side<0){
   box(bank,4.12,.77,.72,0,.515,0,walnut,.02);box(bank,4.4,.09,.96,0,.95,0,cream,.025);
   for(let drawerUnit=0;drawerUnit<4;drawerUnit++){const x=-1.55+drawerUnit*1.03;for(let drawer=0;drawer<3;drawer++){const y=.28+drawer*.22;box(bank,.98,.2,.045,x,y,.39,cabinetFaces[(drawerUnit+drawer)%3],.008);box(bank,.24,.022,.035,x,y+.02,.426,matte,.005);}}
   box(bank,1.42,1.27,.08,-.7,1.93,-.28,walnut,.025);box(bank,1.26,1.1,.025,-.7,1.93,-.227,silver,.015);
   for(const y of[1.3,1.9,2.5])box(bank,1.1,.055,.62,1.16,y,-.02,cream,.012);
   box(bank,1.1,.028,.55,-.7,1.012,0,fabric,.01);box(bank,.45,.08,.33,-1.62,1.03,0,cream,.02);
  }else{
   for(const x of[-.8,.8])box(bank,.09,2.75,.76,x,1.5,0,walnut,.015);
   box(bank,1.55,.08,.76,0,.35,0,walnut,.012);rod(bank,new T.Vector3(-.7,2.55,0),new T.Vector3(.7,2.55,0),.025,silver);
   for(let i=0;i<4;i++){const x=-.5+i*.33;rod(bank,new T.Vector3(x,2.52,0),new T.Vector3(x-.2,2.32,0),.014,walnut);rod(bank,new T.Vector3(x-.2,2.32,0),new T.Vector3(x+.2,2.32,0),.014,walnut);box(bank,.38,.93,.09,x,1.85,.03,i%2?fabric:white,.03);}
   for(const side of[-1,1])for(const y of[.5,1.3,2.1]){box(bank,1.13,.065,.74,side*1.49,y-.22,0,walnut,.012);box(bank,.87,.4,.58,side*1.49,y+.03,.04,matte,.035);box(bank,.23,.025,.045,side*1.49,y+.1,.35,silver,.008);}
  }
  envelopes.push({name:side<0?'Fitted styling preparation bank':'Fitted wardrobe and gear storage bank',x:side*bankX,z:bankZ,width:1,depth:bankLength});
 }

 // Merge static meshes by material: equipment detail does not require hundreds of draw calls.
 root.updateMatrixWorld(true);const grouped=new Map<T.Material,T.BufferGeometry[]>();
 root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);const list=grouped.get(o.material)??[];list.push(geometry);grouped.set(o.material,list);o.geometry.dispose();}});
 root.clear();let triangles=0;
 for(const [material,parts] of grouped){const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(!merged)continue;const mesh=new T.Mesh(merged,material);mesh.name=material.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);triangles+=merged.attributes.position.count/3;}
 root.userData={layout,envelopes,drawCalls:grouped.size,triangles,reference:'Owner supplied content-room-reference.jpg; original procedural geometry',reservedFrontZ:layout.cameraZ+1.8};
 return root;
}
