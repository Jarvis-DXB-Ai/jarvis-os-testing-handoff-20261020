import type {createOfficeScene as createLegacyScene,OfficeScene} from '../office-scene';
export type DemoSceneFactory=(...args:Parameters<typeof createLegacyScene>)=>OfficeScene;
/** The host retains its legacy lighting contract; this Demo has fixed lighting. */
export function adaptDemoScene(factory:DemoSceneFactory):DemoSceneFactory{
 return (...args)=>{
  if(args[6]?.simulation!==true)throw new Error('Demo tower requires simulation=true');
  const scene=factory(...args);
  return {...scene,setLighting:()=>{}};
 };
}
