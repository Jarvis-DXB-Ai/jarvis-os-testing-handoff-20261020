import * as T from 'three';

/** One world-scaled limestone surface, shared across rooms, corridors and arrival. */
export function createOfficeInteriorMaterials(textures:T.Texture[]){
 const pixels=new Uint8Array(256*256*4);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const i=(y*256+x)*4,seam=x%64===0||y%64===0;
  const grain=Math.sin(x*18.31+y*39.73)*1.4+Math.sin(x*.054+y*.039)*1.2;
  const tile=((Math.floor(x/64)*7+Math.floor(y/64)*11)%5-2)*.65;
  pixels[i]=(seam?213:224)+grain+tile;pixels[i+1]=(seam?208:219)+grain+tile;pixels[i+2]=(seam?198:209)+grain+tile;pixels[i+3]=255;
 }
 const map=new T.DataTexture(pixels,256,256);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.needsUpdate=true;textures.push(map);
 const floor=new T.MeshStandardMaterial({name:'Office / continuous honed limestone / 1200 x 1800mm slabs',map,color:'#c0b8ac',roughness:.76,metalness:0});
 floor.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vOfficeWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOfficeWorld=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.fragmentShader='varying vec3 vOfficeWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\ndiffuseColor *= texture2D(map, vOfficeWorld.xz / vec2(4.8,7.2));\n#endif');
 };
 floor.customProgramCacheKey=()=> 'office-limestone-world-large-slabs-v2';
 // Original grain/roughness field: curved growth lines, fine pores and slow tone variation.
 const width=256,height=512,woodPixels=new Uint8Array(width*height*4),roughPixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,curved=x+12*Math.sin(y*.009)+5*Math.sin(y*.017+x*.009),growth=Math.sin(curved*.115+Math.sin(curved*.014+y*.004)*2.2),pores=-Math.pow(Math.abs(Math.sin(curved*.74+Math.sin(y*.029)*1.8)),12)*5,slow=Math.sin(x*.015+y*.005)*4,grain=growth*5+pores+slow+Math.sin(x*71.13+y*19.17)*.8;
  woodPixels[i]=148+grain;woodPixels[i+1]=111+grain*.92;woodPixels[i+2]=76+grain*.75;woodPixels[i+3]=255;
  const rough=196+growth*9+pores*1.7;roughPixels[i]=roughPixels[i+1]=roughPixels[i+2]=rough;roughPixels[i+3]=255;
 }
 const woodMap=new T.DataTexture(woodPixels,width,height),woodRoughnessMap=new T.DataTexture(roughPixels,width,height);woodMap.colorSpace=T.SRGBColorSpace;
 for(const texture of[woodMap,woodRoughnessMap]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.needsUpdate=true;textures.push(texture);}
 return {floor,woodMap,woodRoughnessMap,wall:'#e8e3da',joinery:'#987351',metal:'#343b3c',upholstery:'#aaa99c'};
}
