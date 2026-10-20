import * as T from 'three';

/** Reference-led, physically scaled landmark in a staged, non-surveyed Dubai setting.
 * Sources: burjkhalifa.ae/the-tower/architecture-design/ and som.com/projects/burj-khalifa/.
 * No photographic assets. Office floor is y=0, approximately 210m above the ground. */
export function createDemoDubaiSkyline(){
 const root=new T.Group();root.name='Dubai / Burj and nearby towers';
 const ground=-210,textures:T.Texture[]=[];
 const skyPixels=new Uint8Array(64*4);for(let y=0;y<64;y++){const t=y/63;skyPixels.set([198-74*t,216-51*t,222-31*t,255],y*4);}
 const sky=new T.DataTexture(skyPixels,1,64);sky.colorSpace=T.SRGBColorSpace;sky.magFilter=T.LinearFilter;sky.needsUpdate=true;textures.push(sky);
 // Floor bands and mullions repeat at approximately 4m intervals on every volume.
 const pixels=new Uint8Array(32*64*4);for(let y=0;y<64;y++)for(let x=0;x<32;x++){const frame=y%8===0||x%8===0,v=frame?156:108+Math.round(16*Math.sin(x/32*Math.PI));pixels.set([v,v+20,v+30,255],(y*32+x)*4);}
 const facade=new T.DataTexture(pixels,32,64);facade.colorSpace=T.SRGBColorSpace;facade.wrapS=facade.wrapT=T.RepeatWrapping;facade.generateMipmaps=true;facade.minFilter=T.LinearMipmapLinearFilter;facade.needsUpdate=true;textures.push(facade);
 const glazing=['#94b3c4','#819eae','#a9c2cc'].map(color=>new T.MeshStandardMaterial({color,map:facade,metalness:.25,roughness:.42,emissive:'#8faaba',emissiveIntensity:.22}));
 const silver=new T.MeshStandardMaterial({color:'#b8ccd5',metalness:.4,roughness:.36,emissive:'#9db7c4',emissiveIntensity:.16});
 // World-space storeys retain their scale across every instanced height.
 for(const material of [...glazing,silver]){
  material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 vCityPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCityPosition=(modelMatrix * instanceMatrix * vec4(position,1.0)).xyz;');
   shader.fragmentShader='varying vec3 vCityPosition;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat cityBand=step(0.085,fract((vCityPosition.y+210.0)/4.0));\nfloat cityMullion=step(0.025,fract((vCityPosition.x+vCityPosition.z)/3.2));\ndiffuseColor.rgb*=mix(0.67,1.0,cityBand*cityMullion);');
  };
  material.customProgramCacheKey=()=> 'city-storeys-028';
 }
 const pale=new T.MeshStandardMaterial({color:'#a8b4b5',roughness:.85});
 const sand=new T.MeshBasicMaterial({color:'#abb7b8'});
 // All repeated building parts share six instanced batches, including the landmark.
 type Part={x:number;y:number;z:number;w:number;h:number;d:number;angle:number};
 const batches:Part[][]=[[],[],[],[],[],[]];
 const add=(batch:number,x:number,z:number,bottom:number,w:number,h:number,d:number,angle=0)=>batches[batch].push({x,y:bottom+h/2,z,w,h,d,angle});
 const backward=new T.Vector3(-60,0,-32).normalize(),right=new T.Vector3(32,0,-60).normalize();
 const place=(depth:number,side:number)=>backward.clone().multiplyScalar(depth).addScaledVector(right,side);
 const burj=place(1280,-270),bodyHeight=610,tierHeight=bodyHeight/26;
 // A hexagonal hub and three radial lobes form a Y. Each wing steps back in turn.
 // Twenty-six contiguous tiers make the spiral legible from every camera direction.
 for(let tier=0;tier<26;tier++){
  const bottom=ground+tier*tierHeight,core=Math.max(3.1,29-tier*.95);
  add(4,burj.x,burj.z,bottom,core*2,tierHeight,core*2,Math.PI/6);
  for(let wing=0;wing<3;wing++){
   const step=Math.floor((tier+(2-wing))/3),length=Math.max(0,108-step*12.4),width=Math.max(5,49-tier*1.5);
   if(length<=0)continue;
   const a=wing*Math.PI*2/3+Math.PI/12,center=core*.4+length*.5;
   // Rounded lobes are physically joined to the core; no detached needle or cone.
   add(wing,burj.x+Math.sin(a)*center,burj.z+Math.cos(a)*center,bottom,width,tierHeight,length,a);
   add(4,burj.x+Math.sin(a)*(core*.4+length),burj.z+Math.cos(a)*(core*.4+length),bottom,width/2,tierHeight,width/2,a);
  }
 }
 // The exposed central core narrows continuously into the telescopic steel spire.
 let spireBottom=ground+bodyHeight;
 for(const [height,radius] of [[65,7],[52,5.3],[43,3.7],[32,2.3],[18,1.3],[8,.55]]){add(4,burj.x,burj.z,spireBottom,radius*2,height,radius*2);spireBottom+=height;}
 const neighbors=[];
 for(let i=0;i<24;i++){
  const side=(i%2?1:-1)*(300+(i%6)*90),depth=310+Math.floor(i/6)*165+(i%3)*35,p=place(depth,side);
  const height=200+(i*47)%121,width=38+(i*7)%24,depthSize=35+(i*11)%25,angle=(i%5)*.16;
  add(5,p.x,p.z,ground,width+12,8,depthSize+12,angle);
  const tiers=3+i%3,cap=height*.94;
  for(let j=0;j<tiers;j++){const inset=1-j*.13;add(i%3,p.x,p.z,ground+8+j*cap/tiers,width*inset,cap/tiers,depthSize*inset,angle);}
  const crown=height-cap-8;
  if(i%3===0){add(4,p.x,p.z,ground+cap+8,width*.28,crown,depthSize*.28,angle);}
  else if(i%3===1){add(3,p.x,p.z,ground+cap+8,width*.58,crown*.65,depthSize*.58,angle);add(4,p.x,p.z,ground+cap+8+crown*.65,width*.16,crown*.35,depthSize*.16,angle);}
  else{add(3,p.x,p.z,ground+cap+8,width*.6,crown,depthSize*.6,angle);}
  neighbors.push({x:p.x,z:p.z,height,width,depth:depthSize});
 }
 const box=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,12),hex=new T.CylinderGeometry(1,1,1,6),dummy=new T.Object3D();
 batches.forEach((parts,index)=>{const mesh=new T.InstancedMesh(index===4?hex:index===3?cylinder:box,index<3?glazing[index]:index===5?pale:silver,parts.length);mesh.name=index===4?'Burj hex core, rounded lobes and crowns':'Glazed city batch '+index;parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(index>=3&&index<=4?p.w/2:p.w,p.h,index>=3&&index<=4?p.d/2:p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);});
 const terrain=new T.Mesh(new T.CircleGeometry(7000,64),sand);terrain.rotation.x=-Math.PI/2;terrain.position.y=ground-.4;root.add(terrain);
 root.userData={kind:'reference-led staged Dubai',groundY:ground,burj:{height:828,setbacks:26,wings:3,core:'hexagonal',position:[burj.x,ground,burj.z],topY:618},nearbyTowers:neighbors,nearbyTowerCount:24,instancedBatches:batches.length,photographs:false};
 return {root,sky,dispose:()=>{root.traverse(object=>{if(object instanceof T.InstancedMesh)object.dispose();});textures.forEach(t=>t.dispose());}};
}
