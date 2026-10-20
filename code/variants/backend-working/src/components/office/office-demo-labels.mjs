// Short display names; the full registered role remains on the accessible agent button.
const roleNames={
 'Head of Social Media':'Social Lead','Head of Finance':'Finance Lead','Head of Web Design':'Web Lead','Head of Ads':'Ads Lead','Head of Email Marketing':'Email Lead','Head of Customer Support & CRM':'Support Lead','Content Creative Director':'Content Lead','Graphic Design Creative Director':'Design Lead',
 'Content & Calendar Strategist':'Strategy','Copywriter & Content Adaptation':'Copywriter','Performance & Measurement Analyst':'Analytics','Publishing & Scheduling Specialist':'Publishing','Instagram Manager':'Instagram','LinkedIn Manager':'LinkedIn','Facebook Manager':'Facebook','Social Media QA':'Social QA',
 'AI Photographer':'Photographer','AI Videographer':'Videographer','Video Editor & Motion Designer':'Video Editor','Photo & Video QA':'Photo QA','Brand Identity & Visual Systems Designer':'Brand Design','Presentation Designer':'Slides','Brand Voice Specialist':'Brand Voice','Creative Quality Reviewer':'Creative QA',
 'Web & Backend Engineer':'Web Engineer','Integration Engineer':'Integrations','SEO & Website Auditor':'SEO Audit','Web & Backend QA':'Web QA','Paid Media Strategist':'Ad Strategy','Meta Ads Specialist':'Meta Ads','LinkedIn Ads Specialist':'LinkedIn Ads','YouTube Ads Specialist':'YouTube Ads','TikTok Ads Specialist':'TikTok Ads','Ads & Tracking QA':'Ads QA',
 'Email Copy & Automation Specialist':'Email Copy','Email Designer':'Email Design','Email Marketing QA':'Email QA','Social DM Support Specialist':'Social DMs','WhatsApp Support Specialist':'WhatsApp','CRM Specialist':'CRM','Bookings Coordinator':'Bookings','Customer Support QA':'Support QA',
 'Bookkeeping & Document Specialist':'Bookkeeping','Billing & Receivables Specialist':'Billing','Scope & Pricing Analyst':'Scope','Profitability & Cash-flow Analyst':'Cash Flow','Software & AI Spend Analyst':'AI Spend','Finance QA':'Finance QA',
};
export function demoRoleLabel(name){return roleNames[name]??name.replace(/ Specialist| Coordinator| Manager/g,'').replace(/^Head of /,'Lead · ').slice(0,14);}

// Captions share their agent's X anchor and clear real projected screens and people.
export function demoLabelPositions(items,width,height,obstacles=[],options={}){
 if(options.focused)return focusedLabels(items,width,height,obstacles);
 const nominal=width<=340?56:width<=500?72:88,h=width<=500?18:20,gap=4,placed=[],output=new Map();
 const intersects=(label,box,padding=0)=>label.x-label.width/2<box.x+box.width+padding&&label.x+label.width/2>box.x-padding&&label.y-h<box.y+box.height+padding&&label.y>box.y-padding;
 const relevant=obstacles.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x+r.width>0&&r.x<width&&r.y+r.height>0&&r.y<height);
 for(const item of [...items].sort((a,b)=>Number(Boolean(b.selected))-Number(Boolean(a.selected))||a.y-b.y||a.x-b.x)){
  const available=Math.min(item.x-4,width-4-item.x)*2,w=Math.min(nominal,available),limit=Math.min(item.y-9,item.monitor?item.monitor.y-8:Infinity),label={...item,x:item.x,y:limit,width:Math.max(0,w),height:h,muted:false};
  if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||w<32)label.muted=true;
  if(!label.muted){
   for(let pass=0;pass<relevant.length+placed.length+2;pass++){
    const obstacleHits=relevant.filter(r=>intersects(label,r,4)),labelHits=placed.filter(b=>intersects(label,{x:b.x-b.width/2,y:b.y-h,width:b.width,height:h},gap));
    if(!obstacleHits.length&&!labelHits.length)break;
    const next=Math.min(label.y,...obstacleHits.map(r=>r.y-6),...labelHits.map(b=>b.y-h-gap));if(next>=label.y-.01)break;label.y=next;
   }
   if(label.y-h<4||label.y>height-4||label.y<limit-20)label.muted=true;
  }
  if(!label.muted)placed.push(label);else label.y=limit;output.set(item.id,label);
 }
 return items.map(item=>output.get(item.id));
}

