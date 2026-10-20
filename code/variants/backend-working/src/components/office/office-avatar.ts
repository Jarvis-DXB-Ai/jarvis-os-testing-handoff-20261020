import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export function createOfficeAvatar(index:number,options?:{simulation?:boolean}){
 if(options?.simulation)return createDemoAvatar(index);
 const root=new T.Group(),skin=new T.MeshStandardMaterial({color:['#c29173','#9b6f54','#e0b89a','#755443'][index%4],roughness:.7}),shirt=new T.MeshStandardMaterial({color:['#566d7a','#d8e3e5','#263848','#7e98a4'][index%4],roughness:.9}),dark=new T.MeshStandardMaterial({color:'#25303a',roughness:.85}),hair=new T.MeshStandardMaterial({color:['#312e2a','#5a4231','#1d2630'][index%3],roughness:.95});
 const box=(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material,r=.03)=>{const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,r),m);mesh.position.set(x,y,z);mesh.castShadow=true;p.add(mesh);return mesh;};
 const ball=(p:T.Object3D,r:number,x:number,y:number,z:number,m:T.Material)=>{const mesh=new T.Mesh(new T.SphereGeometry(r,10,8),m);mesh.position.set(x,y,z);mesh.castShadow=true;p.add(mesh);return mesh;};
 const hips=new T.Group();root.add(hips);const torso=box(hips,.36,.46,.24,0,.25,0,shirt,.08),head=new T.Group();head.position.y=.64;hips.add(head);ball(head,.135,0,0,0,skin);const cap=ball(head,.14,0,.055,.025,hair);cap.scale.set(1,.65,1);ball(head,.035,0,-.01,-.128,skin);
 const legs=[-1,1].map(side=>{const hip=new T.Group();hip.position.x=side*.105;hips.add(hip);box(hip,.13,.38,.14,0,-.19,0,dark);const knee=new T.Group();knee.position.y=-.38;hip.add(knee);box(knee,.115,.38,.12,0,-.19,0,dark);box(knee,.15,.09,.26,0,-.405,-.055,dark);return{hip,knee};});
 const arms=[-1,1].map(side=>{const shoulder=new T.Group();shoulder.position.set(side*.23,.43,0);hips.add(shoulder);box(shoulder,.115,.26,.13,0,-.13,0,shirt);const elbow=new T.Group();elbow.position.y=-.25;shoulder.add(elbow);box(elbow,.1,.24,.105,0,-.12,0,shirt);ball(elbow,.06,0,-.27,0,skin);return{shoulder,elbow};});
 const cup=new T.Mesh(new T.CylinderGeometry(.058,.047,.13,14),new T.MeshStandardMaterial({color:'#e4ded2',roughness:.4}));cup.position.set(0,-.28,-.025);arms[1].elbow.add(cup);cup.visible=false;
 const light=new T.MeshBasicMaterial({color:'#91b4c7',transparent:true,opacity:.8}),ring=new T.Mesh(new T.TorusGeometry(.43,.018,6,28),light);ring.rotation.x=-Math.PI/2;ring.position.y=.025;root.add(ring);
 function pose(posture:string,time:number,gesture:string|null,working:boolean){
  const sitting=posture==='desk'||posture==='sit',walking=posture==='walk',phase=time*6+index*.72,sway=Math.sin(phase),breath=Math.sin(time*1.5+index*.72);
  hips.position.y=sitting?.61:.86+(walking?Math.abs(sway)*.025:0);torso.scale.y=1+breath*.01;hips.rotation.set(0,0,walking?sway*.025:0);head.rotation.set(0,gesture==='talk'?Math.sin(time*.9+index)*.22:Math.sin(time*.35+index)*.07,0);
  legs.forEach(({hip,knee},i)=>{hip.rotation.x=sitting?1.4:walking?sway*(i?1:-1)*.4:0;knee.rotation.x=sitting?-1.4:walking?Math.max(0,Math.sin(phase+(i?0:Math.PI)))*.45:0;});
  arms.forEach(({shoulder,elbow},i)=>{shoulder.rotation.set(sitting?.3:walking?sway*(i?-1:1)*.3:0,0,i?-.07:.07);elbow.rotation.x=sitting?1.2:.1;if(working){shoulder.rotation.x=.48;elbow.rotation.x=1.08+Math.sin(time*8+i)*.035;}if(gesture==='talk'&&i===0){shoulder.rotation.x=.28+Math.sin(time*1.7+index)*.12;elbow.rotation.x=.8;}if(gesture==='think'&&i===0){shoulder.rotation.x=.8;elbow.rotation.x=1.5;}});
  cup.visible=gesture==='sip';if(cup.visible){const lift=Math.max(0,Math.sin(time*.7+index));arms[1].shoulder.rotation.x=.5+lift*.45;arms[1].elbow.rotation.x=1.2+lift*.35;head.rotation.x=-lift*.05;}
 }
 pose('desk',0,null,false);return{root,ring,light,pose};
}


