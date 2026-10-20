/** NOAA General Solar Position equations, computed locally; no weather/network dependency.
 * Source: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * City-centre astronomical approximation; skyline occlusion/weather are not forecast.
 */
export const dubaiLocation=Object.freeze({name:'Dubai',latitude:25.2048,longitude:55.2708,timeZone:'Asia/Dubai',utcOffset:4});
const rad=Math.PI/180,day=86400000;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const smooth=(min,max,v)=>{const t=clamp((v-min)/(max-min),0,1);return t*t*(3-2*t);};
function solarTerms(ms){
 const d=new Date(ms),year=d.getUTCFullYear(),start=Date.UTC(year,0,1),days=(Date.UTC(year+1,0,1)-start)/day;
 const gamma=2*Math.PI/days*((ms-start)/day-.5);
 const equation=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
 const declination=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
 return {equation,declination};
}
export function dubaiSolarDay(value=Date.now()){
 const ms=Number(value);if(!Number.isFinite(ms)||!Number.isFinite(new Date(ms).getTime()))throw new TypeError('A valid timestamp is required.');
 const local=new Date(ms+dubaiLocation.utcOffset*3600000),midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate());
 const lat=dubaiLocation.latitude*rad,lon=dubaiLocation.longitude;
 let noon=midnight+(720-4*lon)*60000;
 for(let i=0;i<3;i++)noon=midnight+(720-4*lon-solarTerms(noon).equation)*60000;
 const event=(rising)=>{let time=noon+(rising?-6:6)*3600000;for(let i=0;i<3;i++){const {equation,declination}=solarTerms(time),ha=Math.acos(clamp(Math.cos(90.833*rad)/(Math.cos(lat)*Math.cos(declination))-Math.tan(lat)*Math.tan(declination),-1,1))/rad;time=midnight+(720-4*(lon+(rising?ha:-ha))-equation)*60000;}return time;};
 return {sunrise:event(true),noon,sunset:event(false),date:new Date(midnight).toISOString().slice(0,10)};
}
export function dubaiDaylight(value=Date.now(),mode='live'){
 const actual=Number(value),times=dubaiSolarDay(actual);
 const samples={sunrise:times.sunrise+8*60000,midday:times.noon,sunset:times.sunset-8*60000,night:times.sunset+3*3600000};
 if(mode!=='live'&&!Object.hasOwn(samples,mode))throw new TypeError('Unknown lighting preview.');
 const at=mode==='live'?actual:samples[mode],d=new Date(at),{equation,declination}=solarTerms(at),lat=dubaiLocation.latitude*rad;
 const minutes=d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;
 const hourAngle=(((minutes+equation+4*dubaiLocation.longitude)%1440+1440)%1440/4-180)*rad;
 const elevation=Math.asin(clamp(Math.sin(lat)*Math.sin(declination)+Math.cos(lat)*Math.cos(declination)*Math.cos(hourAngle),-1,1))/rad;
 const azimuth=(Math.atan2(Math.sin(hourAngle),Math.cos(hourAngle)*Math.sin(lat)-Math.tan(declination)*Math.cos(lat))/rad+180)%360;
 const daylight=smooth(-8,6,elevation),night=1-smooth(-8,-1,elevation),warmth=(1-smooth(1,19,elevation))*smooth(-8,-1,elevation);
 const phase=elevation<-6?'Night':elevation<12?(hourAngle<0?'Sunrise':'Sunset'):'Daylight';
 const altitude=elevation*rad,bearing=azimuth*rad;
 return {mode,at,actual,phase,elevation,azimuth,daylight,night,warmth,sunVisible:elevation>=-.833,windows:1-smooth(-4,8,elevation),sunDirection:[Math.cos(altitude)*Math.sin(bearing),Math.sin(altitude),-Math.cos(altitude)*Math.cos(bearing)],...times};
}
