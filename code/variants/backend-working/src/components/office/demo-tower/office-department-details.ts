import * as T from 'three';
import {departmentForRole} from '@/lib/office-departments';
/** Work objects sit on existing reserved furniture; no new floor obstacles or native capability. */
type Kit={m:Record<string,T.Material>;box:(p:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material,r?:number)=>T.Mesh;cylinder:(p:T.Object3D,r:number,h:number,x:number,y:number,z:number,m:T.Material,n?:number)=>T.Mesh;rod:(p:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,m?:T.Material)=>T.Mesh;paper:(p:T.Object3D,x:number,y:number,z:number,w?:number,d?:number,stack?:number)=>void;books:(p:T.Object3D,x:number,y:number,z:number,n?:number)=>void};
export function createDepartmentDetails(textures:T.Texture[],k:Kit){
 const {m,box,cylinder,rod}=k,V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z),cache=new Map<string,T.Material>();
 function print(kind:string){if(cache.has(kind))return cache.get(kind)!;const c=document.createElement('canvas');c.width=384;c.height=512;const a=c.getContext('2d')!;a.fillStyle=kind==='neon'?'#211e37':kind==='ticket'?'#d5c7a8':'#e0e7e9';a.fillRect(0,0,384,512);a.fillStyle=kind==='neon'?'#c8fd5b':'#293d4d';a.font='20px Arial';a.fillText('FICTIONAL / CONCEPT',22,38);
  if(kind.startsWith('email-')){a.fillStyle='#769baa';a.fillRect(24,88,336,145);a.fillStyle='#e1e9eb';a.font='bold 35px Arial';a.fillText(kind.slice(6).toUpperCase(),37,166);a.fillStyle='#324f60';for(let i=0;i<6;i++)a.fillRect(27,263+i*22,310-i%2*57,7);a.fillStyle='#6d8f9f';a.fillRect(27,409,197,25);}
  else if(kind.startsWith('ops-')){a.fillStyle='#324e60';a.font='bold 38px Arial';a.fillText(kind.slice(4).toUpperCase(),27,116);a.font='17px Arial';['SOURCE / VERSION','DEPENDENCY / NEXT STEP','REVIEW / OPEN QUESTIONS'].forEach((t,i)=>{a.fillText(t,27,180+i*86);for(let j=0;j<3;j++)a.fillRect(28,194+i*86+j*14,302-j*36,4);});}
  else if(kind==='moon'){a.beginPath();a.arc(198,225,104,0,Math.PI*2);a.fill();a.fillStyle='#e0e7e9';a.beginPath();a.arc(238,193,91,0,Math.PI*2);a.fill();a.fillStyle='#aa7452';for(let i=0;i<4;i++)a.fillRect(28+i*35,347-i*12,20,8);}
  else if(kind==='neon'){a.save();a.translate(192,250);a.rotate(-.16);a.font='bold 60px Arial';a.fillText('AFTER',-143,-30);a.strokeStyle='#b0d5e1';a.lineWidth=3;a.strokeText('DARK',-137,40);a.restore();}
  else if(kind==='ticket'){a.strokeStyle='#3c4c51';a.lineWidth=4;a.strokeRect(27,94,330,300);a.setLineDash([6,7]);a.beginPath();a.moveTo(294,96);a.lineTo(294,390);a.stroke();a.font='bold 36px Georgia';a.fillText('NIGHT',50,180);a.fillText('MARKET',50,223);for(let i=0;i<13;i++)a.fillRect(48+i*15,290,5,58);}
  else{a.fillStyle='#93b4c2';a.fillRect(28,98,328,190);a.fillStyle='#d9e6ec';a.beginPath();a.arc(190,188,65,0,Math.PI*2);a.fill();for(let i=0;i<4;i++)a.fillRect(29,325+i*26,290-i*25,7);}
  a.fillStyle=kind==='neon'?'#dbe8e9':'#344953';a.font='17px Arial';a.fillText(kind.startsWith('email-')?'COPY / LINKS / CONSENT CHECK':kind.startsWith('ops-')?'REFERENCE / HANDOFF / DRAFT':'DATE / VENUE / PRICE TBC',22,457);a.font='13px Arial';a.fillText('DRAFT · RIGHTS / FACTS / REVIEW',22,485);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;textures.push(map);const mat=new T.MeshBasicMaterial({map,name:'Department / '+kind+' fictional physical proof'});cache.set(kind,mat);return mat;
 }
 function sheet(p:T.Object3D,kind:string,x:number,y:number,z:number,w:number,h:number,flat=false){const q=new T.Group();q.position.set(x,y,z);if(flat)q.rotation.x=-Math.PI/2;p.add(q);box(q,w+.025,h+.025,.012,0,0,0,m.paper,.003);box(q,w,h,.003,0,0,.009,print(kind),.002);return q;}
 function frame(p:T.Object3D,x:number,y:number,z:number,w:number,h:number){for(const side of[-1,1]){box(p,.022,h,.018,x+side*w/2,y,z,m.silver,.004);box(p,w,.022,.018,x,y+side*h/2,z,m.silver,.004);}}
 function decorate(p:T.Object3D,id:string,kind:string,w:number,d:number){const features:string[]=[];
  if(id==='design'&&kind==='resource'){
   box(p,w*.7,1.64,.055,-w*.1,1.94,-.25,m.edge,.018);for(const x of[-w*.44,w*.24])box(p,.045,1.9,.06,x,1.81,-.28,m.silver,.008);
   for(let i=0;i<3;i++){const x=-w*.35+i*w*.205;sheet(p,['moon','neon','ticket'][i],x,1.95,-.211,1.32,1.39);for(const side of[-1,1])box(p,.16,.043,.008,x+side*.5,2.57,-.19,m.paper,.002);}
   for(let row=0;row<5;row++){box(p,2.0,.12,.55,-w*.3,.27+row*.135,.39,m.silver,.012);box(p,.3,.018,.03,-w*.3,.28+row*.135,.68,m.edge,.003);}for(let i=0;i<5;i++){const swatch=box(p,.27,.02,.4,w*.27+i*.14,.94+i*.012,.13,[m.paper,m.accent,m.silver,m.edge,m.cloth][i],.004);swatch.rotation.y=(i-2)*.09;}features.push('full-width taped moon/neon/ticket proof wall','five shallow flatfile drawers and fanned material swatches');
  }
  if(id==='design'&&kind==='bar'){sheet(p,'moon',-.3,.955,.1,1.2,.37,true);for(const x of[w*.34,w*.39]){const roll=cylinder(p,.075,.65,x,1.1,-.05,m.paper,16);roll.rotation.z=Math.PI/2;}features.push('actual sample print emerging at plotter feed','rolled stock and connected print-handling return');}
  if(id==='design'&&kind==='review'){
   for(let i=0;i<3;i++){const q=sheet(p,['moon','neon','ticket'][i],-.98+i*.98,.84,.02,.7,.96,true);q.rotation.z=(i-1)*.06;}box(p,2.6,.018,.025,0,.85,.51,m.silver,.003);for(let i=0;i<11;i++)box(p,.008,.007,.04,-1.2+i*.22,.864,.51,m.edge,.001);const knife=box(p,.17,.027,.036,1.13,.865,-.27,m.edge,.008);knife.rotation.y=.2;box(p,.045,.011,.013,1.21,.867,-.286,m.silver,.002);features.push('three distinct moon/neon/ticket flyer print concepts','cutting ruler and guarded craft knife');
  }
  if(id==='ads'&&kind==='review'){
   for(let i=0;i<3;i++){const q=sheet(p,['moon','neon','ticket'][i],-.88+i*.88,1.1,-.03,.56,.77);q.rotation.x=-.38;box(p,.59,.035,.32,-.88+i*.88,.84,.04,m.silver,.012);}box(p,.58,.055,.43,1.12,.85,.09,m.edge,.02);const clip=new T.Mesh(new T.TorusGeometry(.067,.012,6,12,Math.PI),m.silver);clip.position.set(1.12,.92,.06);p.add(clip);box(p,.17,.1,.06,1.12,.88,.09,m.silver,.01);features.push('physical three-route creative proposal easels','locked budget envelope awaiting owner');
  }
  if(id==='social'&&kind==='resource'){
   // Raised pin rails and removable vertical story cards, not a generic chart.
   for(let row=0;row<2;row++){box(p,w*.9,.025,.04,0,1.21+row*.49,.35,m.silver,.006);for(let i=0;i<5;i++){const x=(i-2)*w*.17;sheet(p,i%2?'neon':'moon',x,1.43+row*.49,.37,.42,.39);cylinder(p,.018,.015,x,1.65+row*.49,.39,m.accent,8);}}features.push('ten removable story/calendar cards and magnetic pin rails');
  }
  if(id==='social'&&kind==='bar'){
   for(const x of[-w*.34,w*.34]){cylinder(p,.11,.025,x,.94,.12,m.edge,16);rod(p,V(x,.95,.12),V(x,1.55,.12),.017,m.silver);frame(p,x,1.67,.13,.31,.57);}features.push('twin adjustable vertical phone framing clamps');
  }
  if(id==='web'&&kind==='bar'){
   const dock=new T.Group();dock.position.set(-w*.33,.36,.14);p.add(dock);box(dock,.57,.19,.32,0,.09,0,m.edge,.02);for(let i=0;i<6;i++){box(dock,.04,.03,.012,-.21+i*.083,.12,.171,m.silver,.003);rod(dock,V(-.2+i*.08,.12,.18),V(-.2+i*.08,.3,.22),.007,m.accent);}box(p,.38,.035,.21,w*.35,.94,.2,m.silver,.01);for(let i=0;i<4;i++)cylinder(p,.022,.025,w*.27+i*.052,.97,.19,m.edge,8);features.push('six-port test switch with patch leads','physical component-state test keypad');
  }
  if(id==='email'&&kind==='review'){
   for(let i=0;i<3;i++){const q=sheet(p,['email-welcome','email-value','email-recovery'][i],-.8+i*.79,.86,.04,.57,.78,true);q.rotation.z=.08-i*.08;box(p,.1,.013,.24,-.79+i*.79,.885,-.19,m.accent,.003);}for(let i=0;i<3;i++)box(p,.26,.045,.2,1.15,.85+i*.06,.17,m.silver,.012);features.push('fold-out newsletter/lifecycle paper proofs','three separate consent/segment card trays');
  }
  if(id==='support'&&kind==='review'){
   // A quiet consultation nook remains within the planned3.4×3.1m review footprint.
   box(p,w-.15,1.5,.075,0,.83,-d/2+.08,m.cloth,.035);for(const side of[-1,1]){box(p,.075,1.25,d-.3,side*(w/2-.08),.71,0,m.cloth,.035);box(p,.03,.05,d-.33,side*(w/2-.08),1.35,0,m.silver,.008);}k.paper(p,-.5,.86,.03,.4,.31,2);features.push('three-sided acoustic consultation screen with capped frame','enquiry qualification/source documents');
  }
  if(id==='finance'&&kind==='resource'){
   const x=-w*.36;box(p,.12,.28,.04,x+.31,1.18,.397,m.edge,.012);for(let i=0;i<9;i++)cylinder(p,.012,.012,x+.276+i%3*.033,1.1+Math.floor(i/3)*.05,.425,m.silver,8);for(const y of[.42,1.62])box(p,.045,.12,.04,x-.55,y,.397,m.edge,.005);features.push('hinged lockable records cabinet with keypad');
  }
  if(id==='finance'&&kind==='bar'){
   const lid=box(p,.68,.025,.43,-w*.23,1.35,-.15,m.silver,.015);lid.rotation.x=-.44;sheet(p,'proof',w*.2,.96,.12,.4,.54,true);features.push('open scanner lid over source document','physical source-to-quote reconciliation sheet');
  }
  if(features.length)p.userData.taskDetail={department:id,kind,features,placement:'Inside existing reserved programme furniture envelope'};
 }
 function core(p:T.Object3D,id:string){
  const q=new T.Group();q.position.set(0,0,-6.25);p.add(q);if(id==='operations'){for(let i=0;i<4;i++){const xx=-2+i*1.32;sheet(q,['ops-brief','ops-draft','ops-review','ops-owner'][i],xx,1.85,.05,1.05,.73);box(q,1.12,.025,.05,xx,1.43,.08,m.silver,.006);if(i<3)rod(q,V(xx+.57,1.82,.07),V(xx+.72,1.82,.07),.014,m.accent);}q.name='Operations / physical brief-draft-review-owner dependency rail';}
  else{for(let i=0;i<3;i++){const book=new T.Group();book.position.set(-1.6+i*1.4,.95,.05);book.rotation.x=-.6;q.add(book);for(const side of[-1,1]){const leaf=box(book,.51,.018,.38,side*.255,0,0,m.paper,.004);leaf.rotation.z=side*.12;}for(let j=0;j<3;j++)box(book,.11,.013,.22,-.34+j*.15,.035,.18,m.accent,.003);}q.name='Research / open source volumes and provenance tabs';}return q;
 }
 function roleScreen(role:string){
  const c=document.createElement('canvas');c.width=512;c.height=320;const a=c.getContext('2d')!,dept=departmentForRole(role)?.id??'operations';a.fillStyle='#182a36';a.fillRect(0,0,512,320);a.fillStyle='#bdced7';a.font='16px Arial';a.fillText('SCRIPTED DRAFT / '+role.toUpperCase().replaceAll('-',' '),18,28);a.fillStyle='#728f9f';a.font='12px Arial';a.fillText('FICTIONAL REFERENCE · NO LIVE ACCOUNT',18,49);
  if(dept==='content'){
   if(['video','media','videographer'].includes(role)){for(let i=0;i<3;i++){a.fillStyle=['#65899b','#b0bec5','#8b9eaa'][i];a.fillRect(18+i*163,70,149,123);a.fillStyle='#263d4b';a.beginPath();a.arc(89+i*163,122,31,0,Math.PI*2);a.fill();}for(let row=0;row<3;row++)for(let i=0;i<6;i++){a.fillStyle=['#8fa9b6','#b4c3cf','#57768c'][(row+i)%3];a.fillRect(22+i*77,219+row*24,70-i%2*8,16);}a.fillStyle='#d2e1e8';a.fillRect(253,209,2,90);}
   else{a.fillStyle='#b0c5cf';a.fillRect(23,72,466,184);a.fillStyle='#3d5668';a.beginPath();a.moveTo(129,119);a.lineTo(343,119);a.lineTo(392,217);a.lineTo(80,217);a.closePath();a.fill();a.strokeStyle='#d1dce2';a.lineWidth=4;for(const x of[171,251]){a.beginPath();a.moveTo(x,121);a.lineTo(x-12,214);a.stroke();}a.fillStyle='#98b1bf';a.fillRect(21,277,280,9);}
  }else if(dept==='web'){
   for(let i=0;i<3;i++){a.fillStyle=['#a4c5cf','#647e96','#b3c0ca'][i];a.fillRect(20+i*164,76,149,91);a.fillStyle='#1b3545';a.font='14px Arial';a.fillText(['INPUT','ERROR','CHECKED'][i],31+i*164,101);}a.font='14px monospace';a.fillStyle='#d7e5eb';['validate(source);','preserveVersion();','requestReview();','// illustrative component states'].forEach((t,i)=>a.fillText(t,22,208+i*25));
  }else if(dept==='social'){
   for(let day=0;day<5;day++){a.fillStyle='#9ab4c5';a.font='11px Arial';a.fillText(['MON','TUE','WED','THU','FRI'][day],24+day*98,80);for(let row=0;row<2;row++){a.fillStyle=['#7797a8','#bdcbd3','#526f83'][(row+day)%3];a.fillRect(20+day*98,96+row*93,84,79);a.fillStyle='#263f51';a.fillRect(29+day*98,110+row*93,65,37);}}a.fillStyle='#d1e0e9';a.fillText('STORY / COPY / RIGHTS / REVIEW',22,303);
  }else if(dept==='ads'||dept==='design'){
   ['moon','neon','ticket'].forEach((kind,i)=>{const material=print(kind)as T.MeshBasicMaterial;const image=(material.map!.image as HTMLCanvasElement);a.drawImage(image,23+i*164,70,141,188);});a.fillStyle='#c8dce5';a.font='14px Arial';a.fillText(dept==='ads'?'A / B / C · PROPOSAL · BUDGET HELD':'THREE CONCEPTS · PROOF / FACT CHECK',21,295);
  }else if(dept==='email'){
   for(let i=0;i<3;i++){a.fillStyle='#e0e8e9';a.fillRect(25+i*161,77,139,203);a.fillStyle=['#94b8c5','#657d9b','#afc7d0'][i];a.fillRect(35+i*161,92,119,71);for(let row=0;row<4;row++)a.fillRect(35+i*161,184+row*19,100-row%2*15,5);}a.fillStyle='#cedce3';a.font='11px Arial';a.fillText('WELCOME → VALUE → RECOVERY / DRAFT',22,304);
  }else{
   const labels=dept==='finance'?['SOURCE','SCOPE','RECONCILE']:dept==='support'?['QUALIFY','MISSING FACTS','ESCALATE']:dept==='knowledge'?['SOURCE A','VERIFY','NOTES']:['BRIEF','REVIEW','OWNER'];
   for(let i=0;i<3;i++){a.fillStyle=['#cad8dd','#9ab3c3','#7898aa'][i];a.fillRect(21+i*164,77,145,203);a.fillStyle='#304b5c';a.font='13px Arial';a.fillText(labels[i],29+i*164,105);for(let row=0;row<6;row++)a.fillRect(30+i*164,131+row*22,113-row%2*19,5);}a.fillStyle='#c2d4dd';a.font='12px Arial';a.fillText('SOURCE-BOUND SAMPLE / CHECK BEFORE HANDOFF',20,307);
  }
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;textures.push(map);return map;
 }
 return {decorate,core,roleScreen};
}
