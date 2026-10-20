import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {officeDepartments,allOfficeDepartments} from '@/lib/office-departments';
import {createOfficeCloudEnvironment} from './office-cloud-environment';
import {createOfficeInteriorMaterials} from './office-interior-materials';
import {createOfficeContentStudio} from './office-content-studio';
import {createOfficeLighting} from './office-lighting';
import type {DubaiDaylight,OfficeLightingMode} from '@/lib/office-daylight.mjs';
import {createOfficeAvatar} from './office-avatar';
import {createSocialInterior} from './office-demo-social-detail';
import {officeRoomPlan,roomPoint,roomDesk,roomExit,officeBoundary,officeArrivalPlan,arrivalCorePolygon,circulation,sharedOfficeDesk,type OfficeRoom} from './office-floor-plan.mjs';
import {demoOfficeRooms,demoRoomExit,demoRoomDesk,demoBoundary,demoPromenadePoint,demoVisitPath,demoArrivalPlan,type DemoOfficeRoom} from './office-demo-floor-plan.mjs';
import {createFutureFurniture} from './office-future-furniture';
import {planFutureProgramme} from './office-future-programme.mjs';
import {createOfficeCommonSpaces} from './office-common-spaces';
import {createOfficeSocial,officeSharedSpaces,type SocialHome,type SocialActivity} from './office-social.mjs';

