import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {createTypingRig,gateTyping,tickTyping,disposeTyping,type TypingRig} from './typing';
import {createQuality,ratioLimit,resizeQuality,sampleQuality,pixelBudget} from './quality';
import {createKeyboardPose,bakeKeyboardClip,keyboardErrors} from './keyboard-pose';
import keyboardTargets from './keyboard-targets.json';
import {fixInteriorSurfaces} from './surface-fixes';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { createOfficeScene as LegacyFactory, OfficeScene, SceneAgent, SceneProjection } from '../office-scene';
import manifest from './manifest.json';
import { demoBoundary } from '../demo-tower/office-demo-floor-plan.mjs';
import { seats, roomCodes, roomIdForCode } from './presentation';
import { chooseSceneVersion } from './version';
const assetRoot = '/office/v2/386ba37d1e16523f1b90/';
const V = (a: number[]) => new T.Vector3(...a);
const matrixChanged=(a:T.Matrix4,b:T.Matrix4)=>a.elements.some((value,index)=>Math.abs(value-b.elements[index])>1e-6);
export function releaseObject(root: T.Object3D) { const skeletons=new Set<T.Skeleton>();const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>(); root.traverse(o => { if (!(o instanceof T.Mesh))
    return; if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    materials.add(m);
    for (const v of Object.values(m))
        if (v instanceof T.Texture)
            textures.add(v);
} }); skeletons.forEach(s=>s.dispose());geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => { const image = t.image; t.dispose(); if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
    image.close(); }); }
