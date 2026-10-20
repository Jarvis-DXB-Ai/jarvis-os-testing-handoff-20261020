import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {localTestConfig} from './isolated-home-config.mjs';
const c=localTestConfig();
const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==','base64');
const key=`TEST-security/${randomUUID()}.png`;
for(const bucket of ['guest-models','thumbnails']) {
 const {data:existing,error:lookup}=await db.storage.getBucket(bucket);
 if(!existing) { const result=await db.storage.createBucket(bucket,{public:false});assert.ifError(result.error); }
 else {const result=await db.storage.updateBucket(bucket,{public:false});assert.ifError(result.error);}
 try {
  assert.ifError((await db.storage.from(bucket).upload(key,bytes,{contentType:'image/png'})).error);
  const publicRead=await fetch(`${c.API_URL}/storage/v1/object/public/${bucket}/${key}`);
  assert.equal(publicRead.ok,false,'Public URLs must no longer disclose private media');
  const owner=await fetch(`http://127.0.0.1:3101/api/owner-media/${bucket}/${key}`);
  assert.equal(owner.status,200);assert.deepEqual(Buffer.from(await owner.arrayBuffer()),bytes);
  assert.match(owner.headers.get('cache-control'),/private.*no-store/);
  const anonymous=createClient(c.API_URL,c.ANON_KEY,{auth:{persistSession:false}});
  assert.ok((await anonymous.storage.from(bucket).download(key)).error);
  assert.ok((await anonymous.storage.from(bucket).upload(key+'.blocked',bytes)).error);
 } finally {assert.ifError((await db.storage.from(bucket).remove([key])).error);}
}
console.log('PASS: both media buckets deny public and anonymous access; owner media returns exact uploaded bytes without shared caching.');