export type SceneAgent={id:string;role:string;name:string;state:string;running:boolean;available?:boolean};
export type SceneRect={x:number;y:number;width:number;height:number};
export type SceneAnchor={id:string;kind:'department'|'agent'|'coo'|'space';position:T.Vector3;monitor?:T.Vector3[];monitorEnabled?:boolean};
export type SceneProjection={id:string;kind:SceneAnchor['kind'];x:number;y:number;visible:boolean;monitor?:SceneRect;body?:SceneRect};
export type OfficeScene={setCloudCardsEnabled:(enabled:boolean)=>void;setCloudsEnabled:(enabled:boolean)=>void;setLighting:(mode:OfficeLightingMode)=>void;update:(agents:SceneAgent[],selected:string|null,motion:boolean,social?:boolean)=>void;focusSpace:(id:string)=>void;focus:(department:string)=>void;zoom:(factor:number)=>void;fit:()=>void;dispose:()=>void};
const tau=Math.PI*2;
export function createOfficeScene(host:HTMLElement,onSelect:(id:string)=>void,onProject:(anchors:SceneProjection[])=>void,onZoom:(zoom:number)=>void,onSpace?:(id:string)=>void,onActivity?:(activity:SocialActivity[])=>void,options?:{comparisonCamera?:boolean;preview?:boolean;pixelRatio?:number;simulation?:boolean;onLighting?:(state:DubaiDaylight)=>void;client?:{id:string;name:string;logoUrl?:string};departmentIds?:string[]}):OfficeScene{
 const demo=options?.simulation===true;
 const locations=demo?demoOfficeRooms(officeDepartments):officeRoomPlan;
 const scene=new T.Scene();scene.background=new T.Color('#101a23');scene.fog=new T.FogExp2('#d6e4e9',.0026);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(options?.pixelRatio??Math.min(window.devicePixelRatio,1.5));if(options?.preview)renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label',options?.client?'Interactive 3D '+options.client.name+' office':'Interactive 3D Jarvis headquarters');
 if(options?.preview)renderer.debug.onShaderError=(gl,program,_vertex,fragment)=>{const message=gl.getProgramInfoLog(program)||gl.getShaderInfoLog(fragment)||'Shader compilation failed';host.dataset.officeRenderError=message;console.error('Office fixture shader compilation failed:',message);};
 const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.05);scene.environment=env.texture;room.dispose();pmrem.dispose();
 const camera=new T.PerspectiveCamera(options?.comparisonCamera?64:58,1,.1,1200);camera.position.set(36,48,56);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.8,0);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=7;controls.maxDistance=180;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.18;controls.enablePan=true;if(demo){controls.rotateSpeed=.35;controls.zoomSpeed=.45;controls.panSpeed=.4;controls.screenSpacePanning=false;controls.maxPolarAngle=Math.PI*.43;}
 const hemi=new T.HemisphereLight('#e7f5ff','#4a5a68',1.15);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff1df',2.5);sun.position.set(-22,38,26);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-46,right:46,top:46,bottom:-46,near:1,far:150});sun.shadow.bias=-.0003;sun.shadow.normalBias=.04;scene.add(sun);scene.add(sun.target);
 const fill=new T.DirectionalLight('#c6e8ff',1.3);fill.position.set(24,18,-28);scene.add(fill);
 const white=new T.MeshPhysicalMaterial({color:'#e4e9e9',roughness:.25,metalness:.14,clearcoat:.65});
 const pearl=new T.MeshPhysicalMaterial({color:'#b9c8cd',roughness:.2,metalness:.28,clearcoat:.9});
 const carbon=new T.MeshStandardMaterial({color:'#202d36',metalness:.62,roughness:.38});
 const chrome=new T.MeshStandardMaterial({color:'#a9bec8',metalness:.85,roughness:.2});
 const blackDesk=demo?new T.MeshStandardMaterial({name:'Demo matte black desk',color:'#111315',roughness:.6,metalness:.22}):carbon;
 const imacSilver=demo?new T.MeshStandardMaterial({name:'Demo iMac aluminium',color:'#d1d5d8',roughness:.27,metalness:.8}):chrome;
 const glass=new T.MeshPhysicalMaterial({color:'#b0d6e4',transparent:true,opacity:.15,roughness:.12,metalness:.08,side:T.DoubleSide,depthWrite:false});
 const light=new T.MeshBasicMaterial({color:'#e7f1f5'}),gold=new T.MeshBasicMaterial({color:'#cfdee5'});
 const foliage=new T.MeshStandardMaterial({color:'#426650',roughness:.85});
 if(demo){
  white.color.set('#f4eddd');white.roughness=.78;white.metalness=0;white.clearcoat=.08;
  pearl.color.set('#fff3dc');pearl.metalness=0;pearl.clearcoat=.08;
  carbon.color.set('#343b3d');carbon.roughness=.7;carbon.metalness=.12;
  chrome.color.set('#d3d3c9');chrome.metalness=.5;chrome.roughness=.42;
  foliage.color.set('#5e913e');foliage.roughness=1;
 }
 const peopleRoot=new T.Group();scene.add(peopleRoot);
 const anchors:SceneAnchor[]=[],pickables:T.Object3D[]=[],screens:T.MeshBasicMaterial[]=[],actorParts=new Map<string,ReturnType<typeof createOfficeAvatar>>(),socialHomes=new Map<string,SocialHome>(),socialController=createOfficeSocial(socialHomes,demo?{visitPath:demoVisitPath}:undefined);
 const textures:T.Texture[]=[];const futureKit=createFutureFurniture(textures),futureProgrammes=new Map<string,NonNullable<ReturnType<typeof planFutureProgramme>>>(),contentRoleSet=new Set(officeDepartments.find(d=>d.id==='content')!.roles);
 const composer=new EffectComposer(renderer,new T.WebGLRenderTarget(1,1,{samples:Math.min(4,renderer.capabilities.maxSamples)}));composer.setPixelRatio(options?.pixelRatio??Math.min(window.devicePixelRatio,1.25));const renderPass=new RenderPass(scene,camera),ao=new SSAOPass(scene,camera,512,512,12),outputPass=new OutputPass();ao.kernelRadius=.85;ao.minDistance=.001;ao.maxDistance=.055;composer.addPass(renderPass);composer.addPass(ao);composer.addPass(outputPass);
 // Preview-only instrumentation: actual pass costs and rendered-frame intervals.
 const profilePasses:Record<string,{calls:number;triangles:number;cpuMs:number}>={};
 if(options?.preview)for(const [name,pass]of [['beauty',renderPass],['ssao',ao],['output',outputPass]] as const){const draw=pass.render.bind(pass);const instrumented:typeof pass.render=(...args)=>{const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles,start=performance.now();draw(...args);profilePasses[name]={calls:renderer.info.render.calls-calls,triangles:renderer.info.render.triangles-triangles,cpuMs:performance.now()-start};};pass.render=instrumented;}
 const rawProfileGl=options?.preview?renderer.getContext():null,profileGl=rawProfileGl&&'createQuery' in rawProfileGl?rawProfileGl as WebGL2RenderingContext:null,profileTimer=profileGl?.getExtension('EXT_disjoint_timer_query_webgl2');
 let profileQuery:WebGLQuery|null=null,profileQueryKey='',profileKey='',profileLast=0,profileFrames=0;
 let profileCpu:number[]=[],profileIntervals:number[]=[],profileGpu:number[]=[];
 const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:null;};
 const sceneCost=()=>{const counts:Record<string,{objects:number;triangles:number;shadowTriangles:number}>={};scene.updateMatrixWorld(true);const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));scene.traverse(o=>{if(!(o instanceof T.Mesh)||!o.visible)return;let category='static';for(let parent:T.Object3D|null=o;parent;parent=parent.parent){if(!parent.visible)return;if(parent===peopleRoot)category='actors';if(parent===clouds.root)category='clouds';}if(category==='static'&&(Array.isArray(o.material)?o.material.some(m=>m.transparent):o.material.transparent))category='transparent';if(!frustum.intersectsObject(o))return;const n=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof T.InstancedMesh?o.count:1),bucket=counts[category]??{objects:0,triangles:0,shadowTriangles:0};bucket.objects++;bucket.triangles+=n;if(o.castShadow)bucket.shadowTriangles+=n;counts[category]=bucket;});return counts;};
 const oak=new T.MeshStandardMaterial({color:'#9c8065',roughness:.68}),fabric=new T.MeshStandardMaterial({color:'#657784',roughness:.94}),stone=new T.MeshStandardMaterial({color:'#adb9bd',roughness:.53}),paper=new T.MeshStandardMaterial({color:'#eee7d5',roughness:.9});
 if(demo){oak.color.set('#b8844f');oak.roughness=.88;fabric.color.set('#4d9c94');stone.color.set('#eee5d5');stone.roughness=.92;paper.color.set('#fff4d9');}
 const textileCanvas=document.createElement('canvas');textileCanvas.width=textileCanvas.height=128;const textileContext=textileCanvas.getContext('2d')!;textileContext.fillStyle=demo?'#e4ddcd':'#78878d';textileContext.fillRect(0,0,128,128);for(let i=0;i<128;i+=2){textileContext.strokeStyle=demo?(i%4?'#f4efe3':'#c8c0ad'):(i%4?'#869599':'#65777e');textileContext.beginPath();textileContext.moveTo(i,0);textileContext.lineTo(i,128);textileContext.stroke();textileContext.strokeStyle=demo?'#93867130':'#53687140';textileContext.beginPath();textileContext.moveTo(0,i);textileContext.lineTo(128,i);textileContext.stroke();}const textileTexture=new T.CanvasTexture(textileCanvas);textileTexture.wrapS=textileTexture.wrapT=T.RepeatWrapping;textileTexture.repeat.set(9,9);textileTexture.colorSpace=T.SRGBColorSpace;textures.push(textileTexture);const rug=new T.MeshStandardMaterial({map:textileTexture,roughness:1,color:'#c9d1d1'});


 const interior=createOfficeInteriorMaterials(textures),baseFloor=interior.floor;
 white.color.set(interior.wall);white.roughness=.8;white.metalness=0;white.clearcoat=.05;
 pearl.color.set('#c9d2d8');pearl.roughness=.8;pearl.metalness=0;pearl.clearcoat=.05;
 stone.color.set(interior.wall);stone.roughness=.88;oak.name='Office / satin aluminium cabinetry';oak.map=null;oak.roughnessMap=null;oak.bumpMap=null;oak.bumpScale=0;oak.roughness=.43;oak.metalness=.62;oak.color.set(interior.joinery);fabric.color.set(interior.upholstery);chrome.color.set('#9ba8b1');chrome.metalness=.72;chrome.roughness=.36;glass.color.set('#b5c5c6');
 glass.ior=1.48;glass.clearcoat=1;glass.envMapIntensity=1.1;glass.opacity=demo?.09:.12;
 const keyboardTexture=(()=>{const c=document.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#23313a';ctx.fillRect(0,0,256,96);ctx.fillStyle='#697982';for(let r=0;r<4;r++)for(let col=0;col<13;col++)ctx.fillRect(7+col*19,7+r*20,15,15);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;})();
 const keys=new T.MeshStandardMaterial({map:keyboardTexture,roughness:.72});

 const box=(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material,r=.07)=>{const m=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,r),mat);m.position.set(x,y,z);m.castShadow=!(mat instanceof T.MeshPhysicalMaterial&&mat.transparent);m.receiveShadow=true;parent.add(m);return m;};
 const sphere=(parent:T.Object3D,r:number,x:number,y:number,z:number,mat:T.Material)=>{const m=new T.Mesh(new T.SphereGeometry(r,12,8),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
 const cylinder=(parent:T.Object3D,r:number,h:number,x:number,y:number,z:number,mat:T.Material)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,h,r>.3?32:r>.12?20:10),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const tube=(parent:T.Object3D,points:T.Vector3[],r:number,mat:T.Material,closed=false)=>{const curve=new T.CatmullRomCurve3(points,closed);const m=new T.Mesh(new T.TubeGeometry(curve,points.length*5,r,6,closed),mat);parent.add(m);return m;};
 function labelTexture(text:string,sub='',width=1024,height=256){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d')!;ctx.fillStyle='#15252e';ctx.fillRect(0,0,width,height);ctx.fillStyle='#e2f1f8';ctx.font='500 68px Arial';ctx.textAlign='center';ctx.fillText(text,width/2,height*.46);ctx.fillStyle='#89afc3';ctx.font='26px Arial';ctx.fillText(sub,width/2,height*.76);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;textures.push(texture);return texture;}
 function screenTexture(index:number,role?:string){if(demo&&role)return futureKit.roleScreen(role);const c=document.createElement('canvas');c.width=512;c.height=320;const ctx=c.getContext('2d')!;ctx.fillStyle='#0c1b26';ctx.fillRect(0,0,512,320);ctx.fillStyle='#436477';ctx.fillRect(20,20,472,20);const palette=['#8cbed2','#adbaa7','#a3a8c9','#cebea6'];for(let i=0;i<6;i++){const x=20+(i%3)*161,y=65+Math.floor(i/3)*121;ctx.fillStyle=palette[(index+i)%4];ctx.fillRect(x,y,145,92);ctx.fillStyle='#172d3b';if(index%3===0){for(let j=0;j<5;j++)ctx.fillRect(x+10+j*25,y+76-(j*13+index*7)%57,16,((j*13+index*7)%57)+4);}else if(index%3===1){ctx.beginPath();ctx.arc(x+72,y+44,29,0,tau);ctx.fill();}else{ctx.fillRect(x+12,y+14,120,10);ctx.fillRect(x+12,y+34,95,6);ctx.fillRect(x+12,y+50,110,6);}}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;textures.push(texture);return texture;}
 const boundary=(a:number):number[]=>{if(!demo)return officeBoundary(a);return demoBoundary(a);};
 // One continuously connected, asymmetrical scalloped floor — no rectangular platform.
 const outline:T.Vector3[]=[];const shape=new T.Shape();for(let i=0;i<=128;i++){const a=i/128*tau,[x,z]=boundary(a);outline.push(new T.Vector3(x,.03,z));if(i===0)shape.moveTo(x,-z);else shape.lineTo(x,-z);}shape.closePath();
 const clouds=createOfficeCloudEnvironment(outline);scene.add(clouds.root);clouds.ready.then(()=>{host.dataset.cloudAssets='ready';profileKey='';}).catch(error=>{host.dataset.cloudAssets='error: '+String(error);});
 const renderAO=ao.render.bind(ao);ao.render=(...args)=>{const visible=clouds.volume.visible;clouds.volume.visible=false;try{renderAO(...args);}finally{clouds.volume.visible=visible;}};
 const lighting=createOfficeLighting(scene,renderer,{sun,fill,hemi,strip:light,warm:gold},options?.onLighting);
 const slab=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.22,bevelThickness:.12}),baseFloor);slab.rotation.x=-Math.PI/2;slab.position.y=-.48;slab.receiveShadow=true;scene.add(slab);tube(scene,outline.slice(0,-1),.045,light,true);
 // Broad continuous promenades connect inward-facing doors. Centre remains open around the COO.
 if(!demo)for(const offset of [-1.1,1.1]){const w=circulation.halfWidth+offset,h=circulation.halfDepth+offset;const corners=[[-w,-h],[w,-h],[w,h],[-w,h]];const pts=corners.flatMap((p,i)=>Array.from({length:12},(_,n)=>{const q=corners[(i+1)%4],t=n/12;return new T.Vector3(p[0]+(q[0]-p[0])*t,.07,p[1]+(q[1]-p[1])*t);}));tube(scene,pts,.022,gold,true);}
 if(demo){for(const scale of [.965,1.035]){const points=Array.from({length:128},(_,i)=>{const p=demoPromenadePoint(i/128*tau);return new T.Vector3(p[0]*scale,.075,p[1]*scale);});tube(scene,points,.025,gold,true);}}
 if(!demo)for(const loc of locations){const door=new T.Vector3(0,0,loc.front);door.applyAxisAngle(new T.Vector3(0,1,0),loc.angle).add(new T.Vector3(loc.x,0,loc.z));tube(scene,[new T.Vector3(Math.sign(loc.x)*11.5,.065,loc.z),new T.Vector3(door.x,.065,door.z)],.026,light);}
 const inlay=new T.MeshStandardMaterial({name:'Office / flush aluminium circulation inlay',color:'#7e919c',roughness:.6,metalness:.4});
 for(const side of[-1,1])tube(scene,[[side*1.2,27.8],[side*1.2,8],[side*2.7,5.4],[side*2.7,-7.9],[side*7.2,-8.6]].map(([x,z])=>new T.Vector3(x,.07,z)),.012,inlay);
 // Shared sculpted ceiling ribbons, suspended above circulation without hiding the cutaway.
 if(!demo)for(let band=0;band<2;band++){const pts=Array.from({length:50},(_,i)=>{const x=-30+i/49*60;return new T.Vector3(x,5.5+Math.sin(i/49*Math.PI)*.5,-32+band*3+Math.sin(x*.12)*2);});tube(scene,pts,.2,white);tube(scene,pts.map(p=>new T.Vector3(p.x,p.y-.17,p.z)),.035,light);}
 // Rear panorama glass, slim mullions, ribbed cores and floating ceiling ribbons.
 const backPoints=Array.from({length:40},(_,i)=>{const a=Math.PI/2+i/39*Math.PI,[x,z]=boundary(a);return new T.Vector3(x,5.1,z);});
 tube(scene,backPoints,.055,chrome);tube(scene,backPoints.map(p=>new T.Vector3(p.x,5.14,p.z)),.018,light);
 for(let i=0;i<backPoints.length-1;i++){const a=backPoints[i],b=backPoints[i+1],distance=a.distanceTo(b);const m=box(scene,distance,4.8,.035,(a.x+b.x)/2,2.5,(a.z+b.z)/2,glass,.01);m.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);if(i%3===0)box(scene,.085,5,.085,a.x,2.5,a.z,carbon,.01);}
 for(const x of [-30,30]){const g=new T.Group();g.position.set(x,0,-16);scene.add(g);box(g,1.15,5,1.6,0,2.5,0,carbon,.25);for(let i=0;i<12;i++)box(g,.035,4.8,.07,-.48+i*.087,2.5,.84,chrome,.01);}
 function tree(parent:T.Object3D,x:number,z:number,scale=1){const g=new T.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);cylinder(g,.43,.62,0,.31,0,stone);cylinder(g,.36,.025,0,.63,0,carbon);cylinder(g,.055,1.55,0,1.35,0,oak);for(let i=0;i<7;i++){const a=i*2.4,h=1.65+(i%3)*.28,dx=Math.sin(a)*.37,dz=Math.cos(a)*.37;tube(g,[new T.Vector3(0,h-.45,0),new T.Vector3(dx*.55,h-.2,dz*.55),new T.Vector3(dx,h,dz)],.024,oak);for(let j=0;j<4;j++){const leaf=sphere(g,.17,dx+Math.sin(j*2.3)*.16,h+j*.065,dz+Math.cos(j*2.3)*.16,foliage);leaf.scale.set(1.25,.3,.65);leaf.rotation.z=a*.3;}}}
 // COO desk is a working centre, with a low backdrop and clear surrounding aisles.
 const cooBoard=box(scene,3.6,1.05,.1,0,2.25,-2.1,new T.MeshBasicMaterial({map:labelTexture(options?.client?options.client.name.toUpperCase()+' / COO':'JARVIS / COO','OPERATIONS / REVIEW / PLANNING')}));cooBoard.userData.role='coo';pickables.push(cooBoard);anchors.push({id:'coo',kind:'coo',position:new T.Vector3(0,3.5,1.9)});
 for(const x of[-1.55,1.55])box(scene,.055,1.7,.055,x,.95,-2.1,chrome,.01);
 const doors:{leaves:T.Group[];position:T.Vector3;open:number}[]=[];
 const deskPositions=new Map<string,{position:T.Vector3;rotation:number;index:number;exit:T.Vector3[];monitor?:T.Vector3[]}>();
 function workstation(parent:T.Object3D,x:number,z:number,role:string,index:number,yaw=0,detail?:ReturnType<typeof createSocialInterior>){if(demo&&parent.userData.room&&!parent.userData.curvedPlan){x+=(index%3-1)*.19;z+=((index*7)%5-2)*.16;}const g=new T.Group();g.position.set(x,0,z);if(demo&&parent.userData.curvedPlan)g.rotation.y=yaw;if(demo&&parent.userData.room&&!parent.userData.curvedPlan)g.rotation.y=(index%5-2)*.035;g.name=demo?'Demo black desk / iMac / '+role:'Workstation / '+role;parent.add(g);box(g,1.72,.12,.9,0,.92,0,demo?blackDesk:index%4===0?oak:white,.12);if(!detail){box(g,.1,.87,.65,-.67,.45,0,demo?blackDesk:chrome);box(g,.1,.87,.65,.67,.45,0,demo?blackDesk:chrome);}const keyboard=box(g,.44,.028,.18,0,1.005,.26,carbon,.015);keyboard.name='Keyboard and desk accessories';const keyFace=new T.Mesh(new T.PlaneGeometry(.42,.16),keys);keyFace.rotation.x=-Math.PI/2;keyFace.position.set(0,1.021,.26);g.add(keyFace);let monitor:T.Mesh|undefined;const screenMaterial=new T.MeshBasicMaterial({map:screenTexture(index,role)});screens.push(screenMaterial);if(demo){box(g,.36,.025,.24,0,1.005,-.23,imacSilver,.035);const stand=box(g,.13,.24,.045,0,1.13,-.27,imacSilver,.015);stand.rotation.x=-.18;const computer=box(g,1.08,.69,.055,0,1.56,-.25,imacSilver,.035);computer.name='iMac all-in-one / '+role;monitor=computer;box(g,1.005,.56,.012,0,1.595,-.215,carbon,.022);box(g,.965,.522,.013,0,1.595,-.206,screenMaterial,.015);box(g,1.005,.086,.014,0,1.26,-.213,imacSilver,.014);sphere(g,.009,0,1.866,-.211,carbon);box(g,.17,.015,.23,.48,1.015,.26,imacSilver,.05);}else{box(g,.035,.22,.035,0,1.1,-.18,chrome);box(g,.9,.56,.06,0,1.42,-.22,carbon,.04);box(g,.81,.47,.015,0,1.43,-.18,screenMaterial,.015);}box(g,.14,.02,.1,.49,1.003,.28,carbon,.01);if(!detail){if(!contentRoleSet.has(role))futureKit.chair(g,0,.88);else{cylinder(g,.055,.38,0,.26,.88,chrome);box(g,.53,.12,.5,0,.48,.85,fabric,.1);box(g,.53,.61,.09,0,.78,1.04,fabric,.09);for(let i=0;i<5;i++){const a=i*tau/5;const spoke=box(g,.36,.04,.04,Math.sin(a)*.18,.07,.88+Math.cos(a)*.18,chrome,.01);spoke.rotation.y=-a+Math.PI/2;sphere(g,.055,Math.sin(a)*.35,.055,.88+Math.cos(a)*.35,carbon);}}if(index%3===0){cylinder(g,.075,.13,.57,1.06,.1,paper);box(g,.3,.025,.35,-.49,1.008,.23,paper,.015);box(g,.03,.012,.28,-.43,1.03,.22,chrome,.005);}if(index%4===0){box(g,.2,.012,.35,-.55,1.06,-.2,carbon,.018);cylinder(g,.14,.2,.69,1.07,-.21,stone);sphere(g,.15,.69,1.27,-.21,foliage);}
 if(index%3===0){box(g,.035,.36,.035,-.7,1.15,-.28,chrome,.01);const taskLamp=box(g,.34,.045,.17,-.62,1.36,-.25,pearl,.035);taskLamp.rotation.z=-.16;box(g,.28,.015,.12,-.62,1.332,-.25,gold,.01);tube(g,[new T.Vector3(-.7,1,-.28),new T.Vector3(-.75,.68,-.28),new T.Vector3(-.5,.18,-.28)],.009,carbon);}
 if(contentRoleSet.has(role))for(const arm of [-1,1]){box(g,.045,.25,.045,arm*.3,.61,.88,chrome,.01);box(g,.065,.045,.3,arm*.3,.75,.83,carbon,.025);}
}
 detail?.decorateDesk(g,index);if(!contentRoleSet.has(role)){const dept=allOfficeDepartments.find(d=>d.roles.includes(role));futureKit.tools(g,dept?.id??'arrival',index);}else futureKit.contentTools(g,role);
 g.updateWorldMatrix(true,false);const room=parent.userData.room as OfficeRoom|undefined,exit=room?(demo?demoRoomExit(room as DemoOfficeRoom,x,z):roomExit(room,x,z)).map(p=>new T.Vector3(p[0],0,p[1])):(parent.userData.exit??[]).map((p:number[])=>new T.Vector3(p[0],0,p[1]));deskPositions.set(role,{position:g.localToWorld(new T.Vector3(0,0,.79)),rotation:parent.rotation.y+g.rotation.y,index,exit,...(demo&&monitor?{monitor:(()=>{monitor.geometry.computeBoundingBox();const b=monitor.geometry.boundingBox!;return Array.from({length:8},(_,i)=>monitor!.localToWorld(new T.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z)));})()}:{} )});}

 // Work-specific review kits use the already reserved bench/table footprint.
 // Nothing here depicts live results or changes the actual task/agent state.
 function activityKit(parent:T.Object3D,id:string,x:number,z:number,width=3.1,surfaceHeight=width>3.5?.898:.885){
  const kit=new T.Group();kit.name='Department activity kit / '+id;kit.position.set(x,surfaceHeight-.91,z);parent.add(kit);
  const model=(w:number,h:number,d:number,a:number,y:number,b:number,m:T.Material)=>box(kit,w,h,d,a,y,b,m,.015);
  const panel=(text:string,a:number,b:number,w=1.1)=>{const p=model(w,.65,.045,a,1.45,b,new T.MeshBasicMaterial({map:labelTexture(text,'WORKING REFERENCES')}));p.rotation.x=-.13;model(.045,.46,.16,a,1.08,b,chrome);model(.45,.035,.28,a,.92,b,carbon);};
  if(id==='social'){
   panel('CONCEPT / REVIEW',0,-.35,Math.min(2.5,width-.4));
   for(let i=0;i<3;i++){model(.4,.018,.56,-.7+i*.7,.923,.16,paper);model(.33,.014,.28,-.7+i*.7,.943,.07,i%2?fabric:oak);}
   model(.45,.04,.34,width/2-.42,.94,.1,carbon);
  }
  if(id==='design'){
   model(Math.min(2.3,width-.3),.022,.85,-.25,.925,0,new T.MeshStandardMaterial({color:'#47635d',roughness:1}));
   for(let i=0;i<5;i++)model(.2,.012,.32,-.95+i*.32,.947,-.15,[paper,fabric,oak,stone,carbon][i]);
   model(1.65,.025,.04,-.25,.95,.31,chrome);for(const a of[-.95,.82]){const roll=cylinder(kit,.065,.58,a,.99,.1,paper);roll.rotation.x=Math.PI/2;}
   model(.55,.28,.54,width/2-.48,1.05,-.04,carbon);model(.46,.025,.02,width/2-.48,1.08,.24,chrome);model(.38,.008,.31,width/2-.48,.97,.36,paper);
  }
  if(id==='web'){
   panel('DESKTOP / RESPONSIVE',-.48,-.34,1.35);
   const tablet=model(.55,.74,.035,.72,1.3,-.18,carbon);tablet.rotation.x=-.18;model(.47,.64,.018,.72,1.31,-.14,new T.MeshBasicMaterial({map:screenTexture(16)}));
   model(.23,.45,.035,1.22,1.15,.14,carbon);model(.18,.34,.018,1.22,1.17,.164,paper);model(.5,.018,.24,-.48,.94,.26,carbon);
   model(.8,.16,.42,-width/2+.55,1.01,.05,carbon);for(let i=0;i<4;i++)model(.08,.025,.012,-width/2+.3+i*.15,1.04,.27,chrome);
  }
  if(id==='ads'){
   panel('IDEA / CREATIVE / REVIEW',0,-.35,Math.min(2.5,width-.4));
   for(let i=0;i<3;i++){const page=model(.51,.025,.61,-.77+i*.77,.94,.16,paper);page.rotation.y=(i-1)*.08;model(.4,.012,.25,-.77+i*.77,.96,.06,i%2?fabric:oak);}
  }
  if(id==='email'){
   panel('SEQUENCE / PROOF / CHECK',0,-.35,Math.min(2.5,width-.4));
   for(let i=0;i<4;i++){model(.36,.018,.57,-.84+i*.56,.929,.17,paper);model(.29,.012,.11,-.84+i*.56,.944,.05,carbon);model(.29,.012,.18,-.84+i*.56,.945,.23,fabric);}
  }
  if(id==='support'){
   panel('SUPPORT / HANDOFF',0,-.35,1.4);
   for(const a of[-.95,.95]){model(.34,.025,.22,a,.925,.1,carbon);model(.025,.35,.025,a,1.1,.1,chrome);const band=new T.Mesh(new T.TorusGeometry(.15,.022,8,24,Math.PI),carbon);band.position.set(a,1.29,.1);kit.add(band);for(const side of[-1,1])model(.075,.14,.065,a+side*.15,1.25,.1,fabric);}
  }
  if(id==='finance'){
   for(let i=0;i<3;i++){model(.55,.055,.78,-.76+i*.74,.95+i*.012,0,i%2?carbon:oak);model(.45,.015,.64,-.76+i*.74,.988+i*.012,0,paper);}
   model(.28,.055,.4,width/2-.3,.95,.12,carbon);for(let i=0;i<3;i++)model(.2,.009,.02,width/2-.3,.985,.02+i*.07,chrome);
   model(1.7,.17,.05,0,1.18,-.45,new T.MeshBasicMaterial({map:labelTexture('FINANCE','REVIEW / ARCHIVE')}));for(const a of[-.7,.7])model(.025,.2,.025,a,1.02,-.45,chrome);
  }
 }
 // Graphic Design is a material/layout workshop, with fitted storage and a shared proofing bench.
 function designWorkplace(parent:T.Object3D,x:number,z:number,width=8.8){
  const g=new T.Group();g.name='Graphic Design / fitted layout and materials review';g.position.set(x,.08,z);parent.add(g);
  const ink=new T.MeshStandardMaterial({name:'Design / forest pinboard',color:'#3d5148',roughness:1}),brass=new T.MeshStandardMaterial({name:'Design / brushed aluminium pulls',color:'#aebbc5',roughness:.46,metalness:.6});
  const w=width,centre=w-2,modules=4,moduleWidth=(w-.24)/modules;
  const frame=oak.clone();frame.name='Design / darker joinery edges';frame.color.set('#8f9da6');frame.roughness=.9;const faces=[oak,oak.clone(),oak.clone()];faces[1].name='Design / pale aluminium flat files';faces[1].color.set('#dae0e4');faces[2].name='Design / satin graphite flat files';faces[2].color.set('#bec9d0');
  box(g,w,.12,1.42,0,.09,0,carbon,.02);box(g,w,.08,1.6,0,.91,0,stone,.025);
  box(g,w,2.75,.16,0,1.44,-.69,frame,.025);box(g,w+.08,.15,.92,0,2.86,-.35,frame,.025);
  for(const side of[-1,1]){const sx=side*(w/2-.4);box(g,.8,2.69,.82,sx,1.47,-.31,frame,.025);box(g,.65,1.18,.035,sx,1.73,.125,ink,.008);for(const y of[1.14,1.77,2.4])box(g,.68,.045,.75,sx,y,-.27,stone,.01);}
  for(let i=0;i<modules;i++){const a=-w/2+.12+moduleWidth*(i+.5);box(g,moduleWidth-.035,.72,1.3,a,.5,0,oak,.02);
   if(i<2)for(let drawer=0;drawer<5;drawer++){const y=.22+drawer*.13;box(g,moduleWidth-.13,.115,.055,a,y,.678,faces[(i+drawer)%3],.01);for(const side of[-1,1])box(g,.23,.018,.04,a+side*moduleWidth*.28,y+.01,.725,brass,.005);}
   else{box(g,moduleWidth-.12,.64,.055,a,.51,.68,white,.012);box(g,.025,.25,.045,a-moduleWidth*.34,.53,.727,brass,.006);}
  }
  box(g,centre-.2,1.42,.055,0,2.01,-.575,ink,.012);box(g,centre-.12,.045,.19,0,1.28,-.51,brass,.008);
  for(const side of[-1,1]){const board=new T.Group();board.position.set(side*centre*.24,1.99,-.51);g.add(board);box(board,centre*.39,1.06,.035,0,0,0,paper,.008);box(board,centre*.31,.71,.014,0,.07,.03,new T.MeshBasicMaterial({map:screenTexture(side<0?4:8)}),.004);box(board,centre*.3,.055,.012,0,-.4,.03,ink,.003);}
  box(g,centre-.15,.035,.14,0,2.72,-.42,light,.008);box(g,centre-.5,.025,.95,0,.97,.1,ink,.01);
  for(const side of[-1,1]){const sheet=box(g,1.25,.018,.68,side*1.15,.996,.12,paper,.006);sheet.rotation.y=side*.06;box(g,1.02,.012,.27,side*1.15,1.013,-.025,side<0?fabric:oak,.005);}
  box(g,1.8,.025,.045,0,1.013,.59,brass,.005);
  parent.userData.designWorkshop={bench:{x,z,width,depth:1.6},storage:'flat files / cupboards / open display',deskCount:5};
  host.dataset.designWorkshop=JSON.stringify(parent.userData.designWorkshop);
 }
 // Demo rooms share one authored faceted footprint with the desks and walking routes.
 function curvedRoom(loc:DemoOfficeRoom,index:number,d:typeof officeDepartments[number]){
  const detail=d.id==='social'?createSocialInterior(textures):undefined;
  const g=new T.Group();g.position.set(loc.x,0,loc.z);g.rotation.y=loc.angle;g.userData.departmentId=d.id;g.userData.room=loc;g.userData.curvedPlan=true;g.name='Curved perimeter suite / '+d.id;scene.add(g);
  const local=(p:number[])=>{const dx=p[0]-loc.x,dz=p[1]-loc.z;return new T.Vector3(Math.cos(loc.angle)*dx-Math.sin(loc.angle)*dz,0,Math.sin(loc.angle)*dx+Math.cos(loc.angle)*dz);};
  const accent=stone;
  const carpet=baseFloor;
  const polygon=new T.Shape();loc.polygon.forEach((p,i)=>{const q=local(p);if(i===0)polygon.moveTo(q.x,-q.z);else polygon.lineTo(q.x,-q.z);});polygon.closePath();const floor=new T.Mesh(new T.ShapeGeometry(polygon),carpet);floor.rotation.x=-Math.PI/2;floor.position.y=.08;floor.receiveShadow=true;g.add(floor);
  const segment=(a:T.Vector3,b:T.Vector3,height:number,y:number,material:T.Material,thickness=.12)=>{const mesh=box(g,a.distanceTo(b),height,thickness,(a.x+b.x)/2,y,(a.z+b.z)/2,material,.025);mesh.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);return mesh;};
  const outer=loc.outer.map(local),inner=loc.inner.map(local);
  for(let i=0;i<outer.length-1;i++){
   const a=outer[i],b=outer[i+1];segment(a,b,.98,.57,accent,.16);segment(a,b,.08,1.1,white,.18);segment(a,b,1.94,2.12,glass,.035);segment(a,b,.04,3.13,chrome,.055);
   if(i%3===0)box(g,.055,3.05,.055,a.x,1.6,a.z,detail?.materials.metal??chrome,.01);
  }
  detail?.windowTrim(g,outer);
  // Shared radial partitions meet the curved facade. No extra rectangular room shell.
  for(const edge of(index===0?[0,1]:[1])){const i=edge?outer.length-1:0,a=outer[i],b=inner[edge?inner.length-1:0];segment(a,b,1.05,.6,stone,.16);segment(a,b,.08,1.17,white,.18);segment(a,b,1.8,2.1,glass,.035);segment(a,b,.04,3.1,chrome,.055);}
  for(const arc of loc.fronts){const points=arc.map(local);for(let i=0;i<points.length-1;i++){segment(points[i],points[i+1],1.35,.79,glass,.025);segment(points[i],points[i+1],.035,1.48,chrome,.045);segment(points[i],points[i+1],.06,1.1,white,.04);}}
  const entry=new T.Group();const door=local(loc.door);entry.position.copy(door);entry.rotation.y=loc.doorAngle-loc.angle;g.add(entry);const leaves:T.Group[]=[];
  for(const side of[-1,1]){box(entry,.08,3.2,.12,side*(loc.doorWidth/2+.05),1.62,0,chrome,.02);const leaf=new T.Group();leaf.name='Sliding curved-suite entry / '+d.id;leaf.userData.side=side;entry.add(leaf);box(leaf,loc.doorWidth/2-.04,3,.035,side*loc.doorWidth/4,1.57,0,glass,.01);box(leaf,.035,3,.04,side*.015,1.57,0,chrome,.01);box(leaf,.035,.45,.07,side*.13,1.15,.045,chrome,.01);leaves.push(leaf);}
  const sign=box(entry,3.6,.55,.075,0,3.6,0,new T.MeshBasicMaterial({map:labelTexture(d.name.toUpperCase(),'JARVIS / TEAM SPACE')}),.025);sign.userData.department=d.id;pickables.push(sign);box(entry,loc.doorWidth+.2,.04,.5,0,.11,0,chrome,.02);doors.push({leaves,position:new T.Vector3(loc.door[0],0,loc.door[1]),open:0});
  const roles=[d.headRoleId,d.qaRoleId,...d.roles.filter(r=>r!==d.headRoleId&&r!==d.qaRoleId)];roles.forEach((role,i)=>{const desk=demoRoomDesk(loc,i);workstation(g,desk.x,desk.z,role,index*9+i,desk.angle,detail);});
  if(d.id==='content'){const studio=createOfficeContentStudio({back:loc.back+2.8,bayCenters:[-3.6,3.6],bayWidth:6,cameraZ:loc.back+9.6,storageX:9.5,storageZ:loc.back+6.9,editingDesks:loc.desks},textures,interior);g.add(studio);host.dataset.contentStudio=JSON.stringify({...studio.userData,usableArea:loc.area,expansion:loc.productionExpansion,desks:loc.desks});}
  if(d.id!=='content'){const programme=futureKit.programme(g,loc);futureProgrammes.set(d.id,programme);host.dataset.futureProgrammes=JSON.stringify([...futureProgrammes.values()]);}
  if(d.id==='content'){
  const wallIndex=Math.floor((outer.length-1)/2),wallA=outer[wallIndex],wallB=outer[wallIndex+1],wallMid=wallA.clone().add(wallB).multiplyScalar(.5),inward=new T.Vector3(-wallMid.x,0,-wallMid.z).normalize();
  let artAngle=-Math.atan2(wallB.z-wallA.z,wallB.x-wallA.x);if(new T.Vector3(Math.sin(artAngle),0,Math.cos(artAngle)).dot(inward)<0)artAngle+=Math.PI;
  const normal=new T.Vector3(Math.sin(artAngle),0,Math.cos(artAngle)),art=new T.Group(),artWidth=Math.min(1.2,wallA.distanceTo(wallB)-.25);art.position.copy(wallMid).addScaledVector(normal,.16);art.position.y=1.95;art.rotation.y=artAngle;if(d.id==='content')g.add(art);box(art,artWidth,.9,.06,0,0,0,detail?.materials.wood??oak,.02);box(art,artWidth-.12,.76,.015,0,0,.04,detail?.materials.art??new T.MeshBasicMaterial({map:screenTexture(index+10)}),.01);
  }
  if(detail)host.dataset.demoSocialDetail=JSON.stringify(detail.finish(g));
  g.updateWorldMatrix(true,false);anchors.push({id:d.id,kind:'department',position:g.localToWorld(new T.Vector3(0,4.1,0))});
 }
 locations.forEach((loc,index)=>{const d=officeDepartments.find(d=>d.id===loc.id)!;if(options?.departmentIds&&!options.departmentIds.includes(d.id))return;if(demo){curvedRoom(loc as DemoOfficeRoom,index,d);return;}const g=new T.Group();g.position.set(loc.x,0,loc.z);g.rotation.y=loc.angle;g.userData.departmentId=d.id;g.userData.room=loc;g.name='Department room / '+d.id;scene.add(g);
  const roomAccent=demo?new T.MeshStandardMaterial({name:'Demo painted accent / '+d.id,color:['#5c9e98','#cc866a','#8b89ae','#7096b0','#c1a05c','#77996b','#ae7c92','#7b9e94'][index],roughness:1}):stone;
  const roomRug=baseFloor;
  box(g,loc.halfWidth*2-(demo?.8:.4),.025,loc.front-loc.back-(demo?.75:.35),0,.07,(loc.front+loc.back)/2,roomRug,.12);
  // Full-height side partitions, an open cutaway ceiling and a two-leaf sliding entry.
  for(const side of [-1,1]){
   box(g,.035,3.1,loc.front-loc.back,side*loc.halfWidth,1.6,(loc.front+loc.back)/2,glass,.01);
   if(demo){box(g,.16,1.05,loc.front-loc.back,side*loc.halfWidth,.56,(loc.front+loc.back)/2,stone,.025);box(g,.18,.07,loc.front-loc.back,side*loc.halfWidth,1.12,(loc.front+loc.back)/2,demo?white:carbon,.015);}
   box(g,.09,.12,loc.front-loc.back,side*loc.halfWidth,3.22,(loc.front+loc.back)/2,chrome,.025);
   for(const z of [loc.back,0,loc.front])box(g,.06,3.15,.06,side*loc.halfWidth,1.6,z,chrome,.01);
   const width=loc.halfWidth-loc.doorWidth/2;
   box(g,width,3.1,.035,side*(loc.doorWidth/2+width/2),1.6,loc.front,glass,.01);
   box(g,width,.06,.035,side*(loc.doorWidth/2+width/2),1.1,loc.front,pearl,.01);
   box(g,.09,3.2,.1,side*loc.doorWidth/2,1.6,loc.front,chrome,.025);
  }
  box(g,loc.halfWidth*2,3.1,.035,0,1.6,loc.back,glass,.01);
  if(demo){
   // A painted rear wall, white skirting and framed prints anchor each cutaway room.
   box(g,loc.halfWidth*2,2.7,.16,0,1.39,loc.back,roomAccent,.025);
   box(g,loc.halfWidth*2,.12,.2,0,.15,loc.back+.03,white,.012);
   for(const side of[-1,1]){const art=new T.Group();art.position.set(side*(loc.halfWidth-1.15),1.8,loc.back+.13);g.add(art);box(art,1.2,1.5,.075,0,0,0,oak,.02);box(art,1.06,1.36,.018,0,0,.05,paper,.005);const disc=sphere(art,.32,-.14,.2,.07,roomAccent);disc.scale.z=.045;box(art,.63,.36,.025,.17,-.31,.08,foliage,.02);}
  }
  box(g,loc.halfWidth*2,.1,.12,0,3.22,loc.back,chrome,.025);
  for(const x of [-loc.halfWidth,0,loc.halfWidth])box(g,.06,3.15,.06,x,1.6,loc.back,chrome,.01);
  const entrySign=box(g,3.8,.55,.055,0,3.65,loc.front,new T.MeshBasicMaterial({map:labelTexture(d.name.toUpperCase(),demo?'JARVIS / TEAM SPACE':'DEPARTMENT / '+String(index+1).padStart(2,'0'))}),.025);entrySign.userData.department=d.id;pickables.push(entrySign);
  box(g,loc.halfWidth*2,.13,.18,0,3.25,loc.front,white,.04);box(g,loc.halfWidth*2-.2,.025,.06,0,3.17,loc.front,light,.01);
  const leaves:T.Group[]=[];
  for(const side of [-1,1]){const leaf=new T.Group();leaf.name='Sliding doorway / '+d.id;leaf.userData.side=side;g.add(leaf);box(leaf,loc.doorWidth/2-.06,3,.035,side*loc.doorWidth/4,1.57,loc.front-.06,glass,.01);box(leaf,.035,3,.045,side*.015,1.57,loc.front-.06,chrome,.01);box(leaf,.03,.42,.065,side*.13,1.15,loc.front+.025,chrome,.01);box(leaf,loc.doorWidth/2-.06,.045,.025,side*loc.doorWidth/4,1.1,loc.front-.035,pearl,.01);leaves.push(leaf);}
  g.updateWorldMatrix(true,false);doors.push({leaves,position:g.localToWorld(new T.Vector3(0,0,loc.front)),open:0});
  box(g,loc.doorWidth+.4,.035,.5,0,.09,loc.front,chrome,.02);
  // A small head/QA huddle table sits outside the desk rows, away from the door.
  if(d.id!=='design'){box(g,1,.08,.8,-5.8,.85,2.4,demo?blackDesk:oak,.12);box(g,.12,.8,.5,-5.8,.42,2.4,chrome,.02);}
  if(!['content','design'].includes(d.id)){
  const board=box(g,4,1.05,.08,0,2.05,loc.back+.12,new T.MeshBasicMaterial({map:labelTexture(d.name.toUpperCase(),'DEPARTMENT HEAD / SPECIALISTS / QUALITY')}),.05);board.userData.department=d.id;pickables.push(board);
  const workboard=box(g,2.4,1.2,.07,5.3,demo?1.65+(index%3)*.15:1.8,-3.7,new T.MeshBasicMaterial({map:screenTexture(index+10)}),.03);workboard.rotation.y=-.45;
  }
  const roles=[d.headRoleId,d.qaRoleId,...d.roles.filter(r=>r!==d.headRoleId&&r!==d.qaRoleId)];roles.forEach((role,i)=>{const desk=roomDesk(i,d.id);workstation(g,desk.x,desk.z,role,index*9+i);});
  if(d.id==='content'){const studio=createOfficeContentStudio({back:loc.back+.65,bayCenters:[-3.5,3.5],bayWidth:4.6,cameraZ:loc.back+6,storageX:6.55,storageZ:loc.back+7.2},textures,interior);g.add(studio);host.dataset.contentStudio=JSON.stringify(studio.userData);g.updateWorldMatrix(true,false);anchors.push({id:d.id,kind:'department',position:g.localToWorld(new T.Vector3(0,4.1,1))});return;}
  if(d.id==='design'){designWorkplace(g,0,loc.back+1.3);tree(g,-5.8,-3.8,.7);tree(g,5.7,4.5,.7);g.updateWorldMatrix(true,false);anchors.push({id:d.id,kind:'department',position:g.localToWorld(new T.Vector3(0,4.1,1))});return;}
  box(g,4.2,.12,1.1,1.45,.84,loc.back+1.1,oak,.04);box(g,4.05,.72,.95,1.45,.42,loc.back+1.1,stone,.025);activityKit(g,d.id,1.45,loc.back+1.1,4.2);
  // Low storage, tactile acoustic slats and a suspended light track frame each working bay.
  box(g,2.1,.67,.45,-3.4,.42,-3.28,oak,.045);for(let drawer=0;drawer<3;drawer++){box(g,.63,.55,.035,-4.08+drawer*.69,.43,-3.03,pearl,.02);box(g,.18,.018,.025,-4.08+drawer*.69,.57,-3,chrome,.007);}
  for(let slat=0;slat<9;slat++)box(g,.045,2.15,.065,-4.6+slat*.1,1.23,-3.5,oak,.01);
  box(g,3.8,.08,.25,0,4.3,-.4,carbon,.04);box(g,3.6,.018,.18,0,4.252,-.4,light,.015);for(const hanger of [-1.6,1.6])box(g,.018,1.1,.018,hanger,4.85,-.4,chrome,.005);
  tree(g,-6.05,-3.8,demo?.62+(index%3)*.06:.7);tree(g,5.7,4.5,demo?.58+(index%4)*.06:.7);if(demo){const notes=new T.Group();notes.position.set(4.8,0,2.6);notes.rotation.y=index*.17;g.add(notes);box(notes,.8,.025,.6,0,.085,0,rug,.02);for(let n=0;n<2+index%3;n++){const sheet=box(g,.24,.012,.31,-4.9+n*.18,.91,2.3+n*.1,paper,.008);sheet.rotation.y=(n-1)*.17;}if(index%2===0){box(g,1.1,.43,.42,4.9,.28,4.3,fabric,.09);box(g,.5,.025,.6,4.2,.08,4.1,rug,.02);}}g.updateWorldMatrix(true,false);anchors.push({id:d.id,kind:'department',position:g.localToWorld(new T.Vector3(0,4.1,1))});
  const studio=new T.Group();if(demo)studio.position.x=-1.8;g.add(studio);
  if(d.id==='web'){const rack=box(g,.72,1.7,.55,5.55,.95,-1.8,carbon,.06);rack.rotation.y=-.2;for(let row=0;row<6;row++){box(g,.61,.025,.02,5.55,.48+row*.2,-1.51,chrome,.005);sphere(g,.025,5.32,.53+row*.2,-1.49,light);}}
  if(d.id==='finance'){box(g,1.4,1.05,.42,-4.1,.6,-2,oak,.04);for(let i=0;i<5;i++)box(g,.14,.38,.25,-4.65+i*.24,1.32,-2,i%2?paper:carbon,.01);}
  if(d.id==='design'){for(let i=0;i<3;i++)box(g,.58,.8,.03,-3.6+i*.7,1.65,-3.8,new T.MeshBasicMaterial({map:screenTexture(i+1)}),.015);}
 });
 // Modelled COO workstation and curved command console inside the shared pavilion.
 workstation(scene,0,1.9,'coo',72);
 const consoleCurve=Array.from({length:32},(_,i)=>{const a=-1.12+i/31*2.24;return new T.Vector3(Math.sin(a)*2.8,.95,Math.cos(a)*2.05);});tube(scene,consoleCurve,.16,white);tube(scene,consoleCurve.map(p=>new T.Vector3(p.x,p.y-.12,p.z)),.02,light);
 for(const side of [-1,1]){const display=box(scene,.95,.57,.08,side*1.65,1.45,1.64,new T.MeshBasicMaterial({map:screenTexture(20+side)}),.03);display.rotation.y=side*.45;box(scene,.06,.75,.45,side*2.45,.43,1.1,chrome,.02);}
 // Registered Operations and Research occupy identifiable, route-aware work pods.
 allOfficeDepartments.filter(d=>!officeDepartments.some(main=>main.id===d.id)).forEach(dept=>{
  dept.roles.filter(role=>role!=='coo').forEach((role,i)=>{const seat=sharedOfficeDesk(dept.id,i),g=new T.Group();g.position.set(seat.x,0,seat.z);g.userData.exit=seat.exit;g.name='Shared team desk / '+dept.id+' / '+role;scene.add(g);workstation(g,0,0,role,80+i);});

 });
 const coreRoot=new T.Group();coreRoot.name='Operations / Research distinct work pods';scene.add(coreRoot);const coreProgramme=futureKit.core(coreRoot);coreRoot.children.forEach((pod,i)=>pod.traverse(o=>{if(o instanceof T.Mesh){o.userData.department=coreProgramme[i].id==='research'?'knowledge':'operations';pickables.push(o);}}));host.dataset.futureCore=JSON.stringify(coreProgramme);
 // Shared eight-place review room, between research shelves and the team pods.
 const review=new T.Group();review.name='Shared planning and review / eight places';review.position.z=-13;scene.add(review);
 box(review,7.2,.12,2.15,0,.84,0,blackDesk,.12);for(const x of[-2.8,2.8])box(review,.16,.73,1.25,x,.445,0,carbon,.025);
 for(const side of[-1,1])for(const x of[-2.7,-.9,.9,2.7]){futureKit.chair(review,x,side*1.72,side>0?0:Math.PI);futureKit.paper(review,x,.91,side*.6,.38,.26,2);}
 futureKit.display(review,'operations',0,2.2,-3.23,3.95,1.6);
 box(review,4.2,1.85,.11,0,2.2,-3.3,carbon,.05);box(review,3.95,1.6,.018,0,2.2,-3.235,new T.MeshBasicMaterial({map:labelTexture('SHARED REVIEW','BRIEFS / CONCEPTS / QUALITY')}),.025);for(const x of[-1.7,1.7])box(review,.055,1.7,.055,x,.95,-3.3,chrome,.01);
 for(const side of[-1,1]){box(review,.5,.6,6.2,side*5.35,.38,-.7,oak,.045);box(review,.52,.06,6.22,side*5.35,.71,-.7,stone,.015);for(let n=0;n<5;n++){cylinder(review,.14,.2,side*5.35,.84,-3+n*1.15,stone);sphere(review,.23,side*5.35,1.1,-3+n*1.15,foliage);}}
 // Client reference library: built-in shelves and a review table on the connected floor.
 const library=new T.Group();library.position.set(demo?5.8:6.5,0,-19);library.rotation.y=demo?0:-.28;scene.add(library);
 box(library,4.2,2.9,.35,0,1.5,0,carbon,.08);
 for(let row=0;row<3;row++){box(library,4,.08,.55,0,.5+row*.8,.15,chrome);for(let col=0;col<11;col++){const book=box(library,.22,.46+(col%3)*.05,.32,-1.75+col*.34,.8+row*.8,.17,col%3?white:pearl,.015);book.rotation.z=(col%4===0)?.1:0;}}
 const librarySign=box(library,3.6,.65,.06,0,3.2,.2,new T.MeshBasicMaterial({map:labelTexture('LIBRARY','REFERENCES / INSPIRATION / KNOWLEDGE')}));librarySign.userData.spaceId='library';pickables.push(librarySign);
 anchors.push({id:'space:library',kind:'space',position:new T.Vector3(demo?5.8:6.5,4.3,-19)});

 futureKit.paper(library,-1.1,.62,.2,.4,.28,3);futureKit.device(library,1.1,.57,.1,.36,.48,'research');
 // Dedicated arrival: lifts, check-in, waiting and a clear central entry aisle.

 {
  const liftSteel=new T.MeshStandardMaterial({name:'Arrival / brushed lift steel',color:'#aeb7b6',roughness:.42,metalness:.6});
  const plan=demo?demoArrivalPlan():officeArrivalPlan(),lobby=new T.Group();lobby.name='Curved arrival / reception / lifts / office entry';scene.add(lobby);
  const floorShape=new T.Shape();plan.polygon.forEach((p,i)=>{if(i===0)floorShape.moveTo(p[0],-p[1]);else floorShape.lineTo(p[0],-p[1]);});floorShape.closePath();const lobbyFloor=new T.Mesh(new T.ShapeGeometry(floorShape),baseFloor);lobbyFloor.rotation.x=-Math.PI/2;lobbyFloor.position.y=.085;lobbyFloor.receiveShadow=true;lobby.add(lobbyFloor);
  const curvedPieces=(points:number[][],height:number,y:number,depth:number,material:T.Material)=>{for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],m=box(lobby,Math.hypot(b[0]-a[0],b[1]-a[1])+.035,height,depth,(a[0]+b[0])/2,y,(a[1]+b[1])/2,material,.025);m.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);}};
  const coreMaterial=new T.MeshStandardMaterial({name:'Arrival / engineered mineral structural core',color:'#c6cfd4',roughness:.85});
  const coreShape=new T.Shape();plan.core.forEach((p,i)=>i?coreShape.lineTo(p[0],-p[1]):coreShape.moveTo(p[0],-p[1]));coreShape.closePath();const core=new T.Mesh(new T.ExtrudeGeometry(coreShape,{depth:3.7,bevelEnabled:false}),coreMaterial);core.rotation.x=-Math.PI/2;core.position.y=.08;core.castShadow=true;core.receiveShadow=true;core.name='Lift core / continuous to actual arrival facade';lobby.add(core);host.dataset.arrivalCore=JSON.stringify(plan.core);
  const receptionFixture=plan.fixtures.find(f=>f.kind==='receptionDesk')!,receptionBack=[receptionFixture.position[0]+Math.sin(receptionFixture.angle)*1.8,receptionFixture.position[1]+Math.cos(receptionFixture.angle)*1.8],servicePolygon=arrivalCorePolygon(plan.polygon,{position:receptionBack,angle:receptionFixture.angle+Math.PI,width:5.6});
  const serviceShape=new T.Shape();servicePolygon.forEach((p,i)=>i?serviceShape.lineTo(p[0],-p[1]):serviceShape.moveTo(p[0],-p[1]));serviceShape.closePath();const service=new T.Mesh(new T.ExtrudeGeometry(serviceShape,{depth:1.12,bevelEnabled:false}),oak);service.rotation.x=-Math.PI/2;service.position.y=.08;service.castShadow=service.receiveShadow=true;service.name='Fitted reception service joinery / joined to facade';lobby.add(service);

  // A continuous fitted perimeter plinth and aluminium dado connect reception, core and waiting.
  curvedPieces(plan.outer,1.1,.63,.25,oak);curvedPieces(plan.outer,.1,1.22,.32,stone);
  curvedPieces(plan.outer,3.05,1.65,.035,glass);curvedPieces(plan.outer,.1,3.2,.12,white);curvedPieces(plan.outer,.12,.18,.16,white);
  for(const arc of plan.fronts){curvedPieces(arc,2.9,1.55,.035,glass);curvedPieces(arc,.1,3.03,.12,carbon);curvedPieces(arc,.055,1.05,.05,white);}
  const entrance=new T.Group();entrance.position.set(plan.entry.position[0],0,plan.entry.position[1]);lobby.add(entrance);
  for(const panel of plan.entry.leaves){const side=panel.side;box(entrance,.08,3.05,.13,side*plan.entry.width/2,1.58,0,carbon,.02);const leaf=new T.Group();leaf.position.x=panel.center;entrance.add(leaf);box(leaf,panel.width,2.9,.035,0,1.55,0,glass,.01);box(leaf,.04,.55,.075,-side*.67,1.2,-.05,chrome,.01);box(entrance,.24,1,.24,side*2.3,.58,-.5,carbon,.03);box(entrance,.15,.1,.08,side*2.3,1.1,-.58,light,.01);}
  box(entrance,4.7,.55,.07,0,3.5,0,new T.MeshBasicMaterial({map:labelTexture(options?.client?options.client.name.toUpperCase():'JARVIS OFFICE','WELCOME / DEPARTMENTS AHEAD')}),.025);
  // A fitted curved counter and black iMac desk follow the left arrival bay.
  curvedPieces(plan.counter,1.08,.64,.4,oak);curvedPieces(plan.counter,.12,1.23,.57,blackDesk);curvedPieces(plan.counter,.035,.28,.42,gold);
  const middle=plan.counter[Math.floor(plan.counter.length/2)],before=plan.counter[Math.floor(plan.counter.length/2)-1],counterSign=new T.Group();counterSign.position.set(middle[0],.76,middle[1]);counterSign.rotation.y=-Math.atan2(middle[1]-before[1],middle[0]-before[0])+Math.PI;lobby.add(counterSign);box(counterSign,2.8,.45,.045,0,0,.25,new T.MeshBasicMaterial({map:labelTexture('RECEPTION','WELCOME / CHECK IN')}),.02);
  futureKit.device(counterSign,-.65,.56,0,.25,.4,'arrival');futureKit.paper(counterSign,.55,.56,.04,.4,.26,2);
  for(const fixture of plan.fixtures){const group=new T.Group();group.position.set(fixture.position[0],0,fixture.position[1]);group.rotation.y=fixture.angle;lobby.add(group);
   if(fixture.kind==='receptionDesk'){
    workstation(group,0,0,'demo-reception',99);futureKit.books(group,-1.7,1.18,1.42,5);futureKit.paper(group,1.2,1.18,1.42,.48,.3,3);
    box(group,5.5,.14,.8,0,.14,1.45,carbon,.02);box(group,5.5,.86,.72,0,.64,1.45,oak,.03);box(group,5.6,.09,.86,0,1.11,1.45,stone,.025);
    box(group,5.6,1.87,.18,0,2.09,1.76,oak,.02);for(const x of[-2.45,2.45])box(group,.5,1.8,.64,x,2.02,1.45,oak,.02);
    box(group,4.5,.78,.04,0,2.13,1.63,new T.MeshBasicMaterial({map:labelTexture('JARVIS OFFICE','RECEPTION / CREATIVE OPERATIONS')}),.015);
    for(const side of[-1,1]){box(group,1.75,.045,.44,side*1.38,1.5,1.43,stone,.01);box(group,.025,.21,.04,side*1.38,.7,1.07,chrome,.005);}
   }
   if(fixture.kind==='planter')tree(group,0,0,.8);
   if(fixture.kind==='waitingTable'){box(group,fixture.width-.1,.09,fixture.depth-.1,0,.52,0,blackDesk,.1);box(group,.24,.43,.4,0,.26,0,carbon,.025);box(group,.4,.025,.29,-.25,.58,0,paper,.01);}
   if(fixture.kind==='lifts'){
    group.name='Facade-aligned cutaway elevator bank';for(const side of[-1,1])for(let i=0;i<10;i++)box(group,.035,3.1,.05,side*3.22,1.78,.85+i*.012,chrome,.006);box(group,7.2,.18,1.9,0,.18,0,stone,.08);box(group,7.2,.35,1.8,0,3.55,0,stone,.06);box(group,7.2,.95,.13,0,.62,-.82,stone,.025);
    for(const x of[-3.5,0,3.5])box(group,.18,3.3,1.8,x,1.8,0,stone,.03);
    for(const x of[-1.75,1.75]){box(group,2.8,3.05,.1,x,1.77,.78,carbon,.025);for(const side of[-1,1])box(group,1.22,2.8,.075,x+side*.63,1.69,.85,liftSteel,.02);box(group,.022,2.8,.015,x,1.69,.9,carbon,.003);box(group,.65,.22,.035,x,3.36,.86,new T.MeshBasicMaterial({map:labelTexture('50','ARRIVAL')}),.01);}
    box(group,.22,.4,.065,0,1.35,.94,carbon,.02);sphere(group,.045,0,1.43,.99,light);sphere(group,.045,0,1.27,.99,gold);box(group,4.4,.55,.07,0,4.1,0,new T.MeshBasicMaterial({map:labelTexture('ELEVATORS','JARVIS / ARRIVAL')}),.025);
   }
  }
  // The banquette and glazing share the same curved arrival geometry.
  curvedPieces(plan.waiting,.32,.3,.65,oak);curvedPieces(plan.waiting,.17,.5,.82,fabric);curvedPieces(plan.waitingBack,.98,.62,.22,oak);curvedPieces(plan.waitingBack,.5,.82,.13,fabric);
  for(let i=0;i<plan.waiting.length;i+=3){const p=plan.waiting[i],r=Math.hypot(...p);tube(lobby,[new T.Vector3(p[0]*(1-.3/r),.592,p[1]*(1-.3/r)),new T.Vector3(p[0]*(1+.3/r),.592,p[1]*(1+.3/r))],.008,chrome);}
  host.dataset.futureArrival=JSON.stringify({features:['engineered50th-level lifts','tablet/leaflet check-in on retained counter','fitted back service storage','segmented comfortable waiting banquette','clear central wayfinding'],newFloorFootprint:false});
  for(const x of[-1.25,1.25])tube(lobby,[new T.Vector3(x,.105,29),new T.Vector3(x,.105,41.5)],.02,gold);
 }
 const commons=createOfficeCommonSpaces(labelTexture,{simulation:demo},futureKit);scene.add(commons.root);pickables.push(...commons.pickables);host.dataset.futureCommons=JSON.stringify(commons.root.userData.programme);
 officeSharedSpaces.forEach(space=>anchors.push({id:'space:'+space.id,kind:'space',position:new T.Vector3(space.center[0],2.85,space.center[1])}));
 // Consolidate only static architecture/furniture. Moving doors, people, steam and
 // cloud instances keep their own identity. Pick semantics survive each batch.
 scene.updateMatrixWorld(true);
 const excluded=new Set<T.Object3D>([peopleRoot,clouds.root,...doors.flatMap(d=>d.leaves)]),pickSet=new Set(pickables);
 const staticGroups=new Map<string,{material:T.Material;cast:boolean;receive:boolean;data:Record<string,unknown>;pick:boolean;objects:T.Mesh[]}>();
 scene.traverse(o=>{
  if(!(o instanceof T.Mesh)||o instanceof T.InstancedMesh||Array.isArray(o.material))return;
  for(let p:T.Object3D|null=o;p;p=p.parent)if(excluded.has(p))return;
  if(o.material.transparent&&!(o.material instanceof T.MeshPhysicalMaterial))return;
  const data={...(o.userData.department?{department:o.userData.department}:{}),...(o.userData.role?{role:o.userData.role}:{}),...(o.userData.spaceId?{spaceId:o.userData.spaceId}:{})};
  const pick=pickSet.has(o),key=[o.material.uuid,o.castShadow,o.receiveShadow,pick,JSON.stringify(data)].join(':');
  let group=staticGroups.get(key);if(!group){group={material:o.material,cast:o.castShadow,receive:o.receiveShadow,data,pick,objects:[]};staticGroups.set(key,group);}group.objects.push(o);
 });
 let batchedObjects=0;
 for(const group of staticGroups.values()){
  if(group.objects.length<2)continue;
  const parts=group.objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(!merged)continue;
  const mesh=new T.Mesh(merged,group.material);mesh.name='Static office batch / '+group.material.name;mesh.castShadow=group.cast;mesh.receiveShadow=group.receive;mesh.userData=group.data;scene.add(mesh);
  for(const o of group.objects){o.removeFromParent();const index=pickables.indexOf(o);if(index>=0)pickables.splice(index,1);o.geometry.dispose();}
  if(group.pick)pickables.push(mesh);batchedObjects+=group.objects.length-1;
 }
 host.dataset.officeStaticBatch=JSON.stringify({removedDrawObjects:batchedObjects,groups:staticGroups.size});
 let currentAgents:SceneAgent[]=[],selected:string|null=null,motion=true,disposed=false,time=0,last=0,frame=0,signature='',activitySignature='',socialEnabled=true,cameraDestination:T.Vector3|null=null,targetDestination:T.Vector3|null=null;
 host.dataset.towerDesign=JSON.stringify({activeLevel:50,facadeFloorsBelow:49,fitBounds:'active office outline only; y -10.5..6',frameCapMs:50,contentArea:(locations.find(r=>r.id==='content') as DemoOfficeRoom|undefined)?.area});
 const homeTarget=()=>new T.Vector3(0,options?.comparisonCamera?1.8:-1.6,0);
 const homePosition=()=>{if(options?.comparisonCamera)return new T.Vector3(demo?40:36,demo?38:48,demo?58:56).multiplyScalar(Math.max(1,(demo?.8:1.35)/camera.aspect));const direction=new T.Vector3(60,demo?50:56,32).normalize(),right=new T.Vector3(direction.z,0,-direction.x).normalize(),up=direction.clone().cross(right).normalize(),target=homeTarget(),tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=0;for(const point of outline)for(const y of[-10.5,6]){const p=new T.Vector3(point.x,y,point.z).sub(target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/tanH,p.dot(direction)+Math.abs(p.dot(up))/tanV);}return target.addScaledVector(direction,distance*1.12);};
 let baseDistance=camera.position.distanceTo(controls.target),focusedDepartment='all';
 const projected=new T.Vector3();
 function addActor(agent:SceneAgent,seat:{position:T.Vector3;rotation:number;index:number;exit?:T.Vector3[];monitor?:T.Vector3[]}){
  const actor=createOfficeAvatar(seat.index,{simulation:demo});actor.root.position.copy(seat.position);actor.root.rotation.y=seat.rotation;peopleRoot.add(actor.root);actor.root.traverse(o=>{if(o instanceof T.Mesh){o.userData.agentId=agent.id;pickables.push(o);}});actorParts.set(agent.id,actor);socialHomes.set(agent.id,{position:[seat.position.x,seat.position.z],rotation:seat.rotation,index:seat.index,elevation:seat.position.y,exit:seat.exit?.map(p=>[p.x,p.z])});anchors.push({id:agent.id,kind:'agent',position:seat.position.clone().add(new T.Vector3(0,1.8,0)),...(demo&&seat.monitor?{monitor:seat.monitor}:{})});
 }
 const update=(agents:SceneAgent[],id:string|null,animate:boolean,social=true)=>{currentAgents=agents;selected=id;motion=animate;socialEnabled=social;const next=agents.map(a=>a.id+':'+a.role).join('|');if(next!==signature){signature=next;for(const child of [...peopleRoot.children]){child.traverse(o=>{const k=pickables.indexOf(o);if(k>=0)pickables.splice(k,1);if(o instanceof T.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});peopleRoot.remove(child);}actorParts.clear();socialHomes.clear();for(let i=anchors.length-1;i>=0;i--)if(anchors[i].kind==='agent')anchors.splice(i,1);agents.forEach(a=>{const seat=deskPositions.get(a.role)??(a.role==='coo'?{position:new T.Vector3(0,.2,2.6),rotation:0,index:0}:null);if(seat)addActor(a,seat);});}for(const a of agents){const actor=actorParts.get(a.id);if(!actor)continue;actor.light.color.set(a.id===selected?'#f8fcff':a.running?'#f0b24a':a.state==='completed'?'#64d49e':['error','failed'].includes(a.state)?'#ef7c74':'#8baabb');actor.ring.scale.setScalar(a.id===selected?1.35:1);}};
 const fitContentCamera=(loc:DemoOfficeRoom)=>{camera.fov=44;camera.updateProjectionMatrix();const localPoints=loc.polygon.map(([x,z])=>{const dx=x-loc.x,dz=z-loc.z;return [Math.cos(loc.angle)*dx-Math.sin(loc.angle)*dz,Math.sin(loc.angle)*dx+Math.cos(loc.angle)*dz];}),xs=localPoints.map(p=>p[0]),zs=localPoints.map(p=>p[1]),center=roomPoint(loc,(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2),target=new T.Vector3(center[0],1.4,center[1]),direction=new T.Vector3(Math.sin(loc.angle)*23,19,Math.cos(loc.angle)*23).normalize(),right=new T.Vector3(direction.z,0,-direction.x).normalize(),up=direction.clone().cross(right).normalize(),tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;let distance=0;for(const [x,z]of loc.polygon)for(const y of[0,3.8]){const p=new T.Vector3(x,y,z).sub(target);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/tanH,p.dot(direction)+Math.abs(p.dot(up))/tanV);}targetDestination=target;cameraDestination=target.clone().addScaledVector(direction,distance*1.13);host.dataset.contentCamera=JSON.stringify({bounds:'Content polygon, y0..3.8 only',distance:distance*1.13,margin:1.13,localDepth:Math.max(...zs)-Math.min(...zs),localWidth:Math.max(...xs)-Math.min(...xs)});};
 const focusSpace=(id:string)=>{if(['operations-work','research-work','core-overview','review-library','front-of-house','lounge-detail'].includes(id)){focusedDepartment='space:'+id;camera.fov=46;camera.updateProjectionMatrix();const targets:Record<string,number[]>={'operations-work':[-6,1,1.5],'research-work':[6,1,0],'core-overview':[0,1,1],'review-library':[0,1,-16.5],'front-of-house':[0,1,29.5],'lounge-detail':[5.8,1,18.5]},t=targets[id];targetDestination=new T.Vector3(...t as [number,number,number]);cameraDestination=targetDestination.clone().add(id==='core-overview'?new T.Vector3(0,14,18):id==='front-of-house'?new T.Vector3(-22,23,-22):id==='review-library'?new T.Vector3(9,12,14):id==='lounge-detail'?new T.Vector3(-4,9,-11):new T.Vector3(id==='operations-work'?-15:15,15,18));return;}if(id==='tower-height'){focusedDepartment='space:tower-height';camera.fov=48;camera.updateProjectionMatrix();targetDestination=new T.Vector3(0,-58,0);cameraDestination=targetDestination.clone().add(new T.Vector3(125,92,106).multiplyScalar(Math.max(1,1.25/camera.aspect)));return;}if(id==='arrival')return focusSpace('front-of-house');if(id==='shared-work')return focusSpace('review-library');if(id==='arrival'||id==='shared-work'){focusedDepartment='space:'+id;camera.fov=48;camera.updateProjectionMatrix();targetDestination=id==='arrival'?new T.Vector3(0,1.2,demo?35.5:33.5):new T.Vector3(0,1,-5.5);cameraDestination=targetDestination.clone().add(id==='arrival'?new T.Vector3(-21,13.5,-21):new T.Vector3(23,22,18));return;}if(id==='content-studio'||id==='content-studio-low'){focusedDepartment='space:'+id;const room=locations.find(r=>r.id==='content');if(room)fitContentCamera(room as DemoOfficeRoom);return;}const space=officeSharedSpaces.find(s=>s.id===id);if(!space)return;focusedDepartment='space:'+id;targetDestination=new T.Vector3(space.center[0],1,space.center[1]);cameraDestination=new T.Vector3(space.center[0]+5,7,space.center[1]+8);};
 const fit=()=>{camera.fov=options?.comparisonCamera?64:58;camera.updateProjectionMatrix();focusedDepartment='all';targetDestination=homeTarget();cameraDestination=homePosition();baseDistance=cameraDestination.distanceTo(targetDestination);};
 const fitProgrammeCamera=(loc:DemoOfficeRoom)=>{const programme=futureProgrammes.get(loc.id);if(!programme)return;camera.fov=44;camera.updateProjectionMatrix();const corners=(r:{x:number;z:number;width:number;depth:number})=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[r.x+a*r.width/2,r.z+b*r.depth/2]),local=[...loc.desks.flatMap(d=>corners({x:d.x,z:d.z+.4,width:2.25,depth:2.6})),...programme.placements.flatMap(corners)],xs=local.map(p=>p[0]),zs=local.map(p=>p[1]),p=roomPoint(loc,(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2),target=new T.Vector3(p[0],1.4,p[1]),direction=new T.Vector3(Math.sin(loc.angle)*23,19,Math.cos(loc.angle)*23).normalize(),right=new T.Vector3(direction.z,0,-direction.x).normalize(),up=direction.clone().cross(right).normalize(),v=Math.tan(camera.fov*Math.PI/360),h=v*camera.aspect;let distance=0;for(const q of local)for(const y of[0,3.1]){const w=roomPoint(loc,q[0],q[1]),r=new T.Vector3(w[0],y,w[1]).sub(target);distance=Math.max(distance,r.dot(direction)+Math.abs(r.dot(right))/h,r.dot(direction)+Math.abs(r.dot(up))/v);}targetDestination=target;cameraDestination=target.clone().addScaledVector(direction,distance*1.12);host.dataset.futureFocus=JSON.stringify({department:loc.id,bounds:'occupied desk + three functional vignette envelopes only',distance:distance*1.12});};
 const focus=(id:string)=>{focusedDepartment=id;if(id==='operations'||id==='knowledge')return focusSpace(id==='operations'?'operations-work':'research-work');const loc=locations.find(l=>l.id===id);if(!loc){fit();return;}if(demo&&id==='content'){fitContentCamera(loc as DemoOfficeRoom);return;}if(demo&&futureProgrammes.has(id)){fitProgrammeCamera(loc as DemoOfficeRoom);return;}if(demo){camera.fov=48;camera.updateProjectionMatrix();const suite=loc as DemoOfficeRoom,xs=suite.desks.map(d=>d.x),zs=suite.desks.map(d=>d.z),center=loc.id==='content'?roomPoint(suite,0,(suite.back+suite.front)/2):roomPoint(suite,(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2+.4),scale=loc.id==='content'?1.36*(camera.aspect<1?Math.max(1,loc.halfWidth*2/(40*Math.tan(24*Math.PI/180)*camera.aspect))*1.08:1):camera.aspect<1&&suite.columns>3?(host.clientWidth<=340?1.25:1.24):1;targetDestination=new T.Vector3(center[0],1.25,center[1]);cameraDestination=targetDestination.clone().add(new T.Vector3(Math.sin(loc.angle)*17,13,Math.cos(loc.angle)*17).multiplyScalar(scale));return;}targetDestination=new T.Vector3(loc.x,1.25,loc.z);cameraDestination=new T.Vector3(loc.x+Math.sin(loc.angle)*15,14,loc.z+Math.cos(loc.angle)*15+5);};
 const zoom=(factor:number)=>{cameraDestination=null;targetDestination=null;const distance=T.MathUtils.clamp(camera.position.distanceTo(controls.target)*factor,controls.minDistance,controls.maxDistance);camera.position.sub(controls.target).setLength(distance).add(controls.target);controls.update();};
 const cancelTransition=()=>{cameraDestination=null;targetDestination=null;};controls.addEventListener('start',cancelTransition);
 let down:{x:number;y:number}|null=null;
 const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
 const pointerUp=(e:PointerEvent)=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;down=null;const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(pickables,false)[0];if(hit?.object.userData.spaceId){focusSpace(hit.object.userData.spaceId);onSpace?.(hit.object.userData.spaceId);}else if(hit?.object.userData.agentId)onSelect(hit.object.userData.agentId);else if(hit?.object.userData.role==='coo'){const a=currentAgents.find(a=>a.role==='coo');if(a)onSelect(a.id);}else if(hit?.object.userData.department)focus(hit.object.userData.department);};
 renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;if(demo){const phone=w<=650;controls.rotateSpeed=phone?.22:.45;controls.zoomSpeed=phone?.32:.65;controls.panSpeed=phone?.25:.55;controls.minDistance=phone?18:7;controls.maxDistance=phone?115:180;}camera.updateProjectionMatrix();composer.setSize(w,h);if(demo&&['content','space:content-studio','space:content-studio-low'].includes(focusedDepartment)){const room=locations.find(r=>r.id==='content');if(room)fitContentCamera(room as DemoOfficeRoom);}if(focusedDepartment==='all'){const home=homePosition();camera.position.copy(home);controls.target.copy(homeTarget());controls.maxDistance=Math.max(180,home.distanceTo(controls.target)+10);baseDistance=home.distanceTo(controls.target);}};const observer=new ResizeObserver(resize);observer.observe(host);resize();
 function render(now:number){if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden)return;const dt=Math.min((now-last)/1000,.05);if(now-last<50)return;last=now;if(motion)time+=dt;
  if(cameraDestination&&targetDestination){if(motion){camera.position.lerp(cameraDestination,.1);controls.target.lerp(targetDestination,.1);}else{camera.position.copy(cameraDestination);controls.target.copy(targetDestination);}if(camera.position.distanceTo(cameraDestination)<.04){cameraDestination=null;targetDestination=null;}}
  if(demo){controls.target.x=T.MathUtils.clamp(controls.target.x,-32,32);controls.target.z=T.MathUtils.clamp(controls.target.z,-38,38);controls.target.y=T.MathUtils.clamp(controls.target.y,focusedDepartment==='space:tower-height'?-120:focusedDepartment==='all'?-2:0,8);}controls.update();if(demo)camera.position.y=Math.max(3,camera.position.y);
  const social=socialController.update(time,currentAgents,socialEnabled,motion);
  currentAgents.forEach(a=>{const actor=actorParts.get(a.id),home=socialHomes.get(a.id);if(!actor||!home)return;const visit=social.poses.get(a.id),position=visit?.position??home.position;actor.root.position.set(position[0],visit?0:(home.elevation??0),position[1]);actor.root.rotation.y=visit?.rotation??home.rotation;actor.pose(visit?.posture??'desk',time,visit?.gesture??null,a.running);actor.light.opacity=a.running?.6+Math.sin(time*3)*.3:.8;const anchor=anchors.find(p=>p.kind==='agent'&&p.id===a.id);anchor?.position.set(position[0],1.8,position[1]);if(demo&&anchor)anchor.monitorEnabled=!visit||visit.posture==='desk';});
  const activityKey=JSON.stringify(social.activity);if(activityKey!==activitySignature){activitySignature=activityKey;onActivity?.(social.activity);}
  doors.forEach(door=>{const near=[...social.poses.entries()].some(([id,pose])=>pose.posture==='walk'&&actorParts.get(id)!.root.position.distanceTo(door.position)<3);const target=near?1:0;door.open=motion?T.MathUtils.damp(door.open,target,8,dt):target;door.leaves.forEach(leaf=>{leaf.position.x=leaf.userData.side*door.open*1.23;});});
  commons.update(time);
  lighting.update();clouds.update(camera);
  renderer.shadowMap.needsUpdate=true;
  const renderStarted=performance.now();let profileActive=false;
  if(options?.preview){const key=[demo,clouds.enabled,clouds.cardsEnabled,host.clientWidth,host.clientHeight,...camera.position.toArray().map(v=>v.toFixed(2)),...controls.target.toArray().map(v=>v.toFixed(2))].join(':');if(key!==profileKey){profileKey=key;profileCpu=[];profileIntervals=[];profileGpu=[];profileFrames=0;profileLast=0;}if(profileGl&&profileTimer&&profileQuery&&profileGl.getQueryParameter(profileQuery,profileGl.QUERY_RESULT_AVAILABLE)){if(!profileGl.getParameter(profileTimer.GPU_DISJOINT_EXT)&&profileQueryKey===profileKey)profileGpu.push(profileGl.getQueryParameter(profileQuery,profileGl.QUERY_RESULT)/1e6);profileGl.deleteQuery(profileQuery);profileQuery=null;}if(profileGl&&profileTimer&&!profileQuery){profileQuery=profileGl.createQuery();profileQueryKey=profileKey;profileGl.beginQuery(profileTimer.TIME_ELAPSED_EXT,profileQuery);profileActive=true;}renderer.info.reset();}
