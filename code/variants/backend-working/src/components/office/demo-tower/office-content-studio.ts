import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type ContentStudioLayout={back:number;bayCenters:number[];bayWidth:number;cameraZ:number;storageX:number;storageZ:number;editingDesks?:{x:number;z:number}[]};

/** Reference-led static studio furniture. All dimensions are scene metres. */
export function createOfficeContentStudio(layout:ContentStudioLayout,textures:T.Texture[]=[],finish?:{woodMap:T.Texture|null;woodRoughnessMap:T.Texture|null}){
 const root=new T.Group();root.name='Content / enlarged dual photo, video and editorial suite';
 const clothMap=(()=>{const w=64,pixels=new Uint8Array(w*w*4);for(let i=0;i<w*w;i++){const c=175+(i%3)*3;pixels.set([c,c+3,c+5,255],i*4);}const map=new T.DataTexture(pixels,w,w);map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;textures.push(map);return map;})();
 const matte=new T.MeshStandardMaterial({name:'Content / charcoal powder coat',color:'#18232c',roughness:.82});
 const silver=new T.MeshStandardMaterial({name:'Content / brushed aluminium',color:'#bdc3c4',roughness:.34,metalness:.72});
 const white=new T.MeshStandardMaterial({name:'Content / seamless white paper',color:'#e9edf0',roughness:.96,side:T.DoubleSide});
 const diffuser=new T.MeshStandardMaterial({name:'Content / softbox diffuser',color:'#f2f6f8',roughness:.9,emissive:'#d7e5ed',emissiveIntensity:.12,side:T.DoubleSide});
 const alloy=new T.MeshStandardMaterial({name:'Content / satin aluminium preparation joinery',color:'#b5c2cb',roughness:.43,metalness:.62});
 const alloyFrame=alloy.clone();alloyFrame.name='Content / graphite structural edges';alloyFrame.color.set('#48545e');alloyFrame.roughness=.65;
 const cabinetFaces=[alloy,alloy.clone(),alloy.clone()];cabinetFaces[1].color.set('#dce2e6');cabinetFaces[2].color.set('#9baeb9');
 const fabric=new T.MeshStandardMaterial({name:'Content / folded fabric and wardrobe',color:'#ffffff',map:clothMap,bumpMap:clothMap,bumpScale:.012,roughness:.98});
 const glass=new T.MeshStandardMaterial({name:'Content / optical glass',color:'#253e45',roughness:.17,metalness:.38});
 const cream=new T.MeshStandardMaterial({name:'Content / ceramic props',color:'#bfcbd3',roughness:.58});
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
  profile.push([layout.back+5.8,.1]);
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
   const shell=new T.Mesh(new T.CylinderGeometry(.62,.29,.42,8,1,true),matte);shell.rotation.set(Math.PI/2,Math.PI/8,0);head.add(shell);
   const face=new T.Mesh(new T.CircleGeometry(.59,8),diffuser);face.position.z=.216;head.add(face);for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(head,new T.Vector3(Math.sin(a)*.60,Math.cos(a)*.60,.21),new T.Vector3(Math.sin(a)*.28,Math.cos(a)*.28,-.21),.009,silver);}box(head,.2,.18,.28,0,0,-.27,matte);
  }
  // Sandbag at a tripod foot rather than floating at the stand centre.
  box(rig,.43,.19,.3,.26,.13,.25,matte,.045);box(rig,.16,.018,.06,.26,.235,.25,silver,.005);rod(rig,new T.Vector3(0,1.77,0),new T.Vector3(.28,2.08,-.26),.025,matte);
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
  sweep(x);const subjectZ=layout.back+3;
  softbox(x-layout.bayWidth*.34,layout.back+5,x,subjectZ,false);
  softbox(x+layout.bayWidth*.34,layout.back+5.5,x,subjectZ,true);
  camera(x,layout.cameraZ);
  // One small product still-life and one portrait stool make the bays distinct.
  if(i===0){box(root,1.5,.07,.95,x,.79,subjectZ,matte,.045);for(const dx of[-.57,.57])for(const dz of[-.33,.33]){box(root,.055,.65,.055,x+dx,.43,subjectZ+dz,silver,.012);const wheel=cylinder(root,.055,.04,x+dx,.08,subjectZ+dz,matte);wheel.rotation.z=Math.PI/2;}box(root,.65,.035,.43,x,.85,subjectZ,alloy,.025);for(const dx of[-.2,0,.2])box(root,.16,.018,.29,x+dx,.878,subjectZ,white,.01);cylinder(root,.065,.19,x-.4,.92,subjectZ,cream);}
  else{const flag=new T.Group();flag.position.set(x+layout.bayWidth*.35,.1,layout.back+1);flag.rotation.y=-.28;root.add(flag);box(flag,.64,1.6,.045,0,.95,0,matte,.02);for(const side of[-1,1])box(flag,.35,.05,.45,side*.22,.025,0,silver,.01);cylinder(root,.34,.075,x,.73,subjectZ,alloy);for(const dx of[-.22,.22])for(const dz of[-.18,.18])rod(root,new T.Vector3(x+dx,.7,subjectZ+dz),new T.Vector3(x+dx*1.2,.1,subjectZ+dz*1.2),.022);}
  envelopes.push({name:'White seamless shooting bay '+(i+1),x,z:layout.back+2.9,width:layout.bayWidth+.45,depth:5.8});
 });
 const prepZ=layout.cameraZ+2.1,island=new T.Group();island.position.set(7.2,.08,prepZ);island.name='Styling and gear preparation island';root.add(island);
 box(island,2.65,.09,.86,0,.86,0,alloy,.035);for(const x of[-1.17,1.17])box(island,.085,.815,.7,x,.4075,0,matte,.015);box(island,2.4,.06,.68,0,.19,0,alloy,.02);
 for(const x of[-.65,.18]){box(island,.65,.4,.54,x,.42,0,matte,.04);for(const side of[-1,1])box(island,.035,.37,.56,x+side*.25,.42,0,silver,.005);box(island,.21,.025,.07,x,.635,0,silver,.01);}
 box(island,.53,.025,.38,.72,.925,-.06,cream,.012);for(const x of[.58,.84]){const spare=cylinder(island,.08,.16,x,1.01,-.05,matte);spare.rotation.x=Math.PI/2;}
 // Open foam-lined lens case replaces generic styling papers on the same prep surface.
 box(island,.7,.085,.46,-.76,.967,.02,matte,.025);box(island,.64,.026,.4,-.76,1.02,.02,alloyFrame,.012);box(island,.7,.4,.055,-.76,1.2,-.205,matte,.025);box(island,.62,.32,.018,-.76,1.2,-.171,alloyFrame,.015);
 for(const x of[-.95,-.69]){cylinder(island,.076,.14,x,1.105,.04,matte);cylinder(island,.078,.018,x,1.17,.04,silver);cylinder(island,.058,.012,x,1.185,.04,glass);}
 for(const x of[-.07,.12]){box(island,.11,.075,.16,x,.994,.1,matte,.012);box(island,.065,.015,.015,x,1.04,.035,silver,.002);}box(island,.32,.018,.21,.03,.96,-.19,white,.005);

 envelopes.push({name:'Styling and equipment preparation island',x:7.2,z:prepZ,width:2.8,depth:1});
 // Fitted studio joinery: a full preparation wall and a wardrobe/gear cabinet wall.
 const compact=true,bankLength=compact?3.6:4.4,bankX=layout.storageX+.2,bankZ=layout.storageZ+(compact?1.3:1);
 for(const side of[-1,1]){
  const bank=new T.Group();bank.position.set(side*bankX,.08,bankZ);bank.rotation.y=side<0?Math.PI/2:-Math.PI/2;bank.scale.x=bankLength/4.4;bank.name=side<0?'Fitted styling / preparation wall':'Fitted wardrobe / equipment storage wall';root.add(bank);
  box(bank,4.4,.13,.86,0,.065,0,matte,.015);box(bank,4.4,2.9,.11,0,1.51,-.37,alloyFrame,.02);
  for(const end of[-1,1])box(bank,.14,2.91,.87,end*2.13,1.51,0,alloyFrame,.02);
  box(bank,4.4,.13,.88,0,3.01,0,alloyFrame,.025);
  if(side<0){
   box(bank,4.12,.77,.72,0,.515,0,alloy,.02);box(bank,4.4,.09,.96,0,.95,0,cream,.025);
   for(let drawerUnit=0;drawerUnit<4;drawerUnit++){const x=-1.55+drawerUnit*1.03;for(let drawer=0;drawer<3;drawer++){const y=.28+drawer*.22;box(bank,.98,.2,.045,x,y,.39,cabinetFaces[(drawerUnit+drawer)%3],.008);box(bank,.24,.022,.035,x,y+.02,.426,matte,.005);}}
   box(bank,1.42,1.27,.08,-.7,1.93,-.28,alloy,.025);box(bank,1.26,1.1,.025,-.7,1.93,-.227,silver,.015);
   for(const y of[1.3,1.9,2.5])box(bank,1.1,.055,.62,1.16,y,-.02,cream,.012);
   box(bank,1.1,.028,.55,-.7,1.012,0,fabric,.01);box(bank,.45,.08,.33,-1.62,1.03,0,cream,.02);
  }else{
   for(const x of[-.8,.8])box(bank,.09,2.75,.76,x,1.5,0,alloy,.015);
   box(bank,1.55,.08,.76,0,.35,0,alloy,.012);rod(bank,new T.Vector3(-.7,2.55,0),new T.Vector3(.7,2.55,0),.025,silver);
   for(let i=0;i<4;i++){const x=-.5+i*.33;rod(bank,new T.Vector3(x,2.52,0),new T.Vector3(x-.2,2.32,0),.014,alloy);rod(bank,new T.Vector3(x-.2,2.32,0),new T.Vector3(x+.2,2.32,0),.014,alloy);box(bank,.38,.93,.09,x,1.85,.03,i%2?fabric:white,.03);}
   for(const side of[-1,1])for(const y of[.5,1.3,2.1]){box(bank,1.13,.065,.74,side*1.49,y-.22,0,alloy,.012);box(bank,.87,.4,.58,side*1.49,y+.03,.04,matte,.035);box(bank,.23,.025,.045,side*1.49,y+.1,.35,silver,.008);}
  }
  envelopes.push({name:side<0?'Fitted styling preparation bank':'Fitted wardrobe and gear storage bank',x:side*bankX,z:bankZ,width:1,depth:bankLength});
 }

 // Tethered capture cart: casters, trays, power pack and a neutral test-screen laptop.
 const cart=new T.Group();cart.name='Content / tethered capture and battery cart';cart.position.set(2.15,.08,.65);root.add(cart);
 for(const y of[.18,.54,1.02])box(cart,.78,.045,.64,0,y,0,matte,.025);for(const x of[-.34,.34])for(const z of[-.27,.27]){box(cart,.025,.9,.025,x,.58,z,silver,.006);const wheel=cylinder(cart,.055,.045,x,.09,z,matte);wheel.rotation.z=Math.PI/2;box(cart,.04,.07,.045,x,.135,z,silver,.008);}
 box(cart,.43,.27,.4,-.06,.337,0,matte,.03);box(cart,.17,.025,.035,-.06,.39,.217,silver,.008);for(const x of[-.2,.02]){box(cart,.14,.09,.23,x,.61,0,silver,.015);box(cart,.07,.012,.035,x,.66,.07,matte,.003);}box(cart,.49,.025,.32,0,1.057,.07,silver,.018);
 const lid=new T.Group();lid.position.set(0,1.07,-.08);lid.rotation.x=-.17;cart.add(lid);box(lid,.49,.32,.026,0,.16,0,silver,.018);box(lid,.44,.27,.012,0,.16,.02,glass,.01);box(lid,.3,.018,.04,0,0,.19,alloyFrame,.006);box(cart,.33,.012,.15,0,1.076,.1,alloyFrame,.004);
 const tetherPoints=[new T.Vector3(layout.bayCenters[1],1.63,layout.cameraZ+.11),new T.Vector3(layout.bayCenters[1],.12,layout.cameraZ+.38),new T.Vector3(2.7,.12,.95),new T.Vector3(2.55,.12,.9),new T.Vector3(2.5,1.11,.6)];root.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(tetherPoints),24,.009,6,false),matte));envelopes.push({name:'Tethered capture cart',x:2.15,z:.65,width:.9,depth:.8});
 // Dedicated podcast/video set, backdrop rolls and ordered cable route.
 const set=new T.Group();set.name='Content / interview and podcast set';set.position.set(-7.7,.08,4.2);root.add(set);
 box(set,3.75,.025,2.7,0,.03,0,new T.MeshStandardMaterial({name:'Content / acoustic floor mat',color:'#384d5c',roughness:1}),.12);
 box(set,3.8,2.25,.11,0,1.16,-1.16,matte,.025);for(let i=0;i<19;i++)box(set,.075,2.03,.13,-1.72+i*.19,1.18,-1.06,i%2?matte:alloyFrame,.008);
 box(set,2.25,.08,.85,0,.79,0,matte,.07);for(const x of[-.86,.86])box(set,.055,.74,.6,x,.39,0,silver,.015);
 for(const x of[-.7,.7]){box(set,.6,.12,.56,x,.45,.85,fabric,.07);box(set,.6,.55,.09,x,.76,1.08,matte,.06);for(const dx of[-.24,.24])for(const dz of[-.19,.19])box(set,.035,.39,.035,x+dx,.2,.85+dz,silver,.01);cylinder(set,.115,.035,x,.86,.09,matte);rod(set,new T.Vector3(x,.88,.09),new T.Vector3(x,1.2,-.08),.018,silver);box(set,.085,.23,.08,x,1.28,-.08,matte,.035);box(set,.3,.03,.2,x,.86,-.1,silver,.01);}
 envelopes.push({name:'Interview / podcast acoustic set',x:-7.7,z:4.2,width:3.9,depth:2.9});
 const rolls=new T.Group();rolls.name='Content / backdrop roll and grip bay';rolls.position.set(9.6,.08,3.7);root.add(rolls);box(rolls,.72,.1,2.1,0,.1,0,matte,.02);for(let i=0;i<4;i++){const roll=cylinder(rolls,.105,2.3,0,1.3,-.72+i*.48,i%2?white:alloy);cylinder(rolls,.055,.12,0,2.5,-.72+i*.48,matte);}box(rolls,.09,1.9,2.08,.38,1.06,0,silver,.015);envelopes.push({name:'Backdrop roll and grip bay',x:9.6,z:3.7,width:1,depth:2.2});
 const review=new T.Group();review.name='Content / close editorial review perch';review.position.set(7.4,.08,5.8);root.add(review);box(review,2.15,.08,.75,0,.96,0,matte,.04);for(const x of[-.8,.8])box(review,.065,.91,.6,x,.48,0,silver,.012);box(review,1.35,.76,.06,0,1.53,-.22,silver,.03);box(review,1.25,.66,.014,0,1.54,-.18,glass,.025);box(review,.15,.26,.05,0,1.14,-.22,silver,.01);box(review,.42,.025,.2,-.1,1.02,.17,silver,.01);envelopes.push({name:'Editorial review perch',x:7.4,z:5.8,width:2.3,depth:1});
 const cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-5.25,.11,-2),new T.Vector3(-5.25,.11,.2),new T.Vector3(-4.9,.11,.5)]),12,.012,6,false),matte);root.add(cable);
 // Production rigging and garment care are functional additions in the enlarged suite.
 for(const x of layout.bayCenters){for(const edge of[-1,1]){const sx=x+edge*(layout.bayWidth/2+.16);box(root,.07,.11,.09,sx,3.18,layout.back,alloyFrame,.012);}box(root,layout.bayWidth+.45,.08,.09,x,3.3,layout.back,alloyFrame,.015);for(let i=0;i<6;i++)box(root,.035,.15,.08,x-layout.bayWidth*.42+i*layout.bayWidth*.168,3.2,layout.back,matte,.005);}
 const reflector=new T.Group();reflector.name='Content / reversible reflector frame and grip';reflector.position.set(-6.4,.08,layout.back+2.3);root.add(reflector);stand(reflector,1.7,.38);const rim=new T.Mesh(new T.TorusGeometry(.59,.025,6,32),matte);rim.position.y=1.8;reflector.add(rim);const disc=new T.Mesh(new T.CircleGeometry(.57,32),white);disc.position.set(0,1.8,.004);reflector.add(disc);rod(reflector,new T.Vector3(-.59,1.8,0),new T.Vector3(.59,1.8,0),.012,silver);envelopes.push({name:'Reflector grip',x:-6.4,z:layout.back+2.3,width:1.25,depth:.8});
 const steamer=new T.Group();steamer.name='Content / garment steamer and folded preparation towels';steamer.position.set(-9.5,.08,1.8);root.add(steamer);box(steamer,.4,.3,.45,0,.21,0,alloy,.06);cylinder(steamer,.027,1.3,0,.94,-.1,silver);const hose=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(.15,.3,0),new T.Vector3(.35,.8,.1),new T.Vector3(.1,1.55,-.1)]),12,.022,6,false),matte);steamer.add(hose);box(steamer,.17,.1,.12,.1,1.58,-.1,matte,.025);envelopes.push({name:'Garment care steamer',x:-9.5,z:1.8,width:.8,depth:.7});
 // A physical color-check card and spare batteries sit on the capture cart shelf.
 for(let row=0;row<3;row++)for(let col=0;col<4;col++)box(cart,.05,.004,.04,-.12+col*.065,1.084,.05+row*.05,[white,cream,alloyFrame,silver][(row+col)%4],.002);
 // Connected editing bench returns and underslung cable trays retain the five seat positions.
 const editingRows=new Map<string,{x:number;z:number}[]>();for(const desk of layout.editingDesks??[]){const key=desk.z.toFixed(3),row=editingRows.get(key)??[];row.push(desk);editingRows.set(key,row);}for(const row of editingRows.values()){row.sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i],x=(a.x+b.x)/2,z=a.z-.1,w=b.x-a.x-1.72;box(root,w+.008,.12,.55,x,.92,z,matte,.018);box(root,w,.08,.18,x,.72,z-.1,alloyFrame,.012);for(const dx of[-w*.32,w*.32])box(root,.055,.81,.4,x+dx,.465,z,silver,.008);envelopes.push({name:'Connected editing worktop',x,z,width:w,depth:.55});}}
 // Ground the production, preparation and edit clusters with flush acoustic/mineral inserts.
 const productionMat=new T.MeshStandardMaterial({name:'Content / graphite production working floor',color:'#7b8c98',roughness:.98});const stageBack=layout.back-.2,stageFront=layout.cameraZ+1.1;box(root,13.6,.012,stageFront-stageBack,0,.088,(stageBack+stageFront)/2,productionMat,.025);
 const prepMat=new T.MeshStandardMaterial({name:'Content / equipment preparation floor pad',color:'#485e6b',roughness:1});box(root,4.2,.012,1.85,7.2,.088,prepZ,prepMat,.055);
 const desks=layout.editingDesks??[];if(desks.length){const lo=Math.min(...desks.map(d=>d.z))-.95,hi=Math.max(...desks.map(d=>d.z))+1.75;box(root,8.9,.01,hi-lo,0,.087,(hi+lo)/2,new T.MeshStandardMaterial({name:'Content / woven editorial neighbourhood inset',color:'#758997',roughness:1}),.06);}
 // Merge static meshes by material: equipment detail does not require hundreds of draw calls.
 root.updateMatrixWorld(true);const grouped=new Map<T.Material,T.BufferGeometry[]>();
 root.traverse(o=>{if(o instanceof T.Mesh&&!Array.isArray(o.material)){const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);const list=grouped.get(o.material)??[];list.push(geometry);grouped.set(o.material,list);o.geometry.dispose();}});
 root.clear();let triangles=0;
 for(const [material,parts] of grouped){const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(!merged)continue;const mesh=new T.Mesh(merged,material);mesh.name=material.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);triangles+=merged.attributes.position.count/3;}
 root.userData={layout,envelopes,drawCalls:grouped.size,triangles,reference:'New owner futuristic direction; original procedural production geometry',photoBayDimensions:{width:layout.bayWidth,shootDepth:5.8,cameraRun:layout.cameraZ-layout.back,photoZoneFootprint:2*(layout.bayWidth+.45)*5.8,cameraToSweepFront:layout.cameraZ-(layout.back+5.8)},captureCart:{position:[2.15,.65],tetheredTo:'right-hand photo camera',openLensCase:'on existing prep island',batteries:'prep island and cart shelf'},program:['two6m photo setups','reflector and overhead support rigging','garment care steamer','connected five-seat editing benches' ,'five editing roles in suite','gear and styling','wardrobe','backdrop roll bay','podcast/video','close review'],reservedFrontZ:5.8};
 return root;
}
