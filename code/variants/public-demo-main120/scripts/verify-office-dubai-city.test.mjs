import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {dubaiDaylight} from '../src/lib/office-daylight.mjs';
import {createDubaiCity} from '../src/components/office/office-dubai-city.ts';

const outline=()=>Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2,r=26+3.2*Math.cos(a*4)+1.3*Math.sin(a*3);return new T.Vector3(Math.sin(a)*r,.03,Math.cos(a)*r*.78);});
function fixture(t){const city=createDubaiCity(outline());t.after(()=>{city.dispose();const geometries=new Set(),materials=new Set();city.root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());});return city;}

test('the office has an elevation below its occupied floor and surrounding buildings have real separated depths',t=>{
 const {root}=fixture(t);root.updateMatrixWorld(true);
 const base=root.getObjectByName('Office tower / inhabited elevation'),bounds=new T.Box3().setFromObject(base);
 assert.ok(bounds.max.y<0);assert.ok(bounds.min.y<=-38);
 const towers=root.children.filter(o=>o.name.startsWith('City tower /'));
 assert.ok(towers.length>=65);assert.ok(towers.every(o=>Math.hypot(o.position.x,o.position.z)>40));
 assert.ok(new Set(towers.map(o=>Math.round(Math.hypot(o.position.x,o.position.z)/20))).size>=5);
 const burj=root.getObjectByName('Burj Khalifa / interpreted landmark');assert.ok(burj);assert.ok(Math.hypot(burj.position.x,burj.position.z)<210);assert.ok(new T.Box3().setFromObject(burj).getSize(new T.Vector3()).y>110);
 assert.ok(root.getObjectByName('Helical tower / Cayan-inspired'));
});

test('city positions are deterministic, use world-space parallax and never introduce agent identities',t=>{
 const a=fixture(t),b=fixture(t);
 assert.deepEqual(a.root.children.map(o=>o.position.toArray()),b.root.children.map(o=>o.position.toArray()));
 const camera=new T.PerspectiveCamera(56,1.9,.1,1200),target=new T.Vector3(0,2.8,0);
 camera.position.set(24,16,28);camera.lookAt(target);camera.updateMatrixWorld();
 const near=a.root.getObjectByName('City tower / 1').position.clone(),far=a.root.getObjectByName('Burj Khalifa / interpreted landmark').position.clone();
 const before=[near.clone().project(camera).x,far.clone().project(camera).x];
 camera.position.set(29,16,22);camera.lookAt(target);camera.updateMatrixWorld();
 const deltas=[near.clone().project(camera).x-before[0],far.clone().project(camera).x-before[1]];
 assert.ok(Math.abs(deltas[0])>.03);assert.ok(Math.abs(deltas[0]-deltas[1])>.01);
 a.root.traverse(o=>assert.equal(o.userData.agentId,undefined));
});

test('ambient city motion freezes at the same clock and all authored facade textures can be released',t=>{
 const city=fixture(t),cars=city.root.children.find(o=>o instanceof T.InstancedMesh&&o.count===30);
 const initial=Array.from(cars.instanceMatrix.array);city.update(10);const moved=Array.from(cars.instanceMatrix.array);
 assert.notDeepEqual(initial,moved);city.update(10);assert.deepEqual(Array.from(cars.instanceMatrix.array),moved);
 const textures=new Set();city.root.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])for(const key of ['map','emissiveMap'])if(m[key])textures.add(m[key]);}});
 let disposed=0;textures.forEach(texture=>texture.addEventListener('dispose',()=>disposed++));city.dispose();assert.equal(disposed,textures.size);assert.equal(textures.size,6);
});

test('night uses real window emission masks and daytime restores the sun direction',t=>{
 const city=fixture(t),date=Date.parse('2026-10-14T08:00:00Z');city.setDaylight(dubaiDaylight(date,'night'));
 const glazing=new Set();city.root.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.emissiveMap)glazing.add(m);}});assert(glazing.size>=3);assert([...glazing].every(m=>m.emissiveIntensity>.5));assert([...glazing].some(m=>m.emissiveIntensity>1));
 city.setDaylight(dubaiDaylight(date,'midday'));assert([...glazing].every(m=>m.emissiveIntensity===0));
 const sky=city.root.getObjectByName('Analytic daylight atmosphere');assert(sky.material.uniforms.sunPosition.value.y>0);assert.equal(sky.material.uniforms.nightBlend.value,0);
});

test('extruded façades keep normalized UVs so night emission cannot clamp into solid walls',t=>{
 const city=fixture(t);let checked=0;city.root.traverse(o=>{if(o instanceof T.Mesh&&o.geometry.type==='ExtrudeGeometry'&&o.material.emissiveMap){const uv=o.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++){assert(uv.getX(i)>=-1e-5&&uv.getX(i)<=1.00001);assert(uv.getY(i)>=-1e-5&&uv.getY(i)<=1.00001);}checked++;}});assert(checked>10);
});