if(host.clientWidth>650)composer.render();else renderer.render(scene,camera);
  if(options?.preview){if(profileGl&&profileTimer&&profileActive)profileGl.endQuery(profileTimer.TIME_ELAPSED_EXT);profileFrames++;if(profileFrames>8){profileCpu.push(performance.now()-renderStarted);if(profileLast)profileIntervals.push(now-profileLast);profileCpu=profileCpu.slice(-60);profileIntervals=profileIntervals.slice(-60);profileGpu=profileGpu.slice(-60);}profileLast=now;if(profileFrames%10===0)host.dataset.officeProfile=JSON.stringify({key:profileKey,samples:profileCpu.length,cpuMedianMs:median(profileCpu),frameIntervalMedianMs:median(profileIntervals),gpuTimerAvailable:!!profileTimer,gpuMedianMs:median(profileGpu),passes:host.clientWidth>650?profilePasses:{direct:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}},visibleAuthoredGeometry:sceneCost(),pipeline:host.clientWidth>650?'beauty+ssao+output':'direct',cloudsEnabled:clouds.enabled,cloudCardsEnabled:clouds.cardsEnabled,cloudCardDraws:clouds.root.userData.cardDraws??0,cloudAssetDimensions:clouds.root.userData.assetDimensions,cloudProgramDiagnostics:rawProfileGl?(renderer.info.programs??[]).filter(p=>p.name==='Cloud / baked light-alpha-depth multiview atlas').map(p=>({name:p.name,linkStatus:!!rawProfileGl.getProgramParameter(p.program as WebGLProgram,rawProfileGl.LINK_STATUS),vertexCompileStatus:!!rawProfileGl.getShaderParameter(p.vertexShader,rawProfileGl.COMPILE_STATUS),fragmentCompileStatus:!!rawProfileGl.getShaderParameter(p.fragmentShader,rawProfileGl.COMPILE_STATUS),programLog:rawProfileGl.getProgramInfoLog(p.program as WebGLProgram),fragmentLog:rawProfileGl.getShaderInfoLog(p.fragmentShader)})):[],cloudAssetsReady:clouds.root.userData.assetReady===true,camera:camera.position.toArray(),target:controls.target.toArray(),roster:currentAgents.length,renderCapMs:50});}
  if(options?.preview)host.dataset.officeRenderStats=JSON.stringify({width:host.clientWidth,height:host.clientHeight,pixelRatio:renderer.getPixelRatio(),cpuSubmitMs:Math.round((performance.now()-renderStarted)*100)/100,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});const bounds=host.getBoundingClientRect();onProject(anchors.map(a=>{projected.copy(a.position).project(camera);const base:SceneProjection={id:a.id,kind:a.kind,x:(projected.x+1)/2*bounds.width,y:(1-projected.y)/2*bounds.height,visible:projected.z<1&&projected.z>-1&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1};if(!demo||a.kind!=='agent')return base;
   const rectangle=(points:T.Vector3[])=>{const xy=points.map(p=>{const q=p.clone().project(camera);return{x:(q.x+1)/2*bounds.width,y:(1-q.y)/2*bounds.height,z:q.z};});if(xy.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.z<=-1||p.z>=1))return undefined;const x=Math.min(...xy.map(p=>p.x)),y=Math.min(...xy.map(p=>p.y));return{x,y,width:Math.max(...xy.map(p=>p.x))-x,height:Math.max(...xy.map(p=>p.y))-y};};
   const actor=actorParts.get(a.id);if(actor){const box=new T.Box3(),partBox=new T.Box3();actor.root.traverse(o=>{if(o instanceof T.Mesh&&o!==actor.ring&&o.visible){if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.geometry.boundingBox)box.union(partBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));}});if(!box.isEmpty())base.body=rectangle(Array.from({length:8},(_,i)=>new T.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)));}
   if(a.monitor&&a.monitorEnabled!==false)base.monitor=rectangle(a.monitor);return base;
  }));onZoom(baseDistance/camera.position.distanceTo(controls.target));
 }
 frame=requestAnimationFrame(render);
 return {setCloudCardsEnabled:(enabled:boolean)=>clouds.setCardsEnabled(enabled),setCloudsEnabled:(enabled:boolean)=>clouds.setEnabled(enabled),setLighting:(mode:OfficeLightingMode)=>lighting.setMode(mode),update,focus,focusSpace,zoom,fit,dispose:()=>{disposed=true;if(profileGl&&profileQuery)profileGl.deleteQuery(profileQuery);lighting.dispose();clouds.dispose();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());env.dispose();ao.dispose();outputPass.dispose();composer.dispose();sun.shadow.dispose();renderer.dispose();renderer.domElement.remove();}};
}
