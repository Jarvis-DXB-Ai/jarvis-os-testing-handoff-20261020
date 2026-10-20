import * as T from 'three';
import type {DubaiDaylight,OfficeLightingMode} from '@/lib/office-daylight.mjs';

/** Soft fixed studio daylight. Legacy mode requests cannot re-enable a moving sun. */
export function createOfficeLighting(scene:T.Scene,renderer:T.WebGLRenderer,lights:{sun:T.DirectionalLight;fill:T.DirectionalLight;hemi:T.HemisphereLight;strip:T.MeshBasicMaterial;warm:T.MeshBasicMaterial},onChange?:(state:DubaiDaylight)=>void){
 const {sun,fill,hemi,strip,warm}=lights;
 sun.position.set(-32,28,18);sun.intensity=2.15;sun.color.set('#fff0da');sun.shadow.radius=2.1;sun.shadow.normalBias=.015;sun.shadow.bias=-.00015;
 fill.position.set(28,24,-18);fill.intensity=.30;fill.color.set('#dde9f0');
 hemi.intensity=.48;hemi.color.set('#fff3e4');hemi.groundColor.set('#8c7f6c');
 strip.color.set('#f2eee4');warm.color.set('#ebddbd');scene.environmentIntensity=.30;
 scene.background=new T.Color('#edf2f3');scene.fog=new T.FogExp2('#edf2f3',.0018);renderer.toneMappingExposure=.83;
 const state:DubaiDaylight={mode:'midday',at:0,actual:0,phase:'Fixed soft daylight',elevation:58,azimuth:315,daylight:1,night:0,warmth:.08,sunVisible:false,windows:.1,sunDirection:[-24,42,22],sunrise:0,noon:0,sunset:0,date:'fixed'};
 onChange?.(state);
 return {update:()=>{},setMode:(mode:OfficeLightingMode)=>{void mode;onChange?.(state);},dispose:()=>{}};
}
