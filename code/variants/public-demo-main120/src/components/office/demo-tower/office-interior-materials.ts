import * as T from 'three';
/** World-scaled matte mineral slabs; joinery has no grain, bump or timber maps. */
export function createOfficeInteriorMaterials(textures:T.Texture[]){
 const pixels=new Uint8Array(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4,seam=x===0||y===0,n=Math.sin(x*18.31+y*39.73)*.55;const c=(seam?226:248)+n*2;pixels[i]=c;pixels[i+1]=c-3;pixels[i+2]=c-9;pixels[i+3]=255;}
 const map=new T.DataTexture(pixels,256,256);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.needsUpdate=true;textures.push(map);
 const floor=new T.MeshStandardMaterial({name:'Demo / warm off-white limestone 2400 x 3600mm slabs',map,color:'#fffaf0',roughness:.69,metalness:0,bumpMap:map,bumpScale:.004});
 floor.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vOfficeWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOfficeWorld=(modelMatrix*vec4(position,1.0)).xyz;');shader.fragmentShader='varying vec3 vOfficeWorld;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\ndiffuseColor *= texture2D(map, vOfficeWorld.xz / vec2(2.4,3.6));\n#endif');};
 floor.customProgramCacheKey=()=> 'office-warm-stone-large-slabs-v2';
 return {floor,woodMap:null,woodRoughnessMap:null,wall:'#eeeae0',joinery:'#bfc4c5',metal:'#3c4449',upholstery:'#657777'};
}
