import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Fixture={kind:string;x:number;z:number;width:number;depth:number};
type Owner={root:T.Object3D;kind:string;index:number};

/** Original, static furniture for the Social Media pilot. No lights or animated effects. */
export function createSocialInterior(textures:T.Texture[]){
 const texture=(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void)=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;paint(canvas.getContext('2d')!);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;textures.push(map);return map;
 };

 const weave=texture(128,128,ctx=>{ctx.fillStyle='#d5c9b7';ctx.fillRect(0,0,128,128);for(let i=0;i<128;i+=2){ctx.fillStyle=i%4?'#f5efe044':'#8b806b33';ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}});
 const carpet=texture(128,128,ctx=>{ctx.fillStyle='#b6afa2';ctx.fillRect(0,0,128,128);ctx.fillStyle='#c2baad';ctx.fillRect(0,0,64,64);ctx.fillRect(64,64,64,64);for(let i=0;i<1700;i++){const x=(i*43.37)%128,y=(i*29.71)%128;ctx.fillStyle=i%2?'#efe9dd24':'#514f4724';ctx.fillRect(x,y,.8,1.7);}ctx.fillStyle='#6c685c55';ctx.fillRect(0,0,1,128);ctx.fillRect(0,0,128,1);ctx.fillRect(64,0,1,128);ctx.fillRect(0,64,128,1);});
 const print=texture(256,384,ctx=>{ctx.fillStyle='#ede4d3';ctx.fillRect(0,0,256,384);ctx.fillStyle='#3b625b';ctx.fillRect(24,26,208,64);ctx.fillStyle='#b8785f';ctx.beginPath();ctx.arc(128,202,79,0,Math.PI*2);ctx.fill();ctx.fillStyle='#233f3c';ctx.fillRect(47,142,41,142);ctx.fillStyle='#ede4d3';ctx.fillRect(104,173,101,31);ctx.fillStyle='#314b46';ctx.font='500 17px Arial';ctx.fillText('IDEAS INTO IMPACT',25,337);});
 const board=texture(512,256,ctx=>{ctx.fillStyle='#b7aa91';ctx.fillRect(0,0,512,256);ctx.fillStyle='#243e3a';ctx.fillRect(18,15,476,34);ctx.fillStyle='#f0e9dd';ctx.font='500 17px Arial';ctx.fillText('SOCIAL / CAMPAIGN STUDIO',30,38);const names=['IDEAS','DRAFT','REVIEW','READY'];for(let c=0;c<4;c++){ctx.fillStyle='#354841';ctx.font='12px Arial';ctx.fillText(names[c],29+c*121,73);for(let r=0;r<2;r++){ctx.fillStyle=['#e9dec6','#c4d0bd','#ddb8a2'][((c+r)%3)];ctx.fillRect(26+c*121,86+r*76,103,63);ctx.fillStyle='#6b6c5c77';ctx.fillRect(35+c*121,99+r*76,72,4);ctx.fillRect(35+c*121,110+r*76,57,3);ctx.fillRect(35+c*121,120+r*76,65,3);}}});
 const material=(name:string,color:string,roughness=.85,map?:T.Texture)=>new T.MeshStandardMaterial({name,color,roughness,metalness:0,...(map?{map}:{})});
 const materials={
  wood:new T.MeshStandardMaterial({name:'Social / satin aluminium joinery',color:'#b8c5cd',roughness:.43,metalness:.62}),
  fabric:material('Social / woven ivory upholstery','#ffffff',.96,weave),
  metal:material('Social / charcoal powder coat','#28302f',.78),
  black:material('Social / black desk finish','#151919',.72),
  leather:material('Social / desk leather','#34443f',.98),
  wall:material('Social / warm mineral paint','#c9d3d8',1),
  floor:material('Social / carpet tile','#ffffff',1,carpet),
  paper:material('Social / paper and ceramic','#eee8dc',.91),
  clay:material('Social / terracotta','#7c939f',.96),
  leaf:material('Social / foliage','#42634d',1),
  leafLight:material('Social / young foliage','#6c8059',1),
  art:new T.MeshBasicMaterial({name:'Social / original campaign print',map:print}),
  board:new T.MeshBasicMaterial({name:'Social / campaign planning board',map:board}),
 };
 const owners:Owner[]=[];
 const mesh=(p:T.Object3D,geometry:T.BufferGeometry,mat:T.Material,x:number,y:number,z:number,shadow=false)=>{const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;p.add(m);return m;};
 const box=(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material,r=.015,shadow=false)=>mesh(p,new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/2,h/2,d/2)),mat,x,y,z,shadow);
 const cylinder=(p:T.Object3D,r:number,h:number,x:number,y:number,z:number,mat:T.Material)=>mesh(p,new T.CylinderGeometry(r,r,h,16),mat,x,y,z);
 const leaf=(p:T.Object3D,x:number,y:number,z:number,angle:number,size:number)=>{const m=mesh(p,new T.SphereGeometry(1,8,5),angle%2?materials.leaf:materials.leafLight,x,y,z);m.scale.set(size,.018,size*.42);m.rotation.set(.2,angle,.25);return m;};
 const plant=(p:T.Object3D,x:number,y:number,z:number,size:number)=>{cylinder(p,size*.35,size*.5,x,y+size*.25,z,materials.paper);cylinder(p,size*.31,.012,x,y+size*.51,z,materials.black);for(let i=0;i<8;i++){const a=i*2.4,h=size*(.8+(i%3)*.22),dx=Math.sin(a)*size*.24,dz=Math.cos(a)*size*.24;const stem=cylinder(p,.008,h,x+dx*.4,y+size*.5+h*.4,z+dz*.4,materials.leaf);stem.rotation.z=-dx*.65;leaf(p,x+dx,y+size*.48+h,z+dz,a,size*.32);}};
 function chair(parent:T.Object3D,x:number,z:number,angle=0){
  const g=new T.Group();g.position.set(x,.08,z);g.rotation.y=angle;parent.add(g);
  cylinder(g,.037,.28,0,.21,0,materials.metal);cylinder(g,.11,.035,0,.085,0,materials.metal);
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const spoke=box(g,.35,.035,.047,Math.sin(a)*.17,.09,Math.cos(a)*.17,materials.metal,.01);spoke.rotation.y=a-Math.PI/2;const caster=box(g,.083,.085,.055,Math.sin(a)*.335,.0425,Math.cos(a)*.335,materials.black,.02);caster.rotation.y=a;}
  const upper=new T.Group();upper.position.y=-.08;g.add(upper);
  box(upper,.58,.08,.54,0,.445,0,materials.metal,.035,true);box(upper,.55,.105,.51,0,.5,-.015,materials.fabric,.045,true);
  const back=box(upper,.56,.58,.12,0,.79,.205,materials.metal,.055,true);back.rotation.x=.09;
  const cushion=box(upper,.5,.515,.095,0,.79,.143,materials.fabric,.045,true);cushion.rotation.x=.09;
  box(upper,.42,.13,.04,0,.675,.082,materials.fabric,.02);
  for(const side of[-1,1]){box(upper,.034,.24,.04,side*.292,.6,.08,materials.metal,.01);box(upper,.064,.043,.3,side*.292,.733,-.015,materials.black,.02);box(upper,.018,.032,.32,side*.237,.5,-.015,materials.fabric,.008);}
 }
 function notebook(p:T.Object3D,x:number,y:number,z:number,angle=0){const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;p.add(g);box(g,.26,.022,.34,0,0,0,materials.clay,.008);box(g,.24,.022,.32,0,.018,0,materials.paper,.005);box(g,.26,.012,.34,0,.035,0,materials.leather,.005);box(g,.009,.014,.33,.083,.044,0,materials.black,.003);}
 function cup(p:T.Object3D,x:number,y:number,z:number){cylinder(p,.063,.125,x,y+.062,z,materials.paper);cylinder(p,.052,.008,x,y+.126,z,materials.black);const handle=mesh(p,new T.TorusGeometry(.035,.011,4,10),materials.paper,x+.067,y+.07,z);handle.rotation.y=Math.PI/2;}
 function decorateDesk(g:T.Object3D,index:number){
  owners.push({root:g,kind:'desk',index});chair(g,0,.85);
  // Slim frames, an under-desk drawer and a cable tray share the existing desk envelope.
  for(const side of[-1,1]){box(g, .045,.78,.045,side*.72,.47,-.3,materials.metal,.01,true);box(g, .045,.78,.045,side*.72,.47,.3,materials.metal,.01,true);box(g,.045,.045,.67,side*.72,.103,0,materials.metal,.008);}
  box(g,1.45,.055,.045,0,.86,-.31,materials.metal);box(g,1.15,.16,.065,0,.77,-.32,materials.black);box(g,.37,.43,.48,-.51,.62,-.04,materials.black,.025);
  for(let i=0;i<2;i++){box(g,.33,.018,.006,-.51,.6+i*.2,.206,materials.metal,.002);box(g,.13,.013,.012,-.51,.67+i*.2,.212,materials.metal,.003);}
  box(g,.83,.009,.42,.03,.989,.16,materials.leather,.018);box(g,.31,.009,.29,.5,.99,.19,materials.leather,.015);
  notebook(g,-.55,1.012,.14,(index%3-1)*.09);if(index%3!==1)cup(g,.65,1.015,.17);
  if(index%3===1){box(g,.16,.018,.1,.62,1.016,.27,materials.black,.025);box(g,.11,.003,.065,.62,1.027,.27,materials.paper,.006);}
  if(index%3===2)plant(g,.68,1.015,-.22,.22);
  if(index%3===0){cylinder(g,.075,.022,.61,1.016,-.2,materials.metal);cylinder(g,.014,.22,.61,1.13,-.2,materials.metal);mesh(g,new T.TorusGeometry(.095,.014,4,14,Math.PI),materials.black,.61,1.25,-.2);for(const side of[-1,1])box(g,.045,.09,.07,.61+side*.094,1.22,-.2,materials.leather,.02);}
 }
 function decorateFixture(parent:T.Object3D,fixture:Fixture,index:number){
  const g=new T.Group();g.position.set(fixture.x,0,fixture.z);parent.add(g);owners.push({root:g,kind:fixture.kind,index});
  if(fixture.kind==='storage'){
   box(g,3.15,.72,.6,0,.48,0,materials.wood,.025,true);box(g,3.08,.07,.58,0,.115,0,materials.metal);
   for(let i=0;i<4;i++){box(g,.75,.61,.022,-1.17+i*.78,.48,.308,materials.wood,.007);box(g,.016,.14,.024,-.86+i*.78,.53,.326,materials.metal,.003);}
   box(g,3.15,2.2,.045,0,1.95,-.26,materials.wood,.008,true);
   for(const side of[-1,1])box(g,.075,2.24,.57,side*1.54,1.95,0,materials.wood,.008,true);
   for(const y of[.86,1.25,1.65,2.05,3.03])box(g,3.15,.05,.6,0,y,0,materials.wood,.008,true);
   for(let row=0;row<4;row++)for(let n=0;n<7;n++){if(row===3)continue;const x=-1.34+n*.42,h=.22+(n%3)*.035;const b=box(g,.12,h,.21,x,.91+row*.4+h/2,.1,n%3===0?materials.leather:n%3===1?materials.paper:materials.clay,.005);b.rotation.z=n===2?.1:0;box(g,.065,.008,.007,x,.95+row*.4+h/2,.21,materials.paper,.002);}
   box(g,1.25,.68,.045,.12,2.53,.29,materials.metal,.008);box(g,1.18,.61,.008,.12,2.53,.318,materials.board,.002);
   plant(g,-1.12,2.085,.03,.22);cylinder(g,.08,.25,1.16,2.18,.03,materials.clay);
  }else if(fixture.kind==='meeting'){
   box(g,3.1,.11,1.28,0,.83,0,materials.black,.055,true);for(const side of[-1,1]){box(g,.055,.7,.85,side*1.03,.43,0,materials.metal,.012,true);for(const x of[-.83,.83])chair(g,x,side*1.24,side<0?Math.PI:0);}
   notebook(g,-.6,.91,0,.15);cup(g,.6,.89,.1);box(g,.44,.015,.31,.1,.9,-.1,materials.leather,.015);
  }else if(fixture.kind==='planter'){plant(g,0,.08,0,.75);}
 }
 function windowTrim(parent:T.Object3D,points:T.Vector3[]){
  const g=new T.Group();parent.add(g);owners.push({root:g,kind:'wall trim',index:0});
  for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],x=(a.x+b.x)/2,z=(a.z+b.z)/2,angle=-Math.atan2(b.z-a.z,b.x-a.x);const sill=box(g,a.distanceTo(b),.055,.2,x,1.13,z,materials.wood,.006);sill.rotation.y=angle;const skirting=box(g,a.distanceTo(b),.1,.17,x,.17,z,materials.metal,.004);skirting.rotation.y=angle;}
 }
 function finish(room:T.Object3D){
  room.updateWorldMatrix(true,true);const inverse=room.matrixWorld.clone().invert(),batches=new Map<string,{material:T.Material;cast:boolean;receive:boolean;parts:T.BufferGeometry[]}>();
  const bounds:{kind:string;index:number;min:number[];max:number[]}[]=[];let meshes=0,triangles=0;
  for(const owner of owners){const ownerBounds=new T.Box3();owner.root.traverse(o=>{if(!(o instanceof T.Mesh))return;const material=o.material as T.Material;if(Array.isArray(material))throw Error('Social static batch expects one material per mesh');const matrix=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld);if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();ownerBounds.union(o.geometry.boundingBox!.clone().applyMatrix4(matrix));let geometry=o.geometry.clone().applyMatrix4(matrix);if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}const key=material.uuid+':'+o.castShadow+':'+o.receiveShadow,batch=batches.get(key)??{material,cast:o.castShadow,receive:o.receiveShadow,parts:[]};batch.parts.push(geometry);batches.set(key,batch);meshes++;triangles+=geometry.attributes.position.count/3;o.geometry.dispose();});bounds.push({kind:owner.kind,index:owner.index,min:ownerBounds.min.toArray(),max:ownerBounds.max.toArray()});owner.root.removeFromParent();}
  const group=new T.Group();group.name='Social Media / batched detailed interior';room.add(group);
  for(const batch of batches.values()){const geometry=mergeGeometries(batch.parts);batch.parts.forEach(p=>p.dispose());if(!geometry)throw Error('Social interior geometry could not merge');const m=new T.Mesh(geometry,batch.material);m.name=batch.material.name||'Social / retained workstation material';m.castShadow=batch.cast;m.receiveShadow=batch.receive;group.add(m);}
  const stats={desks:owners.filter(o=>o.kind==='desk').length,unbatchedMeshes:meshes,batchMeshes:group.children.length,triangles,bounds,texturePixels:128*512+128*128*2+256*384+512*256};group.userData.detailStats=stats;return stats;
 }
 return{materials,decorateDesk,decorateFixture,windowTrim,finish};
}
