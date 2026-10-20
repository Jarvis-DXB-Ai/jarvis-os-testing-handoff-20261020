import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {officeSharedSpaces} from './office-social.mjs';
export function createOfficeCommonSpaces(label?:((title:string,subtitle:string)=>T.Texture),options?:{simulation?:boolean}){
 const demo=options?.simulation===true;
 const root=new T.Group();root.name='Shared Office commons';
 const ivory=new T.MeshStandardMaterial({color:'#dadfdd',roughness:.76}),fabric=new T.MeshStandardMaterial({color:'#748e96',roughness:1}),wood=new T.MeshStandardMaterial({color:'#9c8065',roughness:.7}),carbon=new T.MeshStandardMaterial({color:'#202d36',roughness:.6}),metal=new T.MeshStandardMaterial({color:'#a9bec8',metalness:.8,roughness:.25}),paper=new T.MeshStandardMaterial({color:'#eee7d5',roughness:.9}),green=new T.MeshStandardMaterial({color:'#41654d',roughness:.9}),warm=new T.MeshBasicMaterial({color:'#ffe4b3'});
 if(demo){ivory.color.set('#f7ebd7');fabric.color.set('#a09987');wood.color.set('#b8844f');carbon.color.set('#343b3d');metal.color.set('#d3d3c9');green.color.set('#5e913e');paper.color.set('#fff4d9');}
 const box=(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material,r=.04)=>{const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,r),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;p.add(mesh);return mesh;};
 const cylinder=(p:T.Object3D,r:number,h:number,x:number,y:number,z:number,m:T.Material)=>{const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,24),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;p.add(mesh);return mesh;};
 const chair=(p:T.Object3D,x:number,z:number,yaw:number)=>{const c=new T.Group();c.position.set(x,0,z);c.rotation.y=yaw;p.add(c);box(c,.79,.17,.74,0,.43,0,ivory,.08);box(c,.8,.56,.15,0,.72,.37,fabric,.07);for(const side of[-1,1]){box(c,.13,.28,.68,side*.4,.56,0,ivory,.06);box(c,.055,.36,.055,side*.27,.18,.23,metal,.01);box(c,.055,.36,.055,side*.27,.18,-.23,metal,.01);}return c;};
 const originalCenters:Record<string,number[]>={lounge:[8,15],coffee:[17,4],ideas:[-10,6]};
 const localSpot=(id:string,p:number[])=>{const space=officeSharedSpaces.find(s=>s.id===id)!;return [p[0]-space.center[0]+originalCenters[id][0],p[1]-space.center[1]+originalCenters[id][1]];};
 const groups=new Map<string,T.Group>();for(const space of officeSharedSpaces){const g=new T.Group();g.name='Common area / '+space.id;g.userData.spaceId=space.id;g.position.set(space.center[0]-originalCenters[space.id][0],0,space.center[1]-originalCenters[space.id][1]);root.add(g);groups.set(space.id,g);if(label){const sign=box(g,2.6,.5,.035,originalCenters[space.id][0],2.25,originalCenters[space.id][1]-.6,new T.MeshBasicMaterial({map:label(space.name.toUpperCase(),'SHARED SPACE / IDLE VISITS')}));sign.name='Shared space sign / '+space.id;} }
 const lounge=groups.get('lounge')!;
 const rug=new T.Mesh(new T.CircleGeometry(3.55,48),new T.MeshStandardMaterial({color:'#8c887a',roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.set(8,.082,15.35);lounge.add(rug);
 for(const spot of officeSharedSpaces[0].spots)chair(lounge,localSpot('lounge',spot.position)[0],localSpot('lounge',spot.position)[1],spot.rotation);
 chair(lounge,5.55,14.5,-1.85);chair(lounge,10.45,14.5,1.85);
 cylinder(lounge,1.22,.13,8,.52,14.8,wood);cylinder(lounge,.5,.46,8,.23,14.8,carbon);cylinder(lounge,.25,.22,8,.7,14.8,ivory);
 for(let i=0;i<5;i++){const leaf=new T.Mesh(new T.SphereGeometry(.21,8,6),green);leaf.scale.set(.75,.22,1.2);leaf.position.set(8+Math.sin(i*2.4)*.12,.86+i*.07,14.8+Math.cos(i*2.4)*.12);lounge.add(leaf);}
 box(lounge,.36,.025,.48,7.35,.6,14.7,paper);box(lounge,.31,.025,.4,7.4,.63,14.72,fabric);cylinder(lounge,.08,.12,8.65,.65,15.2,paper);
 // Low planted divider and an illuminated sculpture frame the cloud-facing lounge.
 for(const x of[4.9,11.1]){box(lounge,.65,.5,1.25,x,.25,15.6,ivory,.12);for(let i=0;i<4;i++){const leaf=new T.Mesh(new T.SphereGeometry(.3,8,6),green);leaf.scale.set(.8,1.4,.8);leaf.position.set(x,.75+i*.11,15.2+i*.25);lounge.add(leaf);}}
 const coffee=groups.get('coffee')!,bar=new T.Group();bar.position.set(17,0,4);bar.rotation.y=.8;coffee.add(bar);box(bar,3.8,1.02,.76,0,.51,0,wood);box(bar,3.95,.1,.9,0,1.07,0,ivory);box(bar,3.5,.025,.02,0,.82,.39,warm,.01);box(bar,.72,.63,.48,-.9,1.43,0,carbon);box(bar,.42,.17,.035,-.9,1.56,.26,metal,.01);for(const x of[-1.08,-.78])cylinder(bar,.028,.12,x,1.31,.25,metal);box(bar,.5,.03,.3,-.92,1.14,.22,metal,.01);
 for(let i=0;i<3;i++){cylinder(bar,.075,.13,.12+i*.3,1.19,.12,paper);cylinder(bar,.077,.015,.12+i*.3,1.265,.12,carbon);}box(bar,.7,.035,.4,.9,1.15,-.08,wood);cylinder(bar,.14,.025,.9,1.18,-.08,paper);
 const steam=new T.Group();steam.position.set(.12,1.29,.12);bar.add(steam);for(let i=0;i<3;i++){const puff=new T.Mesh(new T.SphereGeometry(.04,7,5),new T.MeshBasicMaterial({color:'#e7f1f0',transparent:true,opacity:.2,depthWrite:false}));puff.position.y=i*.09;steam.add(puff);}
 for(const x of[-1.2,1.2]){cylinder(bar,.012,1.2,x,2.5,0,metal);const pendant=new T.Mesh(new T.SphereGeometry(.2,12,8),warm);pendant.position.set(x,1.92,0);bar.add(pendant);}
 const ideas=groups.get('ideas')!;box(ideas,3.9,.11,1.7,-10,.84,6,wood,.13);for(const x of[-11.45,-8.55])box(ideas,.13,.78,.9,x,.39,6,metal);
 for(const spot of officeSharedSpaces[2].spots)chair(ideas,localSpot('ideas',spot.position)[0],localSpot('ideas',spot.position)[1],spot.rotation);
 chair(ideas,-10.9,4.75,Math.PI);chair(ideas,-9.1,4.75,Math.PI);
 // Shared concept-review material, not a decorative board game or live metrics.
 for(let i=0;i<4;i++){const page=box(ideas,.5,.012,.68,-11.05+i*.7,.91,6,paper,.006);page.rotation.y=(i-1.5)*.06;box(ideas,.38,.012,.08,-11.05+i*.7,.926,5.8,fabric,.004);for(let line=0;line<3;line++)box(ideas,.33-line*.045,.009,.012,-11.05+i*.7,.935,5.96+line*.09,carbon,.002);}
 box(ideas,.7,.04,.52,-8.75,.94,6.1,wood,.015);box(ideas,.55,.018,.4,-8.75,.972,6.1,paper,.004);box(ideas,.025,.015,.3,-8.65,.99,6.1,carbon,.005);
 if(demo){
  const cushion=new T.MeshStandardMaterial({color:'#e7c357',roughness:1}),coral=new T.MeshStandardMaterial({color:'#c56f59',roughness:1});
  for(const [x,z,yaw] of[[5.55,14.5,-1.85],[10.45,14.5,1.85]]){const pillow=box(lounge,.38,.32,.12,x,.77,z,coral,.07);pillow.rotation.y=yaw;}
  box(lounge,.32,.028,.42,8.55,.608,14.55,cushion,.01);box(lounge,.27,.028,.36,8.61,.639,14.55,coral,.01);
 }
 const pickables:T.Object3D[]=[];root.traverse(o=>{if(o instanceof T.Mesh){let p:T.Object3D|null=o;while(p&&!p.userData.spaceId)p=p.parent;if(p)o.userData.spaceId=p.userData.spaceId;pickables.push(o);}});
 return{root,pickables,update(time:number){steam.children.forEach((p,i)=>{p.position.y=((time*.12+i*.09)%.3);p.position.x=Math.sin(time+i)*.025;p.scale.setScalar(.65+p.position.y*2);});}};
}