/** Original life-simulation characters. The production Office keeps its existing avatar. */
function createDemoAvatar(index:number){
 const root=new T.Group();root.name='Demo character / '+index;
 const material=(color:string,roughness=.82)=>new T.MeshStandardMaterial({color,roughness});
 const skin=material(['#d8a27d','#8d5338','#efc4a1','#b97854','#624231','#be8b69'][index%6]);
 const shirt=material(['#2e8e88','#d46b54','#6376ad','#e3af49','#8e6a9e','#4e8b66','#f0e7d7','#4384ad'][index%8]);
 const trousers=material(['#283542','#384853','#6b594e','#2e4144'][index%4]);
 const hair=material(['#30241e','#6d4028','#c49651','#1d242d','#92513c','#564135'][index%6]);
 const sole=material('#eee9df'),shoe=material(index%3===0?'#a77551':'#34383e'),white=material('#f8f1e6'),iris=material(['#446751','#4a342a','#547383'][index%3]),ink=material('#292725'),lip=material('#ad6a58');
 const mesh=(p:T.Object3D,g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o;};
 const ellipsoid=(p:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,m:T.Material)=>{const o=mesh(p,new T.SphereGeometry(1,12,10),m,x,y,z);o.scale.set(sx,sy,sz);return o;};
 const rounded=(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material,r=.025)=>mesh(p,new RoundedBoxGeometry(w,h,d,2,r),m,x,y,z);
 const limb=(p:T.Object3D,r:number,length:number,m:T.Material)=>mesh(p,new T.CapsuleGeometry(r,length-r,3,8),m,0,-length/2,0);
 const hips=new T.Group();root.add(hips);const broad=.94+(index%3)*.075;
 const profile=[[.15,0],[.17,.1],[.215,.34],[.19,.41],[.08,.46]].map(([r,y])=>new T.Vector2(r*broad,y));
 const torso=mesh(hips,new T.LatheGeometry(profile,12),shirt,0,.02,0);torso.scale.z=.65;
 rounded(hips,.32*broad,.13,.22,0,.015,0,trousers,.045);
 mesh(hips,new T.CylinderGeometry(.065,.077,.11,12),skin,0,.51,0);
 const head=new T.Group();head.position.y=.69;head.scale.setScalar(.86);hips.add(head);
 ellipsoid(head,0,0,0,.148,.196,.14,skin);
 ellipsoid(head,0,-.087,-.018,.117,.112,.118,skin);
 for(const side of[-1,1]){
  ellipsoid(head,side*.148,-.015,0,.031,.052,.025,skin);
  ellipsoid(head,side*.057,.018,-.127,.037,.021,.016,white);
  ellipsoid(head,side*.057,.018,-.141,.015,.017,.008,iris);
  ellipsoid(head,side*.057,.019,-.148,.007,.011,.004,ink);
  const brow=rounded(head,.069,.013,.012,side*.057,.059,-.137,hair,.005);brow.rotation.z=side*.11;
 }
 ellipsoid(head,0,-.02,-.145,.026,.037,.035,skin);
 const mouth=rounded(head,.065,.012,.014,0,-.092,-.145,lip,.005);mouth.rotation.z=index%2?.035:-.035;
 // Six readable silhouettes: sweep, curls, bob, bun, close crop and long hair.
 const style=index%6;
 const cap=ellipsoid(head,0,.098,.012,.155,.13,.146,hair);
 if(style===0){for(let n=0;n<3;n++){const lock=ellipsoid(head,-.075+n*.06,.154,-.055,.068,.06,.1,hair);lock.rotation.z=-.35;}}
 if(style===1){for(let n=0;n<9;n++){const a=n/9*Math.PI*2;ellipsoid(head,Math.sin(a)*.105,.14+(n%2)*.026,Math.cos(a)*.09,.066,.066,.063,hair);}}
 if(style===2){ellipsoid(head,0,-.025,.067,.17,.22,.11,hair);cap.scale.y=.14;}
 if(style===3){ellipsoid(head,0,.2,.065,.09,.09,.09,hair);ellipsoid(head,0,-.015,.112,.125,.12,.05,hair);}
 if(style===4){cap.scale.set(.15,.11,.14);}
 if(style===5){ellipsoid(head,0,-.075,.09,.16,.25,.09,hair);for(const side of[-1,1])ellipsoid(head,side*.123,-.12,.025,.045,.2,.065,hair);}
 if(index%5===0){for(const side of[-1,1]){const frame=mesh(head,new T.TorusGeometry(.044,.006,4,14),ink,side*.058,.018,-.153);frame.scale.y=.69;}rounded(head,.027,.007,.01,0,.018,-.154,ink,.002);}
 // Batch static face/hair pieces by material so detail does not multiply mobile draw calls.
 const headBatches=new Map<T.Material,T.BufferGeometry[]>();
 for(const child of [...head.children]){if(!(child instanceof T.Mesh))continue;child.updateMatrix();const mat=child.material as T.Material,transformed=child.geometry.clone().applyMatrix4(child.matrix),geometry=transformed.index?transformed.toNonIndexed():transformed;if(geometry!==transformed)transformed.dispose();const bucket=headBatches.get(mat)??[];bucket.push(geometry);headBatches.set(mat,bucket);child.geometry.dispose();head.remove(child);}
 for(const [mat,parts] of headBatches){const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(geometry){const face=new T.Mesh(geometry,mat);face.castShadow=mat===hair||mat===skin;head.add(face);}}
 // Collars, placket and cuffs keep clothing legible in a close department view.
 if(index%3!==1){for(const side of[-1,1]){const collar=rounded(hips,.075,.12,.025,side*.055,.423,-.079,white,.008);collar.rotation.z=side*-.43;}rounded(hips,.012,.28,.012,0,.22,-.135,white,.003);}
 const legs=[-1,1].map(side=>{const hip=new T.Group();hip.position.x=side*.097;hips.add(hip);limb(hip,.079,.38,trousers);const knee=new T.Group();knee.position.y=-.38;hip.add(knee);limb(knee,.064,.37,trousers);rounded(knee,.145,.105,.255,0,-.39,-.053,shoe,.04);rounded(knee,.15,.025,.265,0,-.44,-.055,sole,.01);return{hip,knee};});
 const arms=[-1,1].map(side=>{const shoulder=new T.Group();shoulder.position.set(side*.212*broad,.39,0);hips.add(shoulder);limb(shoulder,.069,.25,shirt);const elbow=new T.Group();elbow.position.y=-.25;shoulder.add(elbow);limb(elbow,.051,.22,index%3===1?skin:shirt);ellipsoid(elbow,0,-.252,-.006,.048,.063,.036,skin);return{shoulder,elbow};});
 const cup=mesh(arms[1].elbow,new T.CylinderGeometry(.055,.046,.12,12),white,0,-.27,-.025);cup.visible=false;
 const light=new T.MeshBasicMaterial({color:'#8ddcc4',transparent:true,opacity:.8}),ring=mesh(root,new T.TorusGeometry(.43,.018,6,28),light,0,.025,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
 function pose(posture:string,time:number,gesture:string|null,working:boolean){
  const sitting=posture==='desk'||posture==='sit',walking=posture==='walk',phase=time*6+index*.72,sway=Math.sin(phase),breath=Math.sin(time*1.5+index*.72);
  hips.position.y=sitting?.61:.86+(walking?Math.abs(sway)*.025:0);torso.scale.y=1+breath*.012;hips.rotation.set(0,0,walking?sway*.025:breath*.007);head.rotation.set(0,gesture==='talk'?Math.sin(time*.9+index)*.22:Math.sin(time*.35+index)*.07,0);
  legs.forEach(({hip,knee},i)=>{hip.rotation.x=sitting?1.4:walking?sway*(i?1:-1)*.4:0;knee.rotation.x=sitting?-1.4:walking?Math.max(0,Math.sin(phase+(i?0:Math.PI)))*.45:0;});
  arms.forEach(({shoulder,elbow},i)=>{shoulder.rotation.set(sitting?.3:walking?sway*(i?-1:1)*.3:0,0,i?-.09:.09);elbow.rotation.x=sitting?1.2:.1;if(working){shoulder.rotation.x=.48;elbow.rotation.x=1.08+Math.sin(time*8+i)*.045;}if(gesture==='talk'&&i===0){shoulder.rotation.x=.28+Math.sin(time*1.7+index)*.12;elbow.rotation.x=.8;}if(gesture==='think'&&i===0){shoulder.rotation.x=.8;elbow.rotation.x=1.5;}});
  cup.visible=gesture==='sip';if(cup.visible){const lift=Math.max(0,Math.sin(time*.7+index));arms[1].shoulder.rotation.x=.5+lift*.45;arms[1].elbow.rotation.x=1.2+lift*.35;head.rotation.x=-lift*.05;}
 }
 pose('desk',0,null,false);return{root,ring,light,pose};
}
