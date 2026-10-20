import {test}from'node:test';import assert from'node:assert/strict';import{deliveryEvidence}from'./lib/office-delivery-evidence.mjs';
test('pixel inspection receipts are review inputs rather than claimed creative exports',()=>{
 const image={id:'view',status:'completed',fixture:false,tool:'image_view',files:[{name:'inspection.png',sha256:'preview'}],result:{source:{sha256:'original'},width:512,height:256,sourceHasAlpha:true,previewBackground:'#161616'}},creation={id:'create',status:'completed',fixture:false,tool:'graphic_card',files:[{name:'card.png'}]};
 const e=deliveryEvidence({id:'task',steps:[],calls:[],status:'answered'},[image,creation,{...image,id:'fixture',fixture:true},{...image,id:'failed',status:'failed'}]);
 assert.deepEqual(e.exports.map(r=>r.id),['create']);assert.equal(e.visualInspections.length,1);assert.equal(e.visualInspections[0].source.sha256,'original');assert.equal(e.visualInspections[0].preview.background,'#161616');assert.equal(e.visualInspections[0].status,'pixels-delivered-not-quality-approved');assert.equal(e.ownerReview.status,'pending');assert.equal(e.quality.final.status,'not-assessed');
});
