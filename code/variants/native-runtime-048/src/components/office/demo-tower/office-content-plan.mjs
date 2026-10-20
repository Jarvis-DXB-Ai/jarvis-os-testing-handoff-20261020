// Rear-corner production and a centred two-row editorial neighbourhood.
export function contentStudioPlan(room){return {productionX:12,back:room.back+.05,bayCenters:[-4.6,4.6],bayWidth:6.4,cameraZ:room.back+7.65,storageX:8.7,storageZ:room.back+4.15,podcastX:-17,podcastZ:.7,productX:-15.8,productZ:5.4,reviewX:-12.5,reviewZ:-.6,editingDesks:room.desks};}
export function contentProductionRects(room){const p=contentStudioPlan(room),origin=p.productionX;return [
 ...p.bayCenters.flatMap(x=>[{name:'Seamless production bay',x:origin+x,z:p.back+2.9,width:p.bayWidth+.45,depth:5.8},{name:'Camera',x:origin+x,z:p.cameraZ,width:1.2,depth:1.2},{name:'Softbox',x:origin+x-p.bayWidth*.34,z:p.back+5,width:1.3,depth:1.3},{name:'Umbrella',x:origin+x+p.bayWidth*.34,z:p.back+5.5,width:1.3,depth:1.3}]),
 ...[-1,1].map(side=>({name:'Fitted equipment bank',x:origin+side*(p.storageX+.2),z:p.storageZ+1.3,width:1,depth:3.6})),
 {name:'Styling island',x:origin+7.2,z:p.cameraZ+2.1,width:2.8,depth:1},{name:'Capture cart',x:origin+2.15,z:.65,width:.9,depth:.8},
 {name:'Podcast set',x:p.podcastX,z:p.podcastZ,width:3.9,depth:2.9},{name:'Product capture zone',x:p.productX,z:p.productZ,width:5.2,depth:3.4},
 {name:'Backdrop grip bay',x:9.6,z:3.7,width:1,depth:2.2},{name:'Review perch',x:p.reviewX,z:p.reviewZ,width:2.3,depth:1},
 ...[[-12.2,-2.2],[6.8,5.4],[-11,6.4]].map(([x,z])=>({name:'Editorial planter',x,z,width:1.1,depth:1.1})),
 ];}
