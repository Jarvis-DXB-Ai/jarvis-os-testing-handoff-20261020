import * as T from 'three';
export function fixInteriorSurfaces(root:T.Object3D){
 const seen=new Set<T.Material>();let matte=0,lifted=0;root.updateMatrixWorld(true);
 root.traverse(o=>{if(!(o instanceof T.Mesh))return;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  for(const material of materials){if(seen.has(material)||!(material instanceof T.MeshStandardMaterial))continue;seen.add(material);
   if(!/glass|lens/i.test(material.name)){
    material.roughness=Math.max(material.roughness,material.metalness>.25?.6:.82);
    if(material instanceof T.MeshPhysicalMaterial){material.clearcoat=0;material.clearcoatRoughness=1;}
    material.needsUpdate=true;matte++;
   }
  }
  if(!materials.some(m=>m.name==='Charcoal carpet'))return;
  let ancestor:T.Object3D|null=o,content=false;while(ancestor){if(/^LM.*Content/i.test(ancestor.name))content=true;ancestor=ancestor.parent;}if(!content)return;
  const geometry=o.geometry.clone(),position=geometry.getAttribute('position'),data=new Float32Array(position.count*3),world=new T.Vector3(),inverse=o.matrixWorld.clone().invert();let changed=0;
  for(let i=0;i<position.count;i++){world.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);
   // The podcast carpet top was coplanar with the room floor at12mm. Raise only its low vertices.
   if(world.y>=-.001&&world.y<=.014){world.y+=.008;changed++;}
   world.applyMatrix4(inverse).toArray(data,i*3);
  }
  if(changed){geometry.setAttribute('position',new T.Float32BufferAttribute(data,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();o.geometry=geometry;lifted+=changed;}else geometry.dispose();
 });return {matteMaterials:matte,podcastCarpetVerticesLifted:lifted,podcastLiftMetres:.008};
}
