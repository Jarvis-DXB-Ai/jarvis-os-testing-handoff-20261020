import{test}from'node:test';import assert from'node:assert/strict';import{artifactResponse}from'./lib/office-artifact-response.mjs';
const bytes=Buffer.from('0123456789');
test('verified video supports exact open/end/suffix byte ranges without altering source',()=>{
 for(const [range,status,body,contentRange]of [['bytes=0-1',206,'01','bytes 0-1/10'],['bytes=8-',206,'89','bytes 8-9/10'],['bytes=-3',206,'789','bytes 7-9/10'],['bytes=0-999',206,'0123456789','bytes 0-9/10']]){const r=artifactResponse('draft.mp4',bytes,{range});assert.equal(r.status,status);assert.equal(Buffer.from(r.body).toString(),body);assert.equal(r.headers['Content-Range'],contentRange);assert.equal(r.headers['Content-Length'],String(body.length));}
 assert.equal(bytes.toString(),'0123456789');const whole=artifactResponse('draft.mp4',bytes);assert.equal(whole.status,200);assert.equal(whole.headers['Content-Type'],'video/mp4');assert.equal(whole.headers['Accept-Ranges'],'bytes');assert.equal(whole.headers['X-Content-Type-Options'],'nosniff');assert.match(whole.headers['Content-Security-Policy'],/default-src 'none'; media-src 'self'/);assert.ok(!whole.headers['Content-Security-Policy'].includes('unsafe'));
});
test('unsatisfiable, malformed and multi ranges fail without bytes; HEAD has no body',()=>{
 for(const range of ['bytes=10-','bytes=5-3','bytes=-0','bytes=-','bytes=0-1,4-5','items=0-2','bytes=9999999999999999999999-']){const r=artifactResponse('draft.mp4',bytes,{range});assert.equal(r.status,416,range);assert.equal(r.body,null);assert.equal(r.headers['Content-Range'],'bytes */10');}
 const h=artifactResponse('draft.mp4',bytes,{method:'HEAD',range:'bytes=0-1'});assert.equal(h.status,200);assert.equal(h.body,null);assert.equal(h.headers['Content-Length'],'10');
});
test('other artifacts retain sandbox, download and cache protections',()=>{
 for(const file of ['edit.json','card.svg','scene.blend']){const r=artifactResponse(file,bytes,{range:'bytes=0-1'});assert.equal(r.status,200);assert.match(r.headers['Content-Disposition'],/^attachment/);assert.equal(r.headers['Content-Security-Policy'],"sandbox; default-src 'none'");assert.equal(r.headers['Cache-Control'],'no-store');}
 assert.equal(artifactResponse('frame-1.png',bytes).headers['Content-Type'],'image/png');
});