// Focused rooms expose every role. Size chips to their text and find the nearest
// clear callout around each head; overview density keeps the original rules.
function focusedLabels(items,width,height,obstacles){
 const h=width<=500?18:20,gap=4,placed=[],leaders=[],output=new Map();
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const relevant=obstacles.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0&&r.x+r.width>0&&r.x<width&&r.y+r.height>0&&r.y<height);
 const hits=(a,b,pad)=>a.x-a.width/2<b.x+b.width+pad&&a.x+a.width/2>b.x-pad&&a.y-h<b.y+b.height+pad&&a.y>b.y-pad;
 const callout=(item,label)=>({x1:label.x,y1:label.y-h>item.y?label.y-h:label.y,x2:item.x,y2:item.y-5});
 const crosses=(line,box)=>{
  let low=0,high=1;
  for(const [start,delta,min,max]of [[line.x1,line.x2-line.x1,box.x-2,box.x+box.width+2],[line.y1,line.y2-line.y1,box.y-2,box.y+box.height+2]]){
   if(Math.abs(delta)<.001){if(start<=min||start>=max)return false;continue;}
   const a=(min-start)/delta,b=(max-start)/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>=high)return false;
  }
  return true;
 };
 const ordered=[...items].sort((a,b)=>Number(Boolean(b.selected))-Number(Boolean(a.selected))||b.y-a.y||a.x-b.x||a.id.localeCompare(b.id));
 for(const item of ordered){
  const w=Math.min(width-8,Math.max(40,Number.isFinite(item.labelWidth)?item.labelWidth:80));
  if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||w<32||height<h+8){
   output.set(item.id,{...item,width:Math.max(0,w),height:h,muted:true});continue;
  }
  const limit=clamp(Math.min(item.y-9,item.monitor?item.monitor.y-8:Infinity),h+4,height-4);
  const xs=[...new Set([
   ...[0,-.55,.55,-1,1,-1.5,1.5].map(n=>item.x+n*w),
   ...relevant.flatMap(r=>[r.x-w/2-4,r.x+r.width+w/2+4]),
   ...placed.flatMap(l=>[l.x-(w+l.width)/2-gap,l.x+(w+l.width)/2+gap]),
  ].filter(x=>Math.abs(x-item.x)<=w*1.5).map(x=>clamp(x,w/2+4,width-w/2-4)))];
  const labelBoxes=placed.map(l=>({x:l.x-l.width/2,y:l.y-l.height,width:l.width,height:l.height}));
  const ys=[...new Set([
   limit,item.y-9,item.y+h+9,
   ...relevant.flatMap(r=>[r.y-6,r.y+r.height+h+6]),
   ...placed.flatMap(l=>[l.y-h-gap,l.y+h+gap]),
  ].filter(y=>y>=h+4&&y<=height-4))];
  const score=c=>Math.hypot(c.x-item.x,c.y-item.y+9)+Math.max(0,c.y-item.y)*.2;
  const clearsCallouts=c=>!labelBoxes.some(b=>crosses(callout(item,c),b))&&!leaders.some(line=>crosses(line,{x:c.x-w/2,y:c.y-h,width:w,height:h}));
  let position,best=Infinity;
  for(const x of xs)for(const y of ys){
   const candidate={x,y,width:w},cost=score(candidate);
   if(cost<best&&!relevant.some(r=>hits(candidate,r,4))&&!labelBoxes.some(b=>hits(candidate,b,gap))&&clearsCallouts(candidate)){position=candidate;best=cost;}
  }
  // With no clear scene slot, readable separated captions take priority over
  // furniture occlusion. A callout still connects the caption to its own head.
  if(!position){
   for(let y=h+4;y<=height-4;y+=h+gap)for(const x of xs){
    const candidate={x,y,width:w},cost=score(candidate);
    if(cost<best&&!labelBoxes.some(b=>hits(candidate,b,gap))){position=candidate;best=cost;}
   }
  }
  const label={...item,...(position??{x:clamp(item.x,w/2+4,width-w/2-4),y:limit}),width:w,height:h,muted:false};
  placed.push(label);leaders.push(callout(item,label));output.set(item.id,label);
 }
 return items.map(item=>output.get(item.id));
}
