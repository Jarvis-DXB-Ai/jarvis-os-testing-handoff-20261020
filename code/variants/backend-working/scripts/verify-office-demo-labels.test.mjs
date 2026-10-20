import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoLabelPositions,demoRoleLabel} from '../src/components/office/office-demo-labels.mjs';
test('phone and desktop chips remain directly above their own heads and avoid overlap',()=>{
 for(const [width,height]of[[320,607],[390,607],[430,607],[900,600]]){
  const items=Array.from({length:9},(_,i)=>({id:String(i),x:width*(.2+(i%3)*.3),y:210+Math.floor(i/3)*85})),labels=demoLabelPositions(items,width,height);
  assert.equal(labels.length,9);assert.ok(labels.every(l=>!l.muted));
  for(const a of labels){const head=items.find(i=>i.id===a.id);assert.equal(a.x,head.x);assert.equal(a.y,head.y-9);assert.ok(a.width<=88&&a.height<=20);assert.ok(a.x-a.width/2>=4&&a.x+a.width/2<=width-4);for(const b of labels)if(a!==b)assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.y-b.y)>=a.height);}
 }
});
test('occluded agents retain their own anchors and accessible records instead of displaced grid labels',()=>{
 const items=Array.from({length:9},(_,i)=>({id:String(i),x:195,y:300,selected:i===8})),labels=demoLabelPositions(items,390,607);
 assert.equal(labels.length,9);assert.equal(labels.filter(l=>!l.muted).length,1);assert.equal(labels.find(l=>!l.muted).id,'8');assert.ok(labels.every(l=>l.x===195&&l.y===291));
});
test('compact captions preserve useful role distinctions and full names are not modified',()=>{
 assert.equal(demoRoleLabel('Head of Finance'),'Finance Lead');assert.equal(demoRoleLabel('Bookkeeping & Document Specialist'),'Bookkeeping');assert.equal(demoRoleLabel('Billing & Receivables Specialist'),'Billing');assert.equal(demoRoleLabel('Finance QA'),'Finance QA');assert.equal(demoRoleLabel('Maya'),'Maya');
});

test('captions clear their own screen and nearby projected bodies without changing agent X',()=>{
 const item={id:'a',x:120,y:250,monitor:{x:90,y:217,width:60,height:35}},body={x:80,y:199,width:30,height:25};
 const label=demoLabelPositions([item],390,607,[item.monitor,body])[0];assert.equal(label.x,item.x);assert.ok(label.y<=209);assert.ok(label.y<=193);assert.equal(label.muted,false);
});

const overlaps=(a,b,pad=0)=>a.x-a.width/2<b.x+b.width+pad&&a.x+a.width/2>b.x-pad&&a.y-a.height<b.y+b.height+pad&&a.y>b.y-pad;
function checkFocused(items,width,height,obstacles){
 const labels=demoLabelPositions(items,width,height,obstacles,{focused:true});
 assert.deepEqual(labels.map(l=>l.id),items.map(i=>i.id));
 for(const l of labels){
  assert.equal(l.muted,false,l.id);assert.ok(l.x-l.width/2>=4&&l.x+l.width/2<=width-4);assert.ok(l.y-l.height>=4&&l.y<=height-4);
  for(const b of labels)if(l!==b)assert.ok(!overlaps(l,{x:b.x-b.width/2,y:b.y-b.height,width:b.width,height:b.height}),`${l.id} overlaps ${b.id}`);
 }
 return labels;
}

test('desktop-social: every focused role survives the captured occlusion regression',()=>{
 const items=[{"id":"demo:cmo","x":315.073,"y":209.72,"labelWidth":67,"monitor":{"height":20.156,"width":37.833,"x":301.054,"y":187.137},"body":{"height":56.27,"width":31.709,"x":302.265,"y":205.638}},{"id":"demo:grid-planner","x":575.623,"y":209.72,"labelWidth":54,"monitor":{"height":20.156,"width":38.541,"x":549.993,"y":187.137},"body":{"height":57.359,"width":39.247,"x":550.038,"y":205.34}},{"id":"demo:copy","x":295.884,"y":294.611,"labelWidth":63,"monitor":{"height":21.676,"width":44.333,"x":280.353,"y":264.845},"body":{"height":66.111,"width":37.404,"x":281.362,"y":284.965}},{"id":"demo:scheduler","x":451.971,"y":413.89,"labelWidth":62,"monitor":{"height":23.006,"width":49.578,"x":426.101,"y":372.469},"body":{"height":76.612,"width":42.648,"x":428.706,"y":398.534}},{"id":"demo:analytics","x":635.02,"y":413.89,"labelWidth":56,"monitor":{"height":23.006,"width":54.857,"x":595.265,"y":372.469},"body":{"height":77.694,"width":58.971,"x":594.687,"y":398.242}},{"id":"demo:instagram","x":448.102,"y":294.611,"labelWidth":60,"monitor":{"height":21.676,"width":41.557,"x":426.57,"y":264.845},"body":{"height":64.613,"width":35.43,"x":428.789,"y":287.027}},{"id":"demo:linkedin","x":600.319,"y":294.611,"labelWidth":54,"monitor":{"height":21.676,"width":45.284,"x":569.061,"y":264.845},"body":{"height":65.827,"width":47.139,"x":568.98,"y":286.365}},{"id":"demo:facebook","x":268.921,"y":413.89,"labelWidth":60,"monitor":{"height":23.006,"width":53.509,"x":251.66,"y":372.469},"body":{"height":75.781,"width":44.895,"x":252.95,"y":398.623}},{"id":"demo:social-qa","x":445.348,"y":209.72,"labelWidth":60,"monitor":{"height":20.156,"width":35.769,"x":426.909,"y":187.137},"body":{"height":56.78,"width":30.643,"x":428.708,"y":205.535}}];
 const obstacles=items.flatMap(i=>[i.monitor,i.body]);
 assert.ok(demoLabelPositions(items,858,563.40625,obstacles).some(l=>l.muted));
 const labels=checkFocused(items,858,563.40625,obstacles);
 for(const l of labels){assert.ok(!obstacles.some(o=>overlaps(l,o)));assert.ok(Math.hypot(l.x-items.find(i=>i.id===l.id).x,l.y-items.find(i=>i.id===l.id).y)<100);}
});

