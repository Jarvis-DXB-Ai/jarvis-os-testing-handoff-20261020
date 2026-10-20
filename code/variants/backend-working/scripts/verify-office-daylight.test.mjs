import {test} from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {dubaiDaylight,dubaiSolarDay} from '../src/lib/office-daylight.mjs';
import {createOfficeLighting} from '../src/components/office/office-lighting.ts';
const date=Date.parse('2026-10-14T08:00:00Z');
test('Dubai sunrise, noon and sunset follow the date, geography and seasonal day length',()=>{
 const s=dubaiSolarDay(date),localMinute=at=>{const d=new Date(at+4*3600000);return d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;};
 assert.equal(s.date,'2026-10-14');assert(Math.abs(localMinute(s.sunrise)-(6*60+16))<2);assert(Math.abs(localMinute(s.sunset)-(17*60+53))<2);assert(Math.abs(localMinute(s.noon)-(12*60+5))<2);
 const summer=dubaiSolarDay(Date.parse('2026-06-21T08:00:00Z')),winter=dubaiSolarDay(Date.parse('2026-12-21T08:00:00Z'));
 assert(summer.sunset-summer.sunrise>winter.sunset-winter.sunrise+2*3600000);
 assert.notEqual(dubaiSolarDay(date+86400000).sunset-s.sunset,86400000);
});
test('solar elevation, azimuth and horizon crossing remain smooth with correct morning/evening direction',()=>{
 const times=dubaiSolarDay(date),rise=dubaiDaylight(times.sunrise),set=dubaiDaylight(times.sunset);
 assert(Math.abs(rise.elevation+.833)<.02);assert(Math.abs(set.elevation+.833)<.02);
 assert(rise.azimuth>80&&rise.azimuth<115);assert(set.azimuth>245&&set.azimuth<280);
 assert.equal(dubaiDaylight(times.sunset-60000).sunVisible,true);assert.equal(dubaiDaylight(times.sunset+60000).sunVisible,false);
 const earlier=dubaiDaylight(times.sunset-1000),later=dubaiDaylight(times.sunset+1000);
 for(const key of ['daylight','night','warmth','windows'])assert(Math.abs(later[key]-earlier[key])<.005);
 for(const mode of ['live','sunrise','midday','sunset','night']){const v=dubaiDaylight(date,mode);assert(v.sunDirection.every(Number.isFinite));assert(Math.abs(Math.hypot(...v.sunDirection)-1)<1e-9);}
});
test('Dubai local date crosses UTC boundaries and calculations ignore the host timezone',()=>{
 assert.equal(dubaiSolarDay(Date.parse('2026-10-13T21:00:00Z')).date,'2026-10-14');
 assert.equal(dubaiSolarDay(Date.parse('2028-02-29T08:00:00Z')).date,'2028-02-29');
 const old=process.env.TZ,baseline=dubaiDaylight(date);try{for(const tz of ['UTC','America/Los_Angeles','Asia/Tokyo']){process.env.TZ=tz;assert.deepEqual(dubaiDaylight(date),baseline);}}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
 assert.throws(()=>dubaiSolarDay(NaN));assert.throws(()=>dubaiDaylight(date,'invalid'));
});
test('night practical lighting and live-time restoration do not depend on any demo animation clock',t=>{
 let clock=date;t.mock.method(Date,'now',()=>clock);
 const scene=new T.Scene();scene.background=new T.Color('#000');scene.fog=new T.FogExp2('#fff',.002);
 const lights={sun:new T.DirectionalLight(),fill:new T.DirectionalLight(),hemi:new T.HemisphereLight(),strip:new T.MeshBasicMaterial(),warm:new T.MeshBasicMaterial()},renderer={toneMappingExposure:1};let state,lastReading;
 const lighting=createOfficeLighting(scene,renderer,{setDaylight:v=>{state=v;}},lights,v=>{lastReading=v;});t.after(()=>{lighting.dispose();lights.strip.dispose();lights.warm.dispose();});
 const dayStrength=lights.sun.intensity;lighting.setMode('night');for(let i=0;i<180;i++)lighting.update();
 assert(state.night>.99);assert(lights.sun.intensity<.001);assert(scene.getObjectByName('Sparse night stars').material.opacity>.5);assert(scene.children.filter(o=>o.name==='Office practical lighting').every(l=>l.intensity>11));
 lighting.setMode('live');for(let i=0;i<180;i++)lighting.update();assert.equal(lastReading.mode,'live');assert(lights.sun.intensity>dayStrength*.99);
 clock=Date.parse('2026-10-14T17:00:00Z');for(let i=0;i<180;i++)lighting.update();assert.equal(lastReading.at,clock);assert(state.night>.99);assert(lights.sun.intensity<.001);
});