export function fixAgentMaterials(root: T.Object3D) { root.traverse(o => { if (!(o instanceof T.Mesh))
    return; o.frustumCulled = !(o instanceof T.SkinnedMesh); o.castShadow = false; for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (/hair|brow|lash|high-poly/i.test(m.name)) {
        m.alphaTest = .5;
        m.transparent = false;
        m.depthWrite = true;
        m.side = T.DoubleSide;
        m.needsUpdate = true;
    }
    else if (/^Human/i.test(m.name)) {
        m.transparent = false;
        m.opacity = 1;
        m.alphaTest = 0;
        m.depthWrite = true;
        m.needsUpdate = true;
    }
} }); }
export function createOfficeScene(...args: Parameters<typeof LegacyFactory>): OfficeScene & {
    setCloudsEnabled: (enabled: boolean) => void;
    setCloudCardsEnabled: (enabled: boolean) => void;
} {
    const [host, onSelect, onProject, onZoom, onSpace] = args;
    let disposed = false, agentsReady = false, environmentReady = false, motion = true, focused = 'all', selected: string | null = null, current: SceneAgent[] = [], frame = 0, lastRender = 0, lastMetrics = 0, idleFrame = 0;
    const started = performance.now();
    const mobile=matchMedia('(max-width:800px)').matches||matchMedia('(pointer:coarse)').matches||((navigator as Navigator&{deviceMemory?:number}).deviceMemory??8)<=4;const quality=createQuality(ratioLimit(host.clientWidth,host.clientHeight,window.devicePixelRatio,mobile),started);let pixelRatio=quality.ratio,renderFrames=0,lastPresented=0,viewWidth=host.clientWidth,viewHeight=host.clientHeight,projectionDirty=true,projectionPasses=0,projectedLabels=0,headAnchorCount=0;const projectedCamera=new T.Matrix4(),projectedLens=new T.Matrix4(),projectedPoint=new T.Vector3(),headAnchors=new Map<string,T.Vector3>(),departmentSeats=new Map<string,typeof seats>();for(const seat of seats){const group=departmentSeats.get(seat.department)??[];group.push(seat);departmentSeats.set(seat.department,group);}let rosterIdentity='';const rigs:TypingRig[]=[],roleAgents=new Map<string,SceneAgent>(),frustum=new T.Frustum(),projectionView=new T.Matrix4(),lightmapTextures=new Set<T.Texture>();let lightmapGroups=0;
    const abort = new AbortController(), scene = new T.Scene();
    scene.background = new T.Color('#0b0d14');
    const renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer:true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(pixelRatio);
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive Office v2.1 · motion follows working status');
    const camera = new T.PerspectiveCamera(35, 1, .3, 4000), controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .12;
    controls.minPolarAngle = .001;
    controls.maxPolarAngle = Math.PI * .47;
    controls.minDistance = 3;
    controls.maxDistance = 350;
    controls.screenSpacePanning = false;
    controls.rotateSpeed = .45;
    controls.zoomSpeed = .6;
    const room = new RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer), env = pmrem.fromScene(room, .04);
    scene.environment = env.texture;
    scene.environmentIntensity = .35;
    room.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight('#fff1e0', '#202030', .6));
    const sun = new T.DirectionalLight('#ffe2c0', .6);
    sun.position.set(-30, 80, 40);
    scene.add(sun);
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.className = 'office-v2-load';
    status.textContent = 'Loading Office v2 interior…';
    host.appendChild(status);
    host.dataset.sceneVersion = 'v2';
    host.dataset.sceneState = 'environment-loading';
    const fail = (phase: string) => { if (disposed)
        return; host.dataset.sceneState = phase + '-error'; status.hidden = false; status.replaceChildren(document.createTextNode(phase === 'agents' ? 'Interior ready. The seated cast could not load. ' : 'Office v2 could not load. ')); const button = document.createElement('button'); button.textContent = 'Use legacy view'; button.onclick = () => chooseSceneVersion('legacy'); status.appendChild(button); };
    let assetErrors = 0;
    const manager = new T.LoadingManager();
    manager.onError = () => { assetErrors++; };
    const loader=new GLTFLoader(manager);loader.setMeshoptDecoder(MeshoptDecoder);
    const roots = new Map<string, T.Object3D>(), statusLights = new Map<string, T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>>(), original = new Map<T.Material, {
        emissive: T.Color;
        intensity: number;
    }>();
    let destination: {
        position: T.Vector3;
        target: T.Vector3;
        startP: T.Vector3;
        startT: T.Vector3;
        at: number;
    } | null = null, baseDistance = 1;
    const renderTimes: number[] = [];
    const move = (p: T.Vector3, t: T.Vector3, animate = true) => { projectionDirty=true;destination = { position: p, target: t, startP: camera.position.clone(), startT: controls.target.clone(), at: performance.now() }; if (!motion || !animate) {
        camera.position.copy(p);
        controls.target.copy(t);
        destination = null;
    } baseDistance = p.distanceTo(t); };
    const preset = (name: keyof typeof manifest.cameras, animate = true) => { const c = manifest.cameras[name], t = V(c.target), p = V(c.position); if (name === 'overview' || name === 'plan') {
        const dir = p.clone().sub(t).normalize(), right = new T.Vector3(dir.z, 0, -dir.x).normalize(), up = dir.clone().cross(right).normalize(), tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect;
        let distance = p.distanceTo(t);
        for (let i = 0; i < 128; i++) {
            const [x, z] = demoBoundary(i / 128 * Math.PI * 2);
            for (const y of [0, 3.5]) {
                const q = new T.Vector3(x, y, z).sub(t);
                distance = Math.max(distance, q.dot(dir) + Math.abs(q.dot(right)) / tanH, q.dot(dir) + Math.abs(q.dot(up)) / tanV);
            }
        }
        p.copy(t).addScaledVector(dir, distance * 1.06);
    } move(p, t, animate); };
    const fit = () => { focused = 'all'; preset('overview'); };
    const focus = (id: string) => { if (id === 'all') {
        fit();
        return;
    } const code = roomCodes[id] ?? id; if (code === 'MAX') {
        focused = 'MAX';
        preset('max_suite');
        return;
    } const r = manifest.rooms.find(r => r.code === code || r.id === id); if (!r)
        return; focused = r.code; const ss = seats.filter(s => s.department === r.code), bounds = new T.Box3(); for (const s of ss)
        bounds.expandByPoint(V(s.label_anchor)); if (!ss.length)
        bounds.expandByPoint(V(r.center)); bounds.expandByPoint(V(r.center)); const target = bounds.getCenter(new T.Vector3()); target.y = 1.0; const size = bounds.getSize(new T.Vector3()), radius = Math.max(5.5, Math.hypot(size.x, size.z) * .52), dir = V(r.entrance).sub(V(r.center)).setY(0).normalize(); if (!dir.length())
        dir.set(0, 0, 1); const slope = new T.Vector3(dir.x * .8, 1.1, dir.z * .8).normalize(), distance = radius / Math.sin(T.MathUtils.degToRad(camera.fov / 2)) * 1.1 / Math.min(1, Math.max(.38, camera.aspect)); move(target.clone().addScaledVector(slope, distance), target); };
    const focusSpace = (id: string) => { if (id === 'plan') {
        focused = 'all';
        preset('plan');
        return;
    } if (['max_suite', 'coo', 'operations-work'].includes(id)) {
        focused = 'MAX';
        preset('max_suite');
        return;
    } if (['lounge', 'coffee', 'games', 'lounge_bar'].includes(id)) {
        focused = 'all';
        preset('lounge');
        return;
    } const zone = id === 'meeting' ? 'boardroom' : id === 'arrival' || id === 'lobby' ? 'arrival_lobby' : id; const p = manifest.zones[zone as keyof typeof manifest.zones]; if (p) {
        focused = 'all';
        move(V(p).add(new T.Vector3(0, 12, 14)), V(p));
    }
    else if (id === 'library')
        onSpace?.('library'); };
    const agentId = (seat: typeof seats[number]) => seat.appRole ? current.find(a => a.role === seat.appRole)?.id ?? 'role:' + seat.appRole : 'seat:' + seat.id;
    const restoreSelection = () => original.forEach((v, m) => { if (m instanceof T.MeshStandardMaterial) {
        m.emissive.copy(v.emissive);
        m.emissiveIntensity = v.intensity;
    } });
    const updateSelection = () => { restoreSelection(); for (const s of seats) {
        const root = roots.get(s.id);
        if (!root || agentId(s) !== selected)
            continue;
        root.traverse(o => { if (!(o instanceof T.Mesh))
            return; for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m instanceof T.MeshStandardMaterial) {
                if (!original.has(m))
                    original.set(m, { emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
                m.emissive.set('#8e632a');
                m.emissiveIntensity = .18;
            } });
    } };
    const load = async (file: string) => { const response = await fetch(assetRoot + file, { signal: abort.signal }); if (!response.ok)
        throw Error('Office asset unavailable'); const before = assetErrors, gltf = await loader.parseAsync(await response.arrayBuffer(), assetRoot); if (assetErrors > before) {
        releaseObject(gltf.scene);
        throw Error('Office texture unavailable');
    } return gltf; };
    const fetchJson=async(file:string)=>{const response=await fetch(assetRoot+file,{signal:abort.signal});if(!response.ok)throw Error('Office metadata unavailable');return response.json();};
    const loadLightmap=async(file:string)=>{const response=await fetch(assetRoot+file,{signal:abort.signal});if(!response.ok)throw Error('Office lightmap unavailable');const bitmap=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});if(disposed){bitmap.close();throw Error('Disposed');}const texture=new T.Texture(bitmap);texture.name=file;texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.channel=1;texture.needsUpdate=true;lightmapTextures.add(texture);return texture;};
    const loadEnvironment=async()=>{let model:T.Group|undefined;try{const metadata=await fetchJson('lightmaps.json') as Record<string,{file:string;intensity:number}>;const gltf=await load('office-environment-lit.glb');model=gltf.scene;if(disposed){releaseObject(model);return;}status.textContent='Applying baked lighting…';const sourceMaterials=new Set<T.Material>();model.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])sourceMaterials.add(m);});const entries=Object.entries(metadata),loaded=await Promise.allSettled(entries.map(async([name,meta])=>({name,meta,texture:await loadLightmap(meta.file)})));if(disposed){releaseObject(model);return;}if(loaded.some(r=>r.status==='rejected'))throw Error('Incomplete baked lighting');const normalize=(name:string)=>name.replace(/[^A-Za-z0-9]/g,'').toLowerCase(),groups=new Map(loaded.map(r=>{if(r.status!=='fulfilled')throw Error('Lightmap unavailable');return[normalize(r.value.name),r.value] as const;})),seen=new Set<string>();model.traverse(o=>{if(!(o instanceof T.Mesh))return;let parent:T.Object3D|null=o,match:ReturnType<typeof groups.get>;while(parent&&!match){match=groups.get(normalize(parent.name));parent=parent.parent;}if(!match)return;if(!o.geometry.getAttribute('uv1')){const baked=o.geometry.getAttribute('uv');if(!baked)throw Error('Missing baked UV for '+o.name);o.geometry.setAttribute('uv1',baked.clone());}seen.add(normalize(match.name));const apply=(original:T.Material)=>{if(!(original instanceof T.MeshStandardMaterial))return original;const material=original.clone();material.lightMap=match!.texture;material.lightMapIntensity=match!.meta.intensity*Math.PI;material.needsUpdate=true;return material;};o.material=Array.isArray(o.material)?o.material.map(apply):apply(o.material);});if(seen.size!==13)throw Error('Expected13 baked groups');const usedMaterials=new Set<T.Material>();model.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])usedMaterials.add(m);});for(const material of sourceMaterials)if(!usedMaterials.has(material))material.dispose();lightmapGroups=seen.size;model.traverse(o=>{if(o instanceof T.Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Cloud sea'))o.visible=false;});const surfaceAudit=fixInteriorSurfaces(model);host.dataset.surfaceAudit=JSON.stringify(surfaceAudit);scene.add(model);environmentReady=true;host.dataset.sceneState='environment-ready';host.dataset.environmentReadyMs=String(Math.round(performance.now()-started));status.textContent='Office ready · loading '+(mobile?'phone':'desktop')+' agents…';renderer.render(scene,camera);idleFrame=requestAnimationFrame(()=>void loadAgents());}catch(error){host.dataset.loadError=String(error);if(model&&!scene.children.includes(model))releaseObject(model);fail('environment');}};
    const loadAgents=async()=>{try{const gltf=await load(mobile?'office-agents-rigged-mobile.glb':'office-agents-rigged.glb');if(disposed){releaseObject(gltf.scene);return;}fixAgentMaterials(gltf.scene);gltf.scene.traverse(o=>{const index=gltf.parser.associations.get(o)?.nodes,originalName=index===undefined?o.name:gltf.parser.json.nodes[index]?.name;const name=typeof originalName==='string'?originalName:o.name;if(/^agent:?[a-z0-9]/.test(name)&&!(o instanceof T.Mesh)&&!(o instanceof T.Bone)){const id=name.replace(/^agent:?/,'');if(seats.some(s=>s.id===id)){roots.set(id,o);o.traverse(c=>{c.userData.officeSeat=id;});}}});const typing=gltf.animations.find(c=>c.name==='typing');if(roots.size!==66||!typing||seats.some(s=>!roots.has(s.id))){releaseObject(gltf.scene);throw Error('Invalid rigged cast');}scene.add(gltf.scene);gltf.scene.updateMatrixWorld(true);for(let i=0;i<seats.length;i++){const seat=seats[i],root=roots.get(seat.id)!;let head:T.Object3D|undefined;root.traverse(o=>{if(!(o instanceof T.Bone))return;const index=gltf.parser.associations.get(o)?.nodes,name=index===undefined?o.name:gltf.parser.json.nodes[index]?.name;if(name==='head'||/^head_\d+$/.test(name??''))head=o;});const anchor=(head??root).getWorldPosition(new T.Vector3()).add(new T.Vector3(0,head ? .28 : 1.65,0));headAnchors.set(seat.id,anchor);if(head)headAnchorCount++;const rig=createTypingRig(seat.id,seat.appRole,root,typing,i);rig.keyboardPose=createKeyboardPose(root,keyboardTargets[seat.id as keyof typeof keyboardTargets],o=>{const index=gltf.parser.associations.get(o)?.nodes;return index===undefined?o.name:gltf.parser.json.nodes[index]?.name??o.name;});bakeKeyboardClip(rig,rig.keyboardPose);rigs.push(rig);const lamp=new T.Mesh(new T.SphereGeometry(.075,8,6),new T.MeshBasicMaterial({color:'#756f65'}));lamp.position.copy(V(seat.label_anchor)).add(new T.Vector3(0,.38,0));lamp.visible=false;scene.add(lamp);statusLights.set(seat.id,lamp);}host.dataset.agentAudit=JSON.stringify(rigs.map(rig=>{const box=new T.Box3().setFromObject(rig.root);let meshes=0,cutouts=0,transparentHuman=0;rig.root.traverse(o=>{if(!(o instanceof T.Mesh))return;meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(/hair|brow|lash|high-poly/i.test(m.name)&&m.alphaTest===.5&&!m.transparent&&m.depthWrite&&m.side===T.DoubleSide)cutouts++;if(/^Human/i.test(m.name)&&m.transparent)transparentHuman++;}});return{id:rig.id,appRole:rig.role,tracks:rig.clip.tracks.length,meshes,cutouts,transparentHuman,min:box.min.toArray(),max:box.max.toArray()};}));gateTyping(rigs,roleAgents,motion);agentsReady=true;projectionDirty=true;status.hidden=true;host.dataset.sceneState='ready';host.dataset.agentsReadyMs=String(Math.round(performance.now()-started));updateSelection();}catch(error){host.dataset.loadError=String(error);fail('agents');}};
    void loadEnvironment();
    const project = () => {
        const list:SceneProjection[]=[];
        if(agentsReady&&focused!=='all')for(const seat of departmentSeats.get(focused)??[]){
            const anchor=headAnchors.get(seat.id);if(!anchor)continue;
            const v=projectedPoint.copy(anchor).project(camera),x=(v.x+1)*viewWidth/2,y=(1-v.y)*viewHeight/2;
            if(v.z<=-1||v.z>=1||x<6||x>viewWidth-6||y<20||y>viewHeight-3)continue;
            list.push({id:agentId(seat),kind:seat.department==='MAX'?'coo':'agent',x,y,visible:true});
        }
        onProject(list);projectedLabels=list.length;projectionPasses++;projectionDirty=false;
        projectedCamera.copy(camera.matrixWorld);projectedLens.copy(camera.projectionMatrix);
        onZoom(baseDistance/camera.position.distanceTo(controls.target));
    };
    const resize = () => { if(disposed)return;
        const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
        viewWidth=w;viewHeight=h;resizeQuality(quality,ratioLimit(w,h,window.devicePixelRatio,mobile),performance.now());pixelRatio=quality.ratio;
        renderer.setDrawingBufferSize(w,h,pixelRatio);renderer.domElement.style.width=w+'px';renderer.domElement.style.height=h+'px';
        camera.aspect=w/h;camera.updateProjectionMatrix();projectionDirty=true;
        if(focused==='all')preset('overview',false);else focus(focused);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    preset('overview', false);
    const ray = new T.Raycaster(), pointer = new T.Vector2();
    let down: {
        x: number;
        y: number;
    } | null = null;
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; destination = null; };
    const pointerUp = (e: PointerEvent) => { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
        down = null;
        return;
    } down = null; const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2); ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects([...roots.values()], true)[0]; if (hit) {
        let o: T.Object3D | null = hit.object;
        while (o && !o.userData.officeSeat)
            o = o.parent;
        const s = seats.find(s => s.id === o?.userData.officeSeat);
        if (s)
            onSelect(agentId(s));
    } };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    const animate = (now: number) => { if (disposed)
        return; frame=requestAnimationFrame(animate);if(document.visibilityState!=='visible'){lastRender=0;lastPresented=0;return;}
    if(now-lastRender<(mobile?1000/30:1000/60)-.5)return;
    const dt=Math.min(.2,lastRender?(now-lastRender)/1000:0);lastRender=now;renderFrames++;
    if(pixelRatio!==quality.ratio){pixelRatio=quality.ratio;renderer.setDrawingBufferSize(viewWidth,viewHeight,pixelRatio);}
 if (destination) {
        const t = motion ? Math.min(1, (now - destination.at) / 900) : 1, e = t * t * (3 - 2 * t);
        camera.position.lerpVectors(destination.startP, destination.position, e);
        controls.target.lerpVectors(destination.startT, destination.target, e);
        if (t === 1)
            destination = null;
    } controls.target.x = T.MathUtils.clamp(controls.target.x, -38, 38); controls.target.z = T.MathUtils.clamp(controls.target.z, -44, 44); controls.target.y = T.MathUtils.clamp(controls.target.y, -2, 8); controls.update();camera.updateMatrixWorld();projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projectionView);tickTyping(rigs,frustum,camera.position,dt,renderFrames);if(projectionDirty||matrixChanged(camera.matrixWorld,projectedCamera)||matrixChanged(camera.projectionMatrix,projectedLens))project();
    const renderStart=performance.now();renderer.render(scene,camera);const presented=performance.now(),renderCpuMs=presented-renderStart;
    renderTimes.push(renderCpuMs);if(renderTimes.length>60)renderTimes.shift();
    if(environmentReady&&agentsReady&&lastPresented)sampleQuality(quality,presented,presented-lastPresented,renderCpuMs,mobile?1000/30:1000/60);
    lastPresented=presented;
 if (now - lastMetrics > 1000) {
        lastMetrics = now;
        host.dataset.officeV2 = JSON.stringify({ environmentReady, agentsReady, seatNodes: roots.size, mapped: seats.filter(s => s.appRole).length, planned: seats.filter(s => !s.appRole).length, staticPoses: false,typingClip:true,modelVariant:mobile?'mobile':'desktop',lightmapGroups,pixelRatio,quality:{antialias:renderer.getContextAttributes()?.antialias??false,canvasWidth:renderer.domElement.width,canvasHeight:renderer.domElement.height,pixelBudget:pixelBudget(mobile),ceiling:quality.max,floor:quality.min,changes:quality.changes},projectionPasses,projectedLabels,headAnchorCount,keyboardAligned:rigs.filter(r=>r.keyboardPose).length,maxHandError:Math.max(0,...rigs.flatMap(r=>r.keyboardPose?keyboardErrors(r.keyboardPose):[])),typing:rigs.map(r=>({id:r.id,playing:r.playing,updates:r.updates,time:r.action.time})),focused, moving: destination !== null, at: Math.round(now), camera: camera.position.toArray(), target: controls.target.toArray(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, renderCpuMedianMs: [...renderTimes].sort((a, b) => a - b)[Math.floor(renderTimes.length / 2)] ?? 0 });
    } };
    frame = requestAnimationFrame(animate);
    return { fit, focus, focusSpace, zoom: f => { destination = null; const offset = camera.position.clone().sub(controls.target), d = T.MathUtils.clamp(offset.length() * f, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(offset.setLength(d)); }, setLighting: () => { }, setCloudsEnabled: enabled => { scene.background = new T.Color(enabled ? '#252a35' : '#0b0d14'); }, setCloudCardsEnabled: () => { }, update: (agents, nextSelected, nextMotion) => { const identity=agents.map(a=>a.role+':'+a.id).join('|');if(identity!==rosterIdentity){rosterIdentity=identity;projectionDirty=true;}current = agents;motion=nextMotion;roleAgents.clear();for(const agent of agents)roleAgents.set(agent.role,agent);gateTyping(rigs,roleAgents,motion); controls.enableDamping = motion; if (selected !== nextSelected) {
            selected = nextSelected;
            updateSelection();
        } for (const s of seats) {
            const lamp = statusLights.get(s.id), a = s.appRole ? agents.find(a => a.role === s.appRole) : undefined;
            if (lamp) {
                const review = a && ['awaiting-review', 'approval', 'awaiting_review'].includes(a.state);
                lamp.visible = Boolean(a && (a.running || review));
                lamp.material.color.set(review ? '#eaa34a' : '#8daa7d');
            }
        } }, dispose: () => { if (disposed)
            return; disposed = true; abort.abort(); cancelAnimationFrame(frame); cancelAnimationFrame(idleFrame); observer.disconnect(); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); controls.dispose(); restoreSelection();disposeTyping(rigs);releaseObject(scene);for(const texture of lightmapTextures){texture.dispose();const image=texture.image;if(image instanceof ImageBitmap)image.close();}lightmapTextures.clear();env.dispose();renderer.dispose(); renderer.domElement.remove(); status.remove(); onProject([]); for (const key of ['officeV2','agentAudit','environmentReadyMs','agentsReadyMs','sceneVersion','surfaceAudit']) delete host.dataset[key];
            host.dataset.sceneState = 'disposed'; } };
}