test('mobile-social: every focused role survives the captured occlusion regression',()=>{
 const items=[{"id":"demo:cmo","x":137.866,"y":258.427,"labelWidth":62,"monitor":{"height":9.93,"width":18.781,"x":129.682,"y":246.208},"body":{"height":28.668,"width":15.519,"x":130.578,"y":255.695}},{"id":"demo:grid-planner","x":268.531,"y":258.427,"labelWidth":50,"monitor":{"height":9.93,"width":18.959,"x":257.485,"y":246.208},"body":{"height":29.23,"width":17.8,"x":257.843,"y":255.546}},{"id":"demo:copy","x":133.625,"y":300.447,"labelWidth":58,"monitor":{"height":10.252,"width":20.19,"x":124.919,"y":286.548},"body":{"height":31.303,"width":16.674,"x":125.837,"y":296.035}},{"id":"demo:scheduler","x":204.513,"y":349.205,"labelWidth":57,"monitor":{"height":10.557,"width":21.133,"x":193.764,"y":333.226},"body":{"height":33.089,"width":17.766,"x":194.876,"y":344.262}},{"id":"demo:analytics","x":280.323,"y":349.205,"labelWidth":52,"monitor":{"height":10.557,"width":22.067,"x":267.188,"y":333.226},"body":{"height":33.504,"width":20.984,"x":267.549,"y":344.136}},{"id":"demo:instagram","x":203.807,"y":300.447,"labelWidth":56,"monitor":{"height":10.252,"width":19.592,"x":193.855,"y":286.548},"body":{"height":30.581,"width":16.415,"x":194.901,"y":297.009}},{"id":"demo:linkedin","x":273.989,"y":300.447,"labelWidth":50,"monitor":{"height":10.252,"width":20.396,"x":261.987,"y":286.548},"body":{"height":31.139,"width":19.239,"x":262.399,"y":296.697}},{"id":"demo:facebook","x":128.704,"y":349.205,"labelWidth":55,"monitor":{"height":10.557,"width":21.828,"x":119.407,"y":333.226},"body":{"height":32.779,"width":17.911,"x":120.467,"y":344.303}},{"id":"demo:social-qa","x":203.199,"y":258.427,"labelWidth":56,"monitor":{"height":9.93,"width":18.261,"x":193.932,"y":246.208},"body":{"height":28.931,"width":15.423,"x":194.852,"y":255.645}}];
 const obstacles=items.flatMap(i=>[i.monitor,i.body]);
 assert.ok(demoLabelPositions(items,390,589,obstacles).some(l=>l.muted));
 const labels=checkFocused(items,390,589,obstacles);
 for(const l of labels){assert.ok(!obstacles.some(o=>overlaps(l,o)));assert.ok(Math.hypot(l.x-items.find(i=>i.id===l.id).x,l.y-items.find(i=>i.id===l.id).y)<100);}
});

test('focused fallback separates coincident captions even when furniture fills the view',()=>{
 const items=Array.from({length:9},(_,i)=>({id:String(i),x:195,y:300,labelWidth:50+i*2,selected:i===8}));
 const labels=checkFocused(items,390,607,[{x:0,y:0,width:390,height:607}]);
 assert.deepEqual(demoLabelPositions([...items].reverse(),390,607,[{x:0,y:0,width:390,height:607}],{focused:true}).reverse(),labels);
 assert.ok(labels.every(l=>l.width===items.find(i=>i.id===l.id).labelWidth));
});
test('invalid projected coordinates and unusable layers stay hidden without invalid CSS',()=>{
 for(const [items,w,h]of[[[{id:'bad',x:NaN,y:200}],390,607],[[{id:'tiny',x:12,y:20}],30,50],[[{id:'short',x:50,y:20}],100,20]])assert.equal(demoLabelPositions(items,w,h,[],{focused:true})[0].muted,true);
});
